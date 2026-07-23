// render-service/test-scene-prompt-builder.js
// Manual verification (no test framework in this repo) — run with: node test-scene-prompt-builder.js
const { buildScenePrompt } = require('./src/ev-engine/prompt-builder')
const presetsConfig = JSON.parse(require('fs').readFileSync('./src/ev-engine/config/prompts/presets.v1.json', 'utf8'))
const correctionsConfig = JSON.parse(require('fs').readFileSync('./src/ev-engine/config/prompts/corrections.v1.json', 'utf8'))

function expectThrow(fn, label) {
  try { fn(); console.log(`FAIL — ${label} should have thrown`); process.exitCode = 1 }
  catch (e) { console.log(`PASS — ${label}: ${e.message}`) }
}
function expectContains(haystack, needle, label) {
  if (haystack.includes(needle)) console.log(`PASS — ${label}`)
  else { console.log(`FAIL — ${label} — prompt did not contain: ${needle}`); process.exitCode = 1 }
}

// Missing theme/venue must throw
expectThrow(() => buildScenePrompt({ venue: 'a plaza', companyName: 'Acme', presetsConfig, correctionsConfig }), 'missing theme throws')
expectThrow(() => buildScenePrompt({ theme: 'elegant', companyName: 'Acme', presetsConfig, correctionsConfig }), 'missing venue throws')

// Default case: no tableCount/ledPosterContent override
const { prompt: p1, aspectRatio: ar1 } = buildScenePrompt({
  theme: 'upscale golden-hour cocktail activation',
  venue: 'rooftop terrace with city skyline views',
  companyName: 'Acme',
  presetsConfig, correctionsConfig,
})
expectContains(p1, 'VENUE: rooftop terrace with city skyline views.', 'venue text present')
expectContains(p1, 'THEME: upscale golden-hour cocktail activation.', 'theme text present')
expectContains(p1, '2 white high bar-height cocktail tables', 'default 2 tables present')
expectContains(p1, '4 stools total', 'default 4 stools present')
expectContains(p1, 'the Acme logo', 'default LED poster content is company logo')
expectContains(p1, '26 inches wide by 88 inches tall', 'LED poster dimensions present')
expectContains(p1, 'Chauvet Freedom Par Q9 Wireless, Battery-Operated', 'correct light fixture model present')
expectContains(p1, 'never mounted on a tripod or stand', 'floor-only light placement present')
expectContains(p1, 'Standing on the ground, outside and in front of the EV', 'staff-outside rule present')
if (ar1 === '16:9') console.log('PASS — default aspect ratio 16:9')
else { console.log(`FAIL — expected 16:9, got ${ar1}`); process.exitCode = 1 }

// tableCount:0 override
const { prompt: p2 } = buildScenePrompt({
  theme: 'minimalist daytime activation',
  venue: 'urban plaza',
  companyName: 'Acme',
  tableCount: 0,
  presetsConfig, correctionsConfig,
})
expectContains(p2, 'No bar tables in this scene.', 'tableCount:0 override respected')

// ledPosterContent override
const { prompt: p3 } = buildScenePrompt({
  theme: 'festival activation',
  venue: 'street festival grounds',
  companyName: 'Acme',
  ledPosterContent: 'Welcome to Acme Fest 2026',
  presetsConfig, correctionsConfig,
})
expectContains(p3, 'Content displayed: Welcome to Acme Fest 2026.', 'ledPosterContent override respected')

console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED')
