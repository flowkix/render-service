// render-service/test-guide-rate-limiter.js
// Manual verification — run with: node test-guide-rate-limiter.js
process.env.GUIDE_RATE_LIMIT_PER_IP_HOUR = '2'
process.env.GUIDE_RATE_LIMIT_PER_EMAIL_DAY = '1'
const { checkGuideRateLimit } = require('./src/ev-engine/guide-rate-limiter')

function expectThrow(fn, label) {
  try { fn(); console.log(`FAIL — ${label} should have thrown`); process.exitCode = 1 }
  catch (e) { console.log(`PASS — ${label}: ${e.message}`) }
}

checkGuideRateLimit({ ip: '1.2.3.4', email: 'a@test.com' })
checkGuideRateLimit({ ip: '1.2.3.4', email: 'b@test.com' })
expectThrow(() => checkGuideRateLimit({ ip: '1.2.3.4', email: 'c@test.com' }), 'per-IP hourly limit')

checkGuideRateLimit({ ip: '5.6.7.8', email: 'd@test.com' })
expectThrow(() => checkGuideRateLimit({ ip: '9.9.9.9', email: 'd@test.com' }), 'per-email daily limit')

console.log('All guide-rate-limiter checks passed.')
