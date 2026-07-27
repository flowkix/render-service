// render-service/test-simple-scene-prompt-builder.js
// Manual verification (no test framework in this repo) — run with: node test-simple-scene-prompt-builder.js
const { buildSimpleScenePrompt } = require('./src/ev-engine/prompt-builder')
const fs = require('fs')
const presetsConfig = JSON.parse(fs.readFileSync('./src/ev-engine/config/prompts/presets.v1.json', 'utf8'))
const simplePresetsConfig = JSON.parse(fs.readFileSync('./src/ev-engine/config/prompts/presets-simple.v1.json', 'utf8'))
const simpleCorrectionsConfig = JSON.parse(fs.readFileSync('./src/ev-engine/config/prompts/corrections-simple.v1.json', 'utf8'))

function expectThrow(fn, label) {
  try { fn(); console.log(`FAIL — ${label} should have thrown`); process.exitCode = 1 }
  catch (e) { console.log(`PASS — ${label}: ${e.message}`) }
}
function expectContains(haystack, needle, label) {
  if (haystack.includes(needle)) console.log(`PASS — ${label}`)
  else { console.log(`FAIL — ${label} — prompt did not contain: ${needle}`); process.exitCode = 1 }
}
function expectNotContains(haystack, needle, label) {
  if (!haystack.includes(needle)) console.log(`PASS — ${label}`)
  else { console.log(`FAIL — ${label} — prompt UNEXPECTEDLY contained: ${needle}`); process.exitCode = 1 }
}

// Missing theme/venue must throw
expectThrow(() => buildSimpleScenePrompt({ venue: 'a park', companyName: 'Acme', presetsConfig, simplePresetsConfig, simpleCorrectionsConfig }), 'missing theme throws')
expectThrow(() => buildSimpleScenePrompt({ theme: 'candid', companyName: 'Acme', presetsConfig, simplePresetsConfig, simpleCorrectionsConfig }), 'missing venue throws')

const { prompt, aspectRatio } = buildSimpleScenePrompt({
  theme: 'casual midweek afternoon, relaxed candid mood',
  venue: 'a public city park with mature trees and a walking path',
  companyName: 'Acme',
  presetsConfig, simplePresetsConfig, simpleCorrectionsConfig,
})

expectContains(prompt, 'VENUE: a public city park with mature trees and a walking path.', 'venue text present')
expectContains(prompt, 'THEME: casual midweek afternoon, relaxed candid mood.', 'theme text present')
expectContains(prompt, 'charcoal and beige polo shirt', 'fixed operator uniform present (from shared param_options)')
expectContains(prompt, 'Standing on the ground, outside and in front of the EV', 'staff-outside rule present')
expectContains(prompt, 'BRAND AMBASSADOR', 'brand ambassador block present (default female)')
expectContains(prompt, 'subtle pin, brooch, or embroidered mark', 'ambassador pin detail present (from shared param_options)')
expectContains(prompt, 'stack of branded promotional flyers', 'ambassador flyers detail present (from shared param_options)')
expectContains(prompt, 'Do NOT render a balloon arch, LED floor posters', 'no-activation-infrastructure correction present')

// Negative assertions — these strings are unique to the STAGED template and must never appear here
expectNotContains(prompt, 'FIXED BRAND-ACTIVATION INFRASTRUCTURE', 'no fixed-infrastructure block')
expectNotContains(prompt, 'Chauvet', 'no Chauvet light mention')
expectNotContains(prompt, 'balloon arch over the EV in colors', 'no balloon-arch-present instruction')
expectNotContains(prompt, "entirely covered by the client's logo artwork graphic repeated prominently", 'no step-and-repeat backdrop construction instruction')
expectNotContains(prompt, 'bar-height cocktail table', 'no bar tables mention')
expectNotContains(prompt, 'LED FLOOR POSTERS', 'no LED posters mention')

if (aspectRatio === '16:9') console.log('PASS — default aspect ratio 16:9')
else { console.log(`FAIL — expected 16:9, got ${aspectRatio}`); process.exitCode = 1 }

console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED')
