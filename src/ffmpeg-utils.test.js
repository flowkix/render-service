const { test } = require('node:test')
const assert = require('node:assert/strict')
const { wrapText } = require('./ffmpeg-utils')

// Regression test for a real, live bug: a published SNACKET reel's hook text
// ("...impressions and starts earning attention.") was cut off mid-sentence after
// "...impressions and" — the old 2-line/36-char wrap silently dropped the rest with
// no ellipsis or indication. Fixed to 3 lines (108 chars) + a trailing "…" when text
// still doesn't fit even at that.

test('wrapText: the exact hook from the real live bug now fits entirely within 3 lines', () => {
  const realHook = 'This is what it looks like when a brand stops buying impressions and starts earning attention.'
  const result = wrapText(realHook)
  assert.ok(result.includes('starts earning attention.'), 'must not drop the tail of the sentence')
  assert.ok(result.split('\n').length <= 3)
  assert.notEqual(result, 'This is what it looks like when a\nbrand stops buying impressions and')
})

test('wrapText: genuinely oversized text gets an ellipsis, never a silent mid-word drop', () => {
  const veryLong = 'This is a deliberately much longer hook than the platform can ever fit on screen no matter how many lines are allowed because it keeps going on and on well past what any reasonable video overlay could ever display to a real viewer.'
  const result = wrapText(veryLong)
  assert.ok(result.endsWith('…'))
  assert.ok(result.split('\n').length <= 3)
})

test('wrapText: short text that already fits is returned unchanged', () => {
  const result = wrapText('Impressions scroll past.')
  assert.equal(result, 'Impressions scroll past.')
})

test('wrapText: a single word longer than one line gets sliced with an ellipsis, not kept whole (would overflow the 1080px frame) or silently dropped', () => {
  const oversizedWord = 'Supercalifragilisticexpialidociousandthenevenmoreextracharacters'
  const result = wrapText(`${oversizedWord} is here`)
  assert.ok(result.endsWith('…'))
  for (const line of result.split('\n')) {
    assert.ok(line.length <= 36, `line "${line}" (${line.length} chars) exceeds the 36-char line width`)
  }
})

test('wrapText: respects an explicit maxLines override', () => {
  const result = wrapText('one two three four five six seven eight nine ten eleven twelve', 10, 2)
  assert.ok(result.split('\n').length <= 2)
  assert.ok(result.endsWith('…'))
})
