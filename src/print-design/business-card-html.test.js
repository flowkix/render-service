// src/print-design/business-card-html.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildFrontHtml, buildBackHtml } = require('./business-card-html')

const FIXTURE_CONTENT = {
  front: { name: 'Johanna\nSuarez', title: 'CEO' },
  back: { phone: '704-449-3542', email: 'sales@snacketfoods.net', website: 'snacketnow.com' },
}
const FIXTURE_PALETTE = { green: '#88AD59', gold: '#DAAB61', beige: '#E6D5B5' }
const FIXTURE_PHOTOS = {
  evPhotoUrl: 'https://example.com/ev.jpg',
  mixobarUrl: 'https://example.com/mixobar.png',
  logoUrl: 'https://example.com/logo.png',
  qrUrl: 'https://example.com/qr.png',
}

test('buildFrontHtml renders the name with a <br> line break, the title, and the mixobar/logo photo URLs', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /Johanna<br>Suarez/)
  assert.match(html, />CEO</)
  assert.match(html, /mixobar\.png/)
  assert.match(html, /logo\.png/)
})

test('buildBackHtml renders all 3 contact pills and the ev photo/QR URLs', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /704-449-3542/)
  assert.match(html, /sales@snacketfoods\.net/)
  assert.match(html, /snacketnow\.com/)
  assert.match(html, /ev\.jpg/)
  assert.match(html, /qr\.png/)
})

test('buildFrontHtml escapes unsafe characters in name/title (no raw HTML injection)', () => {
  const html = buildFrontHtml({
    content: { front: { name: '<script>alert(1)</script>', title: 'CEO' }, back: FIXTURE_CONTENT.back },
    palette: FIXTURE_PALETTE,
    photoUrls: FIXTURE_PHOTOS,
  })
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&lt;script&gt;/)
})
