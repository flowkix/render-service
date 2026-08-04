const { test } = require('node:test')
const assert = require('node:assert/strict')
const { wrapText } = require('./slide-gen')

// Same fix as ffmpeg-utils.js's wrapText (see its test file for the full incident
// rationale): line count/width for carousel slides is unchanged (canvas layout is
// sized around exactly maxLines), but text overflowing maxLines now gets a trailing
// "…" instead of silently vanishing with no indication.

test('wrapText: short text that fits is returned unchanged', () => {
  assert.deepEqual(wrapText('Short headline', 36, 2), ['Short headline'])
})

test('wrapText: text overflowing maxLines gets an ellipsis on the last line, not a silent drop', () => {
  const result = wrapText(
    'This headline is deliberately long enough to overflow two lines of thirty six characters each easily',
    36,
    2
  )
  assert.equal(result.length, 2)
  assert.ok(result[1].endsWith('…'))
})

test('wrapText: default maxLines (2) is unchanged from before this fix', () => {
  const result = wrapText('one two three four five six seven eight nine ten eleven twelve')
  assert.ok(result.length <= 2)
})

test('wrapText: a single word longer than one line gets sliced with an ellipsis, not kept whole or silently dropped', () => {
  const oversizedWord = 'Supercalifragilisticexpialidociousandthenevenmoreextracharacters'
  const result = wrapText(`${oversizedWord} is here`, 36, 2)
  const last = result[result.length - 1]
  assert.ok(last.endsWith('…'))
  for (const line of result) {
    assert.ok(line.length <= 36, `line "${line}" (${line.length} chars) exceeds the 36-char line width`)
  }
})
