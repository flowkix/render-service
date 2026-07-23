// render-service/test-scene-rate-limiter.js
// Manual verification — run with: node test-scene-rate-limiter.js
process.env.SCENE_RATE_LIMIT_PER_SOURCE_HOUR = '2'
const { checkSceneRateLimit } = require('./src/ev-engine/scene-rate-limiter')

function expectThrow(fn, label) {
  try { fn(); console.log(`FAIL — ${label} should have thrown`); process.exitCode = 1 }
  catch (e) { console.log(`PASS — ${label}: ${e.message}`) }
}
function expectOk(fn, label) {
  try { fn(); console.log(`PASS — ${label}`) }
  catch (e) { console.log(`FAIL — ${label} threw unexpectedly: ${e.message}`); process.exitCode = 1 }
}

// Missing source must throw
expectThrow(() => checkSceneRateLimit({}), 'missing source throws')

// 2 allowed for source "pitch-elevator" (limit is 2)
expectOk(() => checkSceneRateLimit({ source: 'pitch-elevator' }), '1st hit for pitch-elevator allowed')
expectOk(() => checkSceneRateLimit({ source: 'pitch-elevator' }), '2nd hit for pitch-elevator allowed')
// 3rd from same source must throw
expectThrow(() => checkSceneRateLimit({ source: 'pitch-elevator' }), '3rd hit for pitch-elevator blocked')

// A DIFFERENT source is tracked independently and must NOT be blocked by pitch-elevator's limit
expectOk(() => checkSceneRateLimit({ source: 'clt-alliance' }), '1st hit for a different source (clt-alliance) allowed')

console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'All scene-rate-limiter checks passed.')
