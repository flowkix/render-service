'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { judgeEvFidelity, withFidelityGate, parseVerdict, CORRECTIVE_PREFIX } = require('./fidelity-gate')
const { runWithUsageRecorder, recordImageUsage } = require('../../ai-credits/usage-recorder')

const engineConfig = { scorer: { model: 'judge-primary', fallbackModels: ['judge-fallback'] } }
const IMG = Buffer.from('\x89PNG generated')
const REF = Buffer.from('\xff\xd8 reference')

function judgeResponse(json) {
  return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] } }
}

// ---------- judgeEvFidelity ----------

test('judge: parses a pass verdict and reports which model answered', async () => {
  const http = { post: async () => judgeResponse({ pass: true, structure_match: 5, reason: 'same micro-truck' }) }
  const v = await judgeEvFidelity({ imageBuffer: IMG, rawRefBuffer: REF, engineConfig, apiKey: 'k', http })
  assert.deepStrictEqual(v, { pass: true, judged: true, score: 5, reason: 'same micro-truck', model: 'judge-primary' })
})

test('judge: sends the generated image first and the raw reference second, structure-only question, temperature 0 JSON', async () => {
  let sent
  const http = { post: async (url, body) => { sent = { url, body }; return judgeResponse({ pass: false, structure_match: 1, reason: 'box van' }) } }
  const v = await judgeEvFidelity({ imageBuffer: IMG, rawRefBuffer: REF, engineConfig, apiKey: 'k', http })
  assert.strictEqual(v.pass, false)
  assert.strictEqual(v.score, 1)
  assert.ok(sent.url.includes('/models/judge-primary:generateContent'))
  const parts = sent.body.contents[0].parts
  assert.strictEqual(parts.length, 3)
  assert.ok(/IMAGE 1 = the generated image/.test(parts[0].text))
  assert.ok(/IGNORE branding, logos/.test(parts[0].text), 'question must be structure-only')
  assert.strictEqual(parts[1].inlineData.data, IMG.toString('base64'))
  assert.strictEqual(parts[2].inlineData.data, REF.toString('base64'))
  assert.deepStrictEqual(sent.body.generationConfig, { responseMimeType: 'application/json', temperature: 0 })
})

test('judge: falls back to the next model on a non-retryable error', async () => {
  const urls = []
  const http = {
    post: async url => {
      urls.push(url)
      if (url.includes('judge-primary')) { const e = new Error('404'); e.response = { status: 404 }; throw e }
      return judgeResponse({ pass: true, structure_match: 4, reason: 'ok' })
    },
  }
  const v = await judgeEvFidelity({ imageBuffer: IMG, rawRefBuffer: REF, engineConfig, apiKey: 'k', http })
  assert.strictEqual(v.model, 'judge-fallback')
  assert.strictEqual(urls.length, 2)
})

test('judge: fails OPEN (pass, judged=false) when no key, when every model errors, and on garbage output', async () => {
  const noKey = await judgeEvFidelity({ imageBuffer: IMG, rawRefBuffer: REF, engineConfig, apiKey: '', http: { post: async () => { throw new Error('must not be called') } } })
  assert.deepStrictEqual({ pass: noKey.pass, judged: noKey.judged }, { pass: true, judged: false })

  const allDown = await judgeEvFidelity({ imageBuffer: IMG, rawRefBuffer: REF, engineConfig, apiKey: 'k', http: { post: async () => { const e = new Error('500'); e.response = { status: 500 }; throw e } } })
  assert.deepStrictEqual({ pass: allDown.pass, judged: allDown.judged }, { pass: true, judged: false })

  const garbage = await judgeEvFidelity({ imageBuffer: IMG, rawRefBuffer: REF, engineConfig, apiKey: 'k', http: { post: async () => ({ data: { candidates: [{ content: { parts: [{ text: 'not json' }] } }] } }) } })
  assert.deepStrictEqual({ pass: garbage.pass, judged: garbage.judged }, { pass: true, judged: false })
})

test('parseVerdict: strips code fences, clamps score, requires boolean pass', () => {
  assert.deepStrictEqual(parseVerdict('```json\n{"pass":false,"structure_match":9,"reason":"x"}\n```'), { pass: false, score: 5, reason: 'x' })
  assert.throws(() => parseVerdict('{"reason":"no pass field"}'))
})

// ---------- withFidelityGate ----------

function fakeGenerate(log) {
  // Simulates a pipeline attempt that records one paid branding + one paid scene stage.
  return async (attempt, ctx) => {
    log.push({ attempt, ctx })
    recordImageUsage({ stage: 'branding', model: 'm', resolution: '2K' })
    recordImageUsage({ stage: 'simple-scene', model: 'm', resolution: '2K' })
    return { branding: { buffer: Buffer.from('b') }, scene: { buffer: Buffer.from(`scene-${attempt}`), meta: { attempt } } }
  }
}

test('gate: passes first time → 1 attempt, no corrective prefix, exactly that attempt billed', async () => {
  const log = []
  const out = await runWithUsageRecorder(() =>
    withFidelityGate({ gateConfig: { enabled: true, maxAttempts: 3 }, generate: fakeGenerate(log), judge: async () => ({ pass: true, judged: true, score: 5, reason: 'ok' }) })
  )
  assert.strictEqual(out.error, null)
  assert.strictEqual(log.length, 1)
  assert.deepStrictEqual(log[0].ctx, { correctivePrefix: '', forceCreate: false })
  assert.deepStrictEqual(out.result.qa, { passed: true, judged: true, attempts: 1, reason: 'ok', score: 5 })
  assert.strictEqual(out.stages.length, 2, 'one branding + one scene stage billed')
})

test('gate: fail then pass → 2 attempts, retry carries the corrective prefix and forceCreate, only the delivered attempt billed', async () => {
  const log = []
  let calls = 0
  const judge = async () => (++calls === 1 ? { pass: false, judged: true, score: 1, reason: 'box van' } : { pass: true, judged: true, score: 5, reason: 'ok' })
  const out = await runWithUsageRecorder(() =>
    withFidelityGate({ gateConfig: { enabled: true, maxAttempts: 3 }, generate: fakeGenerate(log), judge })
  )
  assert.strictEqual(log.length, 2)
  assert.deepStrictEqual(log[1].ctx, { correctivePrefix: CORRECTIVE_PREFIX, forceCreate: true })
  assert.strictEqual(out.result.scene.meta.attempt, 2)
  assert.deepStrictEqual(out.result.qa, { passed: true, judged: true, attempts: 2, reason: 'ok', score: 5 })
  assert.strictEqual(out.stages.length, 2, 'the rejected attempt must NOT be billed')
})

test('gate: every attempt fails → delivers the best-scoring attempt flagged passed=false, billed once', async () => {
  const log = []
  const scores = [2, 4, 3]
  let i = 0
  const judge = async () => ({ pass: false, judged: true, score: scores[i++], reason: `fail-${i}` })
  const out = await runWithUsageRecorder(() =>
    withFidelityGate({ gateConfig: { enabled: true, maxAttempts: 3 }, generate: fakeGenerate(log), judge })
  )
  assert.strictEqual(log.length, 3)
  assert.strictEqual(out.result.scene.meta.attempt, 2, 'attempt 2 had the best structure_match')
  assert.deepStrictEqual(out.result.qa, { passed: false, judged: true, attempts: 3, reason: 'fail-2', score: 4 })
  assert.strictEqual(out.stages.length, 2)
})

test('gate: judge unavailable → ships attempt 1 unjudged (fail-open), no retry', async () => {
  const log = []
  const out = await runWithUsageRecorder(() =>
    withFidelityGate({ gateConfig: { enabled: true, maxAttempts: 3 }, generate: fakeGenerate(log), judge: async () => ({ pass: true, judged: false, score: null, reason: 'judge unavailable: boom' }) })
  )
  assert.strictEqual(log.length, 1)
  assert.deepStrictEqual(out.result.qa, { passed: false, judged: false, attempts: 1, reason: 'judge unavailable: boom', score: null })
  assert.strictEqual(out.stages.length, 2)
})

test('gate disabled → single plain attempt, no qa, no judge call', async () => {
  const log = []
  let judged = 0
  const out = await runWithUsageRecorder(() =>
    withFidelityGate({ gateConfig: { enabled: false, maxAttempts: 3 }, generate: fakeGenerate(log), judge: async () => { judged++; return { pass: true, judged: true } } })
  )
  assert.strictEqual(log.length, 1)
  assert.strictEqual(judged, 0)
  assert.strictEqual(out.result.qa, undefined)
  assert.strictEqual(out.stages.length, 2)
})

test('gate: a generation error propagates (no silent swallow)', async () => {
  await assert.rejects(
    withFidelityGate({ gateConfig: { enabled: true, maxAttempts: 2 }, generate: async () => { throw new Error('gemini 503') }, judge: async () => ({ pass: true, judged: true }) }),
    /gemini 503/
  )
})
