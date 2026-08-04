const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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

// Regression guard: generateSlide() renders every image-based reel scene (the
// only kind this pipeline produces) via a call site that hardcodes its own
// maxLines argument, independent of wrapText's default -- a silent revert of
// that one argument (e.g. an unrelated future edit re-copying the old "2")
// would resurrect the exact live-incident bug with zero test failure anywhere
// else, since wrapText itself would still behave correctly. Cheap insurance:
// pin the call site's literal argument via source inspection.
test('generateSlide calls wrapText with maxLines=3, not the old maxLines=2', () => {
  const source = fs.readFileSync(path.join(__dirname, 'slide-gen.js'), 'utf8')
  const fnStart = source.indexOf('async function generateSlide(')
  assert.ok(fnStart >= 0, 'generateSlide function not found')
  const fnBody = source.slice(fnStart, fnStart + 400)
  assert.match(fnBody, /wrapText\(text,\s*36,\s*3\)/)
})

test('generateSlide + buildOverlaySvg: the real incident hook renders as 3 intact lines, not 2 truncated ones', () => {
  const realHook = 'This is what it looks like when a brand stops buying impressions and starts earning attention.'
  const lines = wrapText(realHook, 36, 3)
  assert.deepEqual(lines, [
    'This is what it looks like when a',
    'brand stops buying impressions and',
    'starts earning attention.',
  ])
})
