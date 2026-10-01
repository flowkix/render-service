'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { runSimpleSceneStage } = require('./simple-scene-stage')
const { loadEngineConfig } = require('../index')
const { getProvider } = require('../providers')

// The Gemini provider sends `[{text: prompt}, ...images]` with NO per-image label — the
// model can only map "IMAGE A/B/C" in the prompt to the inline images by ORDER. These
// tests pin that contract: whatever position the prompt assigns to a role, the buffer at
// that index must be that role's image. Regression guard for the 2026-09-24 incident
// (PR #37 added the raw EV reference as a 3rd image in create mode but left the prompt
// saying "IMAGE B = the logo" / "IMAGE C = raw reference" while the buffers went out as
// [branded, raw, logo] — the structure anchor was being read as the client logo).

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key'

const BRANDED = Buffer.from('\x89PNG branded-ev')
const RAW_REF = Buffer.from('\xff\xd8 raw-ev-reference')
const LOGO = Buffer.from('\x89PNG client-logo')
const CURRENT = Buffer.from('\x89PNG current-scene')

function captureProvider(t) {
  const provider = getProvider('gemini')
  const calls = []
  t.mock.method(provider, 'generate', async req => {
    calls.push(req)
    return { buffer: Buffer.from('\x89PNG out'), meta: { provider: 'gemini', model: 'mock', costUsd: 0 } }
  })
  return calls
}

// Finds which 1-based "IMAGE X" letter the prompt assigns to a role, by matching the
// role's defining phrase. Returns the index into the images array (0-based).
function promptIndexOf(prompt, phraseRe) {
  const m = prompt.match(phraseRe)
  assert.ok(m, `prompt does not define a role matching ${phraseRe}`)
  return m[1].charCodeAt(0) - 'A'.charCodeAt(0)
}

test('create mode: image order matches the IMAGE A/B/C labels the prompt assigns', async t => {
  const calls = captureProvider(t)
  const configs = loadEngineConfig()
  await runSimpleSceneStage({
    companyName: 'Acme',
    brandedEvBuffer: BRANDED,
    logoSource: LOGO,
    theme: 'casual afternoon',
    venue: 'a city park',
    rawEvReferenceUrl: RAW_REF,
    ...configs,
  })
  assert.strictEqual(calls.length, 1)
  const { images, prompt } = calls[0]
  assert.strictEqual(images.length, 3, 'create mode with a raw reference sends exactly 3 images')

  const brandedIdx = promptIndexOf(prompt, /IMAGE ([A-C]) = the branded Acme EV/)
  const logoIdx = promptIndexOf(prompt, /IMAGE ([A-C]) = the Acme logo/)
  const rawIdx = promptIndexOf(prompt, /IMAGE ([A-C]) = the OFFICIAL RAW \(unbranded\) SNACKET EV reference/)

  assert.strictEqual(images[brandedIdx].buffer, BRANDED, `prompt says IMAGE ${String.fromCharCode(65 + brandedIdx)} is the branded EV, but that slot holds another image`)
  assert.strictEqual(images[logoIdx].buffer, LOGO, `prompt says IMAGE ${String.fromCharCode(65 + logoIdx)} is the logo, but that slot holds another image`)
  assert.strictEqual(images[rawIdx].buffer, RAW_REF, `prompt says IMAGE ${String.fromCharCode(65 + rawIdx)} is the raw EV reference, but that slot holds another image`)
  assert.strictEqual(images[0].role, 'primary')
})

test('create mode without a raw reference keeps the original 2-image contract', async t => {
  const calls = captureProvider(t)
  const configs = loadEngineConfig()
  await runSimpleSceneStage({
    companyName: 'Acme',
    brandedEvBuffer: BRANDED,
    logoSource: LOGO,
    theme: 'casual afternoon',
    venue: 'a city park',
    ...configs,
  })
  const { images, prompt } = calls[0]
  assert.strictEqual(images.length, 2)
  assert.strictEqual(images[0].buffer, BRANDED)
  assert.strictEqual(images[1].buffer, LOGO)
  assert.ok(!/IMAGE C =/.test(prompt), 'no IMAGE C role defined when only 2 images are sent')
})

test('edit mode: image order matches the IMAGE A/B/C labels the prompt assigns', async t => {
  const calls = captureProvider(t)
  const configs = loadEngineConfig()
  await runSimpleSceneStage({
    companyName: 'Acme',
    logoSource: LOGO,
    theme: 'casual afternoon',
    venue: 'a city park',
    currentSceneBuffer: CURRENT,
    editInstruction: 'make the sky clearer',
    rawEvReferenceUrl: RAW_REF,
    ...configs,
  })
  const { images, prompt } = calls[0]
  assert.strictEqual(images.length, 3)

  const currentIdx = promptIndexOf(prompt, /IMAGE ([A-C]) = the CURRENT scene photo/)
  const rawIdx = promptIndexOf(prompt, /IMAGE ([A-C]) = the OFFICIAL RAW SNACKET EV REFERENCE/)
  assert.strictEqual(images[currentIdx].buffer, CURRENT)
  assert.strictEqual(images[rawIdx].buffer, RAW_REF)
  // The edit prompt names the logo as IMAGE C ("provided fresh via IMAGE C, if present").
  assert.ok(/via IMAGE C/.test(prompt))
  assert.strictEqual(images[2].buffer, LOGO)
})

test('the NO LABEL TEXT rule covers every label the prompt uses', async t => {
  const calls = captureProvider(t)
  const configs = loadEngineConfig()
  await runSimpleSceneStage({
    companyName: 'Acme',
    brandedEvBuffer: BRANDED,
    logoSource: LOGO,
    theme: 'casual afternoon',
    venue: 'a city park',
    rawEvReferenceUrl: RAW_REF,
    ...configs,
  })
  const { prompt } = calls[0]
  const rule = prompt.match(/CRITICAL — NO LABEL TEXT:[^\n]*/)
  assert.ok(rule, 'NO LABEL TEXT rule present')
  for (const label of ['IMAGE A', 'IMAGE B', 'IMAGE C']) {
    assert.ok(rule[0].includes(`"${label}"`), `NO LABEL TEXT rule must list ${label} (the prompt defines it)`)
  }
})
