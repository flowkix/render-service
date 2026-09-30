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

test('unknown-source warning is sanitized: no warn for known sources, no raw newline/oversized value for unknown ones', (t) => {
  const warnMock = t.mock.method(console, 'warn')

  creditModeFor('business-card-capture')
  assert.strictEqual(warnMock.mock.callCount(), 0)

  const malicious = 'x'.repeat(101) + '\nFAKE LOG LINE INJECTED'
  creditModeFor(malicious)
  assert.strictEqual(warnMock.mock.callCount(), 1)

  const message = warnMock.mock.calls[0].arguments[0]
  assert.strictEqual(message.includes('\n'), false)

  const match = message.match(/^\[credit-mode\] unknown source (.+) — treating as best-effort$/)
  assert.ok(match, `warning message did not match expected format: ${message}`)
  assert.ok(match[1].length <= 80, `quoted value part exceeded 80 chars: ${match[1].length}`)
})
