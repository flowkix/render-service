'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { runSimpleFull, runFull, loadEngineConfig } = require('./index')
const fidelityGate = require('./pipeline/fidelity-gate')
const { getProvider } = require('./providers')
const { runWithUsageRecorder, recordImageUsage } = require('../ai-credits/usage-recorder')
const { CORRECTIVE_PREFIX } = fidelityGate

// End-to-end wiring of the two-step fidelity gate through the real orchestrator (index.js)
// with the provider and the judge mocked: which stages run per attempt, what prompt each
// retry gets, edit→create fallback, and that only delivered attempts are billed.

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key'

const RAW_REF = Buffer.from('\xff\xd8 raw-ev-reference')
const LOGO = Buffer.from('\x89PNG client-logo')
const CURRENT = Buffer.from('\x89PNG current-scene')
const GATE = { enabled: true, maxAttempts: 3 }

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

// Verdicts are consumed in judge-call order (branding first, then scene).
function mockJudge(t, verdicts) {
  let i = 0
  const seen = []
  t.mock.method(fidelityGate, 'judgeEvFidelity', async ({ imageBuffer, rawRefBuffer, label }) => {
    seen.push({ imageBuffer, rawRefBuffer, label })
    return verdicts[Math.min(i++, verdicts.length - 1)]
  })
  return seen
}

const PASS = { pass: true, judged: true, score: 5, reason: 'same vehicle' }
const FAIL = { pass: false, judged: true, score: 1, reason: 'box van' }
const stagesOf = calls => calls.map(c => String(c.opts.label).split(':')[0])

test('create mode, both steps pass → branding + scene once, each judged against the raw reference, 2 billed stages', async t => {
  const calls = mockProvider(t)
  const seen = mockJudge(t, [PASS, PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: GATE }, configsWithLocalRef())
  )
  assert.strictEqual(out.error, null)
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'simple-scene'])
  assert.strictEqual(seen.length, 2, 'branding judged, then scene judged')
  assert.ok(seen.every(s => s.rawRefBuffer === RAW_REF), 'every judge call compares against the raw reference')
  assert.strictEqual(seen[0].imageBuffer, out.result.branding.buffer)
  assert.strictEqual(seen[1].imageBuffer, out.result.scene.buffer)
  assert.deepStrictEqual({ passed: out.result.qa.passed, attempts: out.result.qa.attempts }, { passed: true, attempts: 2 })
  assert.deepStrictEqual(Object.keys(out.result.qa.steps), ['branding', 'scene'])
  assert.strictEqual(out.stages.length, 2)
  assert.ok(!calls[0].prompt.startsWith(CORRECTIVE_PREFIX.branding) && !calls[1].prompt.startsWith(CORRECTIVE_PREFIX.scene), 'first attempts have no corrective prefix')
})

test('create mode, BRANDING drifts → branding retried with its corrective prefix, scene runs once on the passed EV; rejected branding not billed', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [FAIL, PASS, PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: GATE }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'branding', 'simple-scene'])
  assert.ok(calls[1].prompt.startsWith(CORRECTIVE_PREFIX.branding), 'branding retry prompt starts with the branding corrective prefix')
  assert.ok(/IMAGE A = /.test(calls[1].prompt), 'retry still carries the full branding prompt')
  assert.strictEqual(calls[2].images[0].buffer, out.result.branding.buffer, 'scene uses the branded EV that passed')
  assert.deepStrictEqual({ passed: out.result.qa.passed, attempts: out.result.qa.attempts }, { passed: true, attempts: 3 })
  assert.strictEqual(out.stages.length, 2, 'only the delivered branding + scene are billed')
})

test('create mode, SCENE drifts → only the scene is retried (branded EV reused), with the scene corrective prefix', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [PASS, FAIL, PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: GATE }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'simple-scene', 'simple-scene'])
  assert.ok(calls[2].prompt.startsWith(CORRECTIVE_PREFIX.scene))
  assert.ok(calls[2].prompt.includes('IMAGE C = the OFFICIAL RAW'), 'retry still carries the full create prompt')
  assert.strictEqual(calls[2].images[0].buffer, calls[1].images[0].buffer, 'same branded EV in both scene attempts')
  assert.deepStrictEqual({ passed: out.result.qa.passed, attempts: out.result.qa.attempts }, { passed: true, attempts: 3 })
  assert.strictEqual(out.stages.length, 2)
})

test('edit mode: refinement rejected → full CREATE-mode regeneration from the raw reference (branding + scene), edit attempt not billed', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [FAIL, PASS, PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({
      companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v',
      currentSceneBuffer: CURRENT, editInstruction: 'use the real EV',
      fidelityGate: GATE,
    }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['simple-scene-edit', 'branding', 'simple-scene'])
  assert.strictEqual(calls[0].images[0].buffer, CURRENT)
  assert.ok(/IMAGE A = the CURRENT scene photo/.test(calls[0].prompt))
  assert.ok(/IMAGE A = the branded Acme EV/.test(calls[2].prompt), 'fallback uses the create-mode prompt')
  assert.deepStrictEqual(Object.keys(out.result.qa.steps), ['edit', 'branding', 'scene'])
  assert.strictEqual(out.result.qa.passed, true)
  assert.strictEqual(out.stages.length, 2, 'rejected edit not billed; delivered branding + scene are')
})

test('edit mode: refinement passes → single scene-edit call, branding never runs', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', currentSceneBuffer: CURRENT, fidelityGate: GATE }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['simple-scene-edit'])
  assert.deepStrictEqual(Object.keys(out.result.qa.steps), ['edit'])
  assert.strictEqual(out.stages.length, 1)
})

test('skipBranding (business card): only the scene step is judged', async t => {
  const calls = mockProvider(t)
  const seen = mockJudge(t, [PASS])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', skipBranding: true, fidelityGate: GATE }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['simple-scene'])
  assert.strictEqual(seen.length, 1)
  assert.deepStrictEqual(Object.keys(out.result.qa.steps), ['scene'])
  assert.strictEqual(out.stages.length, 1)
})

test('gate disabled → exact pre-gate behavior (no judge, no qa)', async t => {
  const calls = mockProvider(t)
  const seen = mockJudge(t, [FAIL])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: { enabled: false } }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'simple-scene'])
  assert.strictEqual(seen.length, 0)
  assert.strictEqual(out.result.qa, undefined)
})

test('every attempt fails → flagged (passed=false), maxAttempts per step, one delivered attempt per step billed', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [FAIL])
  const out = await runWithUsageRecorder(() =>
    runSimpleFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: GATE }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'branding', 'branding', 'simple-scene', 'simple-scene', 'simple-scene'])
  assert.deepStrictEqual({ passed: out.result.qa.passed, attempts: out.result.qa.attempts }, { passed: false, attempts: 6 })
  assert.ok(out.result.qa.reason.startsWith('branding: '), 'reason names the first failing step')
  assert.strictEqual(out.stages.length, 2)
})

test('runFull (scene-v2): same two gated steps', async t => {
  const calls = mockProvider(t)
  mockJudge(t, [PASS, FAIL, PASS])
  const out = await runWithUsageRecorder(() =>
    runFull({ companyName: 'Acme', logoSource: LOGO, theme: 't', venue: 'v', fidelityGate: { enabled: true, maxAttempts: 2 } }, configsWithLocalRef())
  )
  assert.deepStrictEqual(stagesOf(calls), ['branding', 'scene', 'scene'])
  assert.ok(calls[2].prompt.startsWith(CORRECTIVE_PREFIX.scene))
  assert.deepStrictEqual({ passed: out.result.qa.passed, attempts: out.result.qa.attempts }, { passed: true, attempts: 3 })
  assert.strictEqual(out.stages.length, 2)
})
