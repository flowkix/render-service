'use strict'

process.env.BRANDING_RATE_LIMIT_PER_SOURCE_HOUR = '2'
const { checkBrandingRateLimit } = require('./src/ev-engine/branding-rate-limiter')

function expectOk(fn, label) {
  try {
    fn()
    console.log(`PASS: ${label}`)
  } catch (err) {
    console.log(`FAIL: ${label} — threw unexpectedly: ${err.message}`)
    process.exitCode = 1
  }
}

function expectThrow(fn, label) {
  try {
    fn()
    console.log(`FAIL: ${label} — did not throw`)
    process.exitCode = 1
  } catch (err) {
    console.log(`PASS: ${label} (${err.message})`)
  }
}

expectOk(() => checkBrandingRateLimit({ source: 'test-a' }), 'first request for source allowed')
expectOk(() => checkBrandingRateLimit({ source: 'test-a' }), 'second request for source allowed (limit=2)')
expectThrow(() => checkBrandingRateLimit({ source: 'test-a' }), 'third request for source blocked')
expectOk(() => checkBrandingRateLimit({ source: 'test-b' }), 'different source has its own quota')
expectThrow(() => checkBrandingRateLimit({ source: '' }), 'empty source rejected')
