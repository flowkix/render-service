// render-service/test-clt-alliance-upload.js
// Manual verification (no test framework wired in this repo) — run with: node test-clt-alliance-upload.js
require('dotenv').config()
const { randomUUID } = require('crypto')
const { uploadCltAlliancePreview } = require('./src/ev-engine/clt-alliance-upload')

async function main() {
  // 1x1 red PNG, smallest valid PNG for a smoke test
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
  const testId = randomUUID()
  const url = await uploadCltAlliancePreview(tinyPng, testId)
  console.log('Uploaded:', url)
  const resp = await require('axios').get(url, { responseType: 'arraybuffer' })
  if (resp.status !== 200) throw new Error(`Fetch back failed: ${resp.status}`)
  console.log('PASS — round-trip upload + public fetch works,', resp.data.length, 'bytes')
}

main().catch(err => { console.error('FAIL —', err.message); process.exit(1) })
