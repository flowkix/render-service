'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { creditModeFor, BLOCKING_SOURCES } = require('./credit-mode')

test('blocking sources are exactly the person-operated flows', () => {
  assert.deepStrictEqual([...BLOCKING_SOURCES].sort(), [
    'hub-tools-ev-decor', 'hub-tools-ev-full', 'hub-tools-ev-simple', 'hub-tools-ev-studio',
    'pitch-elevator', 'pitch-elevator-gallery',
  ])
  for (const s of BLOCKING_SOURCES) assert.strictEqual(creditModeFor(s), 'block')
})

test('prospect-facing and automated sources are best-effort', () => {
  for (const s of ['stage-a', 'stage-a-review-regen', 'pitch-elevator-review-regen', 'business-card-capture', 'clt-alliance-public', 'legacy-ev-scene']) {
    assert.strictEqual(creditModeFor(s), 'best-effort')
  }
})

test('unknown or missing source is best-effort (never blocks by accident)', () => {
  assert.strictEqual(creditModeFor('something-new'), 'best-effort')
  assert.strictEqual(creditModeFor(undefined), 'best-effort')
})
