// render-service/test-scene-generator-v2.js
// Manual verification against a LOCAL running server — run with:
//   node server.js &        (in one terminal, with RENDER_SECRET set in the environment)
//   node test-scene-generator-v2.js   (in another, with the same RENDER_SECRET)
const axios = require('axios')

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080'
const RENDER_SECRET = process.env.RENDER_SECRET

async function main() {
  if (!RENDER_SECRET) throw new Error('RENDER_SECRET env var must be set to run this test')

  // Wrong secret must be rejected
  const unauthorized = await axios.post(`${BASE_URL}/generate-ev-scene-v2`, {
    source: 'test', company_name: 'Test Co', logo_source: 'https://www.google.com/s2/favicons?domain=stripe.com&sz=256', // logo.clearbit.com is confirmed permanently dead (DNS ENOTFOUND) — see feedback_prod_e2e_catches_what_review_misses.md
    theme: 'test', venue: 'test',
  }, { headers: { 'X-Render-Secret': 'wrong-secret' }, validateStatus: () => true })
  if (unauthorized.status !== 401) throw new Error(`FAIL — expected 401 with wrong secret, got ${unauthorized.status}`)
  console.log('PASS — wrong secret correctly rejected with 401')

  // Real generation with the correct secret
  const resp = await axios.post(`${BASE_URL}/generate-ev-scene-v2`, {
    source: 'test-e2e',
    company_name: 'Test Co',
    logo_source: 'https://www.google.com/s2/favicons?domain=stripe.com&sz=256', // logo.clearbit.com is confirmed permanently dead (DNS ENOTFOUND) — see feedback_prod_e2e_catches_what_review_misses.md
    theme: 'bright energetic daytime brand activation',
    venue: 'urban plaza surrounded by glass office towers',
  }, { headers: { 'X-Render-Secret': RENDER_SECRET }, timeout: 120000, validateStatus: () => true })

  if (resp.status !== 200 || !resp.data.ok || !resp.data.image_url) {
    throw new Error(`FAIL — status ${resp.status}, body ${JSON.stringify(resp.data)}`)
  }
  console.log('PASS — generated scene image:', resp.data.image_url)
}

main().catch(err => { console.error(err.message); process.exit(1) })
