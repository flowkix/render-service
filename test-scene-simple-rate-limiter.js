// render-service/test-scene-simple-rate-limiter.js
// Manual verification — run with: node test-scene-simple-rate-limiter.js
process.env.SIMPLE_SCENE_RATE_LIMIT_PER_SOURCE_HOUR = '2'
const { checkSimpleSceneRateLimit } = require('./src/ev-engine/scene-simple-rate-limiter')

function expectThrow(fn, label) {
  try { fn(); console.log(`FAIL — ${label} should have thrown`); process.exitCode = 1 }
  catch (e) { console.log(`PASS — ${label}: ${e.message}`) }
}
function expectOk(fn, label) {
  try { fn(); console.log(`PASS — ${label}`) }
  catch (e) { console.log(`FAIL — ${label} threw unexpectedly: ${e.message}`); process.exitCode = 1 }
}

expectThrow(() => checkSimpleSceneRateLimit({}), 'missing source throws')

expectOk(() => checkSimpleSceneRateLimit({ source: 'test-caller' }), '1st hit for test-caller allowed')
expectOk(() => checkSimpleSceneRateLimit({ source: 'test-caller' }), '2nd hit for test-caller allowed')
expectThrow(() => checkSimpleSceneRateLimit({ source: 'test-caller' }), '3rd hit for test-caller blocked')

expectOk(() => checkSimpleSceneRateLimit({ source: 'a-different-caller' }), '1st hit for a different source allowed')

console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'All scene-simple-rate-limiter checks passed.')
