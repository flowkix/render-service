'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { runSimpleFull, runFull, loadEngineConfig } = require('./index')
const fidelityGate = require('./pipeline/fidelity-gate')
const { getProvider } = require('./providers')
const { runWithUsageRecorder, recordImageUsage } = require('../ai-credits/usage-recorder')
const { CORRECTIVE_PREFIX } = fidelityGate

// End-to-end wiring of the fidelity gate through the real orchestrator (index.js) with the
// provider and the judge mocked: which stages run per attempt, what prompt the retry gets,
// edit→create fallback, and that only the delivered attempt is billed.

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key'

const RAW_REF = Buffer.from('\xff\xd8 raw-ev-reference')
const LOGO = Buffer.from('\x89PNG client-logo')
const CURRENT = Buffer.from('\x89PNG current-scene')

function configsWithLocalRef() {
  const configs = loadEngineConfig()
  // fetchBuffer() returns a Buffer as-is, so no network for the raw reference in tests.
  return { ...configs, zonesConfig: { ...configs.zonesConfig, referenceImage: RAW_REF } }
}

function mockProvider(t) {
  const provider = getProvider('gemini')
  const calls = []
  t.mock.method(provider, 'generate', async req => {
    calls.push(req)
    // Mirror the real provider: a returned image is billable usage.
    recordImageUsage({ stage: String(req.opts.label).split(':')[0], model: 'mock', resolution: '2K' })
    return { buffer: Buffer.from(`\x89PNG out-${calls.length}`), meta: { provider: 'gemini', model: 'mock', costUsd: 0 } }
  })
  return calls
}

function mockJudge(t, verdicts) {
  let i = 0
  const seen = []
  t.mock.method(fidelityGate, 'judgeEvFidelity', async ({ imageBuffer, rawRefBuffer }) => {
    seen.push({ imageBuffer, rawRefBuffer })
    return verdicts[Math.min(i++, verdicts.length - 1)]
  })
  return seen
}

const PASS = { pass: true, judged: true, score: 5, reason: 'same vehicle' }
const FAIL = { pass: false, judged: true, score: 1, reason: 'box van' }
const stagesOf = calls => calls.map(c => String(c.opts.label).split(':')[0])

test('runSimpleFull create mode: pass first → branding + scene once, judged against the raw reference, 2 billed stages', async t => {
  const calls = mockProvider(t)
  const seen = mockJudge(t, [PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: { enabled: true, maxAttempts: 3 } }, configsWithLocalRef())
  )
  assert.strictEqual(out.error, null)
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'simple-scene'])
  assert.strictEqual(seen.length, 1)
  assert.strictEqual(seen[0].rawRefBuffer, RAW_REF, 'judge compares against the engine raw reference')
  assert.strictEqual(seen[0].imageBuffer, out.result.scene.buffer, 'judge sees the delivered scene buffer')
  assert.strictEqual(out.result.qa.passed, true)
  assert.strictEqual(out.result.qa.attempts, 1)
  assert.strictEqual(out.stages.length, 2)
  assert.ok(!calls[1].prompt.startsWith(CORRECTIVE_PREFIX), 'first attempt has no corrective prefix')
})

test('runSimpleFull create mode: fail → retry regenerates branding AND scene with the corrective prefix; rejected attempt not billed', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [FAIL, PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: { enabled: true, maxAttempts: 3 } }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'simple-scene', 'branding', 'simple-scene'])
  assert.ok(calls[3].prompt.startsWith(CORRECTIVE_PREFIX), 'retry scene prompt starts with the corrective prefix')
  assert.ok(calls[3].prompt.includes('IMAGE C = the OFFICIAL RAW'), 'retry still carries the full create prompt')
  assert.deepStrictEqual({ passed: out.result.qa.passed, attempts: out.result.qa.attempts }, { passed: true, attempts: 2 })
  assert.strictEqual(out.stages.length, 2, 'only the delivered attempt (branding + scene) is billed')
})

test('runSimpleFull edit mode: fail → retry is a CREATE-mode regeneration from the raw reference, not another refinement', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [FAIL, PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({
      companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v',
      currentSceneBuffer: CURRENT, editInstruction: 'use the real EV',
      fidelityGate: { enabled: true, maxAttempts: 3 },
    }, configsWithLocalRef())
  )
  // attempt 1 = edit (scene only, IMAGE A = current scene); attempt 2 = create (branding + scene)
  assert.deepStrictEqual(stagesOf(calls), ['simple-scene-edit', 'branding', 'simple-scene'])
  assert.strictEqual(calls[0].images[0].buffer, CURRENT)
  assert.ok(/IMAGE A = the CURRENT scene photo/.test(calls[0].prompt))
  assert.ok(calls[2].prompt.startsWith(CORRECTIVE_PREFIX))
  assert.ok(/IMAGE A = the branded Acme EV/.test(calls[2].prompt), 'retry uses the create-mode prompt')
  assert.strictEqual(out.result.qa.attempts, 2)
  assert.strictEqual(out.stages.length, 2)
})

test('runSimpleFull: gate disabled → exact pre-gate behavior (no judge, no qa)', async t => {
  const calls = mockProvider(t)
  const seen = mockJudge(t, [FAIL])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: { enabled: false } }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'simple-scene'])
  assert.strictEqual(seen.length, 0)
  assert.strictEqual(out.result.qa, undefined)
})

test('runSimpleFull: all attempts fail → delivered flagged passed=false after maxAttempts', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [FAIL, FAIL, FAIL])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: { enabled: true, maxAttempts: 3 } }, configsWithLocalRef())
  )
  assert.strictEqual(calls.length, 6, '3 attempts x (branding + scene)')
  assert.deepStrictEqual({ passed: out.result.qa.passed, attempts: out.result.qa.attempts }, { passed: false, attempts: 3 })
  assert.strictEqual(out.stages.length, 2)
})

test('runFull (scene-v2): same gate — retry regenerates branding + scene with the corrective prefix', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [FAIL, PASS])
  const out = await runWithUsageRecorder(() =>
    runFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: { enabled: true, maxAttempts: 2 } }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'scene', 'branding', 'scene'])
  assert.ok(calls[3].prompt.startsWith(CORRECTIVE_PREFIX))
  assert.strictEqual(out.result.qa.attempts, 2)
  assert.strictEqual(out.stages.length, 2)
})
