'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { judgeEvFidelity, gatedStep, combineQa, deliverUsage, parseVerdict, CORRECTIVE_PREFIX } = require('./fidelity-gate')
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

test('judge: sends the generated image first and the raw reference second, structure-only question + discriminators, temperature 0 JSON', async () => {
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
  assert.ok(/predominantly wood-grain/.test(parts[0].text), 'discriminators calibrated 2026-10-01 must be present')
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

// ---------- gatedStep ----------

function fakeGenerate(log, stage = 'scene') {
  return async (attempt, ctx) => {
    log.push({ attempt, ctx })
    recordImageUsage({ stage, model: 'm', resolution: '2K' })
    return { buffer: Buffer.from(`${stage}-${attempt}`), meta: { attempt } }
  }
}
const PASS = { pass: true, judged: true, score: 5, reason: 'ok' }
const FAIL = { pass: false, judged: true, score: 1, reason: 'box van' }

test('gatedStep: passes first time → 1 attempt, no corrective prefix, that attempt\'s stages returned (not yet replayed)', async () => {
  const log = []
  const out = await runWithUsageRecorder(async () => {
    const step = await gatedStep({ gateConfig: { maxAttempts: 3 }, kind: 'scene', generate: fakeGenerate(log), judge: async () => PASS })
    return step
  })
  assert.strictEqual(log.length, 1)
  assert.deepStrictEqual(log[0].ctx, { correctivePrefix: '' })
  assert.deepStrictEqual(out.result.qa, { passed: true, judged: true, attempts: 1, reason: 'ok', score: 5 })
  assert.strictEqual(out.result.stages.length, 1)
  assert.strictEqual(out.stages.length, 0, 'nothing is billed until the caller calls deliverUsage')
})

test('gatedStep: fail then pass → retry carries the kind-specific corrective prefix; delivered stages are attempt 2 only', async () => {
  const log = []
  let calls = 0
  const judge = async () => (++calls === 1 ? FAIL : PASS)
  const step = await gatedStep({ gateConfig: { maxAttempts: 3 }, kind: 'branding', generate: fakeGenerate(log, 'branding'), judge })
  assert.strictEqual(log.length, 2)
  assert.deepStrictEqual(log[1].ctx, { correctivePrefix: CORRECTIVE_PREFIX.branding })
  assert.strictEqual(step.result.meta.attempt, 2)
  assert.deepStrictEqual(step.qa, { passed: true, judged: true, attempts: 2, reason: 'ok', score: 5 })
  assert.strictEqual(step.stages.length, 1)
})

test('gatedStep: every attempt fails → best-scoring attempt flagged passed=false', async () => {
  const log = []
  const scores = [2, 4, 3]
  let i = 0
  const judge = async () => ({ pass: false, judged: true, score: scores[i++], reason: `fail-${i}` })
  const step = await gatedStep({ gateConfig: { maxAttempts: 3 }, kind: 'scene', generate: fakeGenerate(log), judge })
  assert.strictEqual(log.length, 3)
  assert.strictEqual(step.result.meta.attempt, 2, 'attempt 2 had the best structure_match')
  assert.deepStrictEqual(step.qa, { passed: false, judged: true, attempts: 3, reason: 'fail-2', score: 4 })
})

test('gatedStep: judge unavailable → ships attempt 1 unjudged (fail-open), no retry', async () => {
  const log = []
  const step = await gatedStep({ gateConfig: { maxAttempts: 3 }, kind: 'scene', generate: fakeGenerate(log), judge: async () => ({ pass: true, judged: false, score: null, reason: 'judge unavailable: boom' }) })
  assert.strictEqual(log.length, 1)
  assert.deepStrictEqual(step.qa, { passed: false, judged: false, attempts: 1, reason: 'judge unavailable: boom', score: null })
})

test('gatedStep: a generation error propagates (no silent swallow)', async () => {
  await assert.rejects(
    gatedStep({ gateConfig: { maxAttempts: 2 }, kind: 'scene', generate: async () => { throw new Error('gemini 503') }, judge: async () => PASS }),
    /gemini 503/
  )
})

// ---------- combineQa / deliverUsage ----------

test('combineQa: passed only when every judged step passed; attempts summed; first failing step names the reason', () => {
  const ok = combineQa({ branding: { passed: true, judged: true, attempts: 2, reason: 'b ok', score: 5 }, scene: { passed: true, judged: true, attempts: 1, reason: 's ok', score: 4 } })
  assert.deepStrictEqual({ passed: ok.passed, judged: ok.judged, attempts: ok.attempts, reason: ok.reason, score: ok.score }, { passed: true, judged: true, attempts: 3, reason: 's ok', score: 4 })
  assert.deepStrictEqual(Object.keys(ok.steps), ['branding', 'scene'])

  const bad = combineQa({ branding: { passed: true, judged: true, attempts: 1, reason: 'b ok', score: 5 }, scene: { passed: false, judged: true, attempts: 3, reason: 'pickup', score: 2 } })
  assert.deepStrictEqual({ passed: bad.passed, attempts: bad.attempts, reason: bad.reason, score: bad.score }, { passed: false, attempts: 4, reason: 'scene: pickup', score: 2 })

  // A rejected edit refinement that was replaced by a create-mode regeneration must not sink the verdict.
  const superseded = combineQa({ edit: { passed: false, judged: true, attempts: 1, reason: 'wrong truck', score: 2, superseded: true }, branding: { passed: true, judged: true, attempts: 1, reason: 'b ok', score: 5 }, scene: { passed: true, judged: true, attempts: 1, reason: 's ok', score: 5 } })
  assert.deepStrictEqual({ passed: superseded.passed, attempts: superseded.attempts, reason: superseded.reason }, { passed: true, attempts: 3, reason: 's ok' })
  assert.deepStrictEqual(Object.keys(superseded.steps), ['edit', 'branding', 'scene'])

  const unjudged = combineQa({ branding: undefined, scene: { passed: false, judged: false, attempts: 1, reason: 'judge unavailable: x', score: null } })
  assert.deepStrictEqual({ passed: unjudged.passed, judged: unjudged.judged }, { passed: false, judged: false })
  assert.strictEqual(combineQa({ branding: undefined, scene: undefined }), undefined)
})

test('deliverUsage: replays only the given stage lists into the request recorder', async () => {
  const out = await runWithUsageRecorder(async () => {
    deliverUsage([{ stage: 'branding', model: 'm', resolution: '2K', images: 1 }], [], [{ stage: 'scene', model: 'm', resolution: '2K', images: 1 }])
    return 1
  })
  assert.deepStrictEqual(out.stages.map(s => s.stage), ['branding', 'scene'])
})
