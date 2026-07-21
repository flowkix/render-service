// render-service/test-rate-limiter.js
// Manual verification — run with: node test-rate-limiter.js
process.env.CLT_RATE_LIMIT_PER_IP_HOUR = '2'
process.env.CLT_RATE_LIMIT_PER_EMAIL_DAY = '1'
const { checkRateLimit } = require('./src/ev-engine/rate-limiter')

function expectThrow(fn, label) {
  try { fn(); throw new Error(`FAIL — ${label} should have thrown`) }
  catch (e) { console.log(`PASS — ${label}: ${e.message}`) }
}

// 2 allowed for the same IP with different emails (per-IP limit is 2)
checkRateLimit({ ip: '1.2.3.4', email: 'a@test.com' })
checkRateLimit({ ip: '1.2.3.4', email: 'b@test.com' })
// 3rd from same IP must throw (per-IP limit)
expectThrow(() => checkRateLimit({ ip: '1.2.3.4', email: 'c@test.com' }), 'per-IP hourly limit')

// Same email twice (different IP) must throw on the 2nd (per-email daily limit = 1)
checkRateLimit({ ip: '5.6.7.8', email: 'd@test.com' })
expectThrow(() => checkRateLimit({ ip: '9.9.9.9', email: 'd@test.com' }), 'per-email daily limit')

console.log('All rate-limiter checks passed.')
