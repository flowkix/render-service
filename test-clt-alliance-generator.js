// render-service/test-clt-alliance-generator.js
// Manual verification against a LOCAL running server — run with:
//   node server.js &        (in one terminal)
//   node test-clt-alliance-generator.js   (in another)
const axios = require('axios')

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080'
// logo.clearbit.com's free logo API subdomain is dead (DNS no longer resolves as of
// 2026-07-21 — confirmed clearbit.com itself still resolves, only logo./assets.
// subdomains don't). ui-avatars.com generates a live placeholder logo image on the
// fly and needs no auth, so it's a stable stand-in for this fixture.
const LOGO_URL = 'https://ui-avatars.com/api/?name=Test+Co&size=256&background=0D8ABC&color=fff'

async function main() {
  const email = `test-${Date.now()}@example.com`
  const resp = await axios.post(`${BASE_URL}/generate-ev-scene-public`, {
    name: 'Test User',
    company: 'Test Co',
    email,
    logo_source: LOGO_URL,
    honeypot: '',
  }, { timeout: 60000, validateStatus: () => true })

  if (resp.status !== 200 || !resp.data.ok || !resp.data.image_url) {
    throw new Error(`FAIL — status ${resp.status}, body ${JSON.stringify(resp.data)}`)
  }
  console.log('PASS — generated image:', resp.data.image_url)

  // Rate limit check: same email again should 429
  const resp2 = await axios.post(`${BASE_URL}/generate-ev-scene-public`, {
    name: 'Test User', company: 'Test Co',
    email,
    logo_source: LOGO_URL,
    honeypot: '',
  }, { validateStatus: () => true })
  if (resp2.status !== 429) throw new Error(`FAIL — expected 429 on repeat, got ${resp2.status}`)
  console.log('PASS — rate limit correctly blocked repeat submission from same email')

  // SSRF guard check: private/reserved-IP targets must be rejected before any real fetch.
  const ssrfTargets = [
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:8080/health',
  ]
  for (const target of ssrfTargets) {
    const ssrfResp = await axios.post(`${BASE_URL}/generate-ev-scene-public`, {
      name: 'Test User',
      company: 'Test Co',
      email: `ssrf-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      logo_source: target,
      honeypot: '',
    }, { timeout: 20000, validateStatus: () => true })
    if (ssrfResp.status !== 500 || ssrfResp.data.ok !== false) {
      throw new Error(`FAIL — expected SSRF target ${target} to be rejected, got status ${ssrfResp.status}, body ${JSON.stringify(ssrfResp.data)}`)
    }
    console.log(`PASS — SSRF guard blocked ${target}`)
  }
}

main().catch(err => { console.error(err.message); process.exit(1) })
