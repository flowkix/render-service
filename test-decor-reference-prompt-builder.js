// render-service/test-decor-reference-prompt-builder.js
// Manual verification (no test framework in this repo) — run with: node test-decor-reference-prompt-builder.js
const { buildDecorReferencePrompt } = require('./src/ev-engine/prompt-builder')
const fs = require('fs')
const decorPresetsConfig = JSON.parse(fs.readFileSync('./src/ev-engine/config/prompts/presets-decor.v1.json', 'utf8'))
const decorCorrectionsConfig = JSON.parse(fs.readFileSync('./src/ev-engine/config/prompts/corrections-decor.v1.json', 'utf8'))

function expectThrow(fn, label) {
  try { fn(); console.log(`FAIL — ${label} should have thrown`); process.exitCode = 1 }
  catch (e) { console.log(`PASS — ${label}: ${e.message}`) }
}
function expectContains(haystack, needle, label) {
  if (haystack.includes(needle)) console.log(`PASS — ${label}`)
  else { console.log(`FAIL — ${label} — prompt did not contain: ${needle}`); process.exitCode = 1 }
}

expectThrow(() => buildDecorReferencePrompt({ placementInstructions: 'in front', decorPresetsConfig, decorCorrectionsConfig }), 'missing objectLabel throws')
expectThrow(() => buildDecorReferencePrompt({ objectLabel: 'SNACKET NitroCafé EV', decorPresetsConfig, decorCorrectionsConfig }), 'missing placementInstructions throws')

const { prompt, aspectRatio } = buildDecorReferencePrompt({
  objectLabel: 'SNACKET NitroCafé EV',
  placementInstructions: 'in front of the vehicle, framing the entrance',
  decorPresetsConfig,
  decorCorrectionsConfig,
})

expectContains(prompt, 'PLACEMENT: in front of the vehicle, framing the entrance', 'placement instructions present')
expectContains(prompt, 'OBJECT IDENTITY LOCK', 'identity lock block present')
expectContains(prompt, 'CRITICAL TEXT FIDELITY', 'text fidelity block present')
expectContains(prompt, 'CRITICAL NO-OCCLUSION RULE', 'no-occlusion rule present')
expectContains(prompt, "exact structure, exact colors, and exact materials must match IMAGE B faithfully", 'decor-fidelity correction present')

const { prompt: scaledPrompt } = buildDecorReferencePrompt({
  objectLabel: 'SNACKET NitroCafé EV',
  placementInstructions: 'to the left of the vehicle',
  scaleInstruction: 'the topper rises just above the vehicle\'s roofline',
  decorPresetsConfig,
  decorCorrectionsConfig,
})
expectContains(scaledPrompt, "SCALE — IMPORTANT: the topper rises just above the vehicle's roofline.", 'scale block present when scaleInstruction given')

if (aspectRatio === '4:3') console.log('PASS — default aspect ratio 4:3')
else { console.log(`FAIL — expected 4:3, got ${aspectRatio}`); process.exitCode = 1 }

console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED')
