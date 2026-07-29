// src/print-design/business-card-v2-html.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildFrontHtml, buildBackHtml } = require('./business-card-v2-html')

const FIXTURE_CONTENT = {
  front: {
    name: 'Johanna Suarez',
    title: 'Founder & CEO',
    phone: '704-449-3542',
    email: 'info@snacketfoods.net',
    website: 'snacketnow.com',
    location: 'Charlotte, NC',
  },
}
const BASE_PALETTE = { green: '#88AD59', gold: '#DAAB61', beige: '#E6D5B5' }
const FIXTURE_PHOTOS = {
  mixobarUrl: 'https://example.com/mixobar.png',
  logoUrl: 'https://example.com/logo.png',
  qrUrl: 'https://example.com/qr.png',
}

test('buildFrontHtml renders name/title and all 4 contact rows for a light background', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige }, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, />Johanna Suarez</)
  assert.match(html, />Founder &amp; CEO</)
  assert.match(html, />704-449-3542</)
  assert.match(html, />info@snacketfoods\.net</)
  assert.match(html, />snacketnow\.com</)
  assert.match(html, />Charlotte, NC</)
  assert.match(html, /logo\.png/)
})

test('buildFrontHtml uses a plain logo (no plate) on a light background', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige }, photoUrls: FIXTURE_PHOTOS })
  assert.ok(!html.includes('logo-plate'))
})

test('buildFrontHtml wraps the logo in a light plate on the charcoal background', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: '#363C43' }, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /class="logo-plate"/)
})

test('buildFrontHtml escapes unsafe characters in name/title (no raw HTML injection)', () => {
  const html = buildFrontHtml({
    content: { front: { ...FIXTURE_CONTENT.front, name: '<script>alert(1)</script>' } },
    palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige },
    photoUrls: FIXTURE_PHOTOS,
  })
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&lt;script&gt;/)
})

test('buildFrontHtml supports a literal newline in name for manual line-wrap control', () => {
  const html = buildFrontHtml({
    content: { front: { ...FIXTURE_CONTENT.front, name: 'Johanna\nSuarez' } },
    palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige },
    photoUrls: FIXTURE_PHOTOS,
  })
  assert.match(html, /Johanna<br>Suarez/)
})

test('buildFrontHtml renders the correct physical sheet size (3.62in x 2.12in)', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige }, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /width:\s*3\.62in/)
  assert.match(html, /height:\s*2\.12in/)
})

test('buildFrontHtml does not render the title in gold-on-gold when the background itself is gold', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.gold }, photoUrls: FIXTURE_PHOTOS })
  const titleRuleMatch = html.match(/\.title \{[^}]*\}/)
  assert.ok(titleRuleMatch, 'expected a .title CSS rule in the output')
  assert.ok(!titleRuleMatch[0].includes('var(--gold)'), `.title should not be var(--gold) when background is gold, got: ${titleRuleMatch[0]}`)
  assert.match(titleRuleMatch[0], /var\(--charcoal\)/)
})

test('buildFrontHtml does not render the tag "g" span in green-on-green when the background itself is green', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.green }, photoUrls: FIXTURE_PHOTOS })
  const tagGRuleMatch = html.match(/\.tag \.g \{[^}]*\}/)
  assert.ok(tagGRuleMatch, 'expected a .tag .g CSS rule in the output')
  assert.ok(!tagGRuleMatch[0].includes('var(--green)'), `.tag .g should not be var(--green) when background is green, got: ${tagGRuleMatch[0]}`)
  assert.match(tagGRuleMatch[0], /var\(--charcoal\)/)
})

test('buildBackHtml does not render the h1 "g" span in green-on-green when the background itself is green', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.green }, photoUrls: FIXTURE_PHOTOS })
  const h1GRuleMatch = html.match(/\.h1 \.g \{[^}]*\}/)
  assert.ok(h1GRuleMatch, 'expected a .h1 .g CSS rule in the output')
  assert.ok(!h1GRuleMatch[0].includes('var(--green)'), `.h1 .g should not be var(--green) when background is green, got: ${h1GRuleMatch[0]}`)
  assert.match(h1GRuleMatch[0], /var\(--charcoal\)/)
})

test('buildBackHtml renders the mixobar photo mirrored and the QR code, no photo-plate on a light background', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige }, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /mixobar\.png/)
  assert.match(html, /scaleX\(-1\)/)
  assert.match(html, /qr\.png/)
  assert.ok(!html.includes('photo-plate'))
})

test('buildBackHtml adds a photo-plate window behind the photo on the charcoal background', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: '#363C43' }, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /class="photo-plate"/)
})

test('buildBackHtml has no editable back-side text content (static tagline only)', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige }, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /Your Brand\./)
  assert.match(html, /Deployed\./)
})
