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
    tagline: { top: "CHARLOTTE'S FIRST\nFULLY ELECTRIC", accent: 'MOBILE EXPERIENTIAL\nMEDIA PLATFORM.' },
  },
  back: {
    kicker: 'SNACKET',
    headline: { top: 'Your Brand.', accent: 'Deployed.' },
    subhead: 'Physical brand presence.\nOn demand.',
    qrLabel: 'See the platform in action',
  },
}
const BASE_PALETTE = { green: '#88AD59', gold: '#DAAB61', beige: '#E6D5B5', accentHex: '#88AD59' }
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

test('buildFrontHtml renders the tagline top and accent lines with a manual line break', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige }, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /CHARLOTTE'S FIRST<br>FULLY ELECTRIC/)
  assert.match(html, /MOBILE EXPERIENTIAL<br>MEDIA PLATFORM\./)
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
    content: { ...FIXTURE_CONTENT, front: { ...FIXTURE_CONTENT.front, name: '<script>alert(1)</script>' } },
    palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige },
    photoUrls: FIXTURE_PHOTOS,
  })
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&lt;script&gt;/)
})

test('buildFrontHtml supports a literal newline in name for manual line-wrap control', () => {
  const html = buildFrontHtml({
    content: { ...FIXTURE_CONTENT, front: { ...FIXTURE_CONTENT.front, name: 'Johanna\nSuarez' } },
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

test('buildFrontHtml does not render the title in the same color as the background', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.accentHex }, photoUrls: FIXTURE_PHOTOS })
  const titleRuleMatch = html.match(/\.title \{[^}]*\}/)
  assert.ok(titleRuleMatch, 'expected a .title CSS rule in the output')
  assert.ok(!titleRuleMatch[0].includes(BASE_PALETTE.accentHex), `.title should not be accentHex when background matches accentHex, got: ${titleRuleMatch[0]}`)
  assert.match(titleRuleMatch[0], /var\(--charcoal\)/)
})

test('buildFrontHtml does not render the tagline accent in the same color as the background', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.accentHex }, photoUrls: FIXTURE_PHOTOS })
  const tagAccentRuleMatch = html.match(/\.tag-accent \{[^}]*\}/)
  assert.ok(tagAccentRuleMatch, 'expected a .tag-accent CSS rule in the output')
  assert.ok(!tagAccentRuleMatch[0].includes(BASE_PALETTE.accentHex), `.tag-accent should not be accentHex when background matches accentHex, got: ${tagAccentRuleMatch[0]}`)
  assert.match(tagAccentRuleMatch[0], /var\(--charcoal\)/)
})

test('buildBackHtml does not render the headline accent in the same color as the background', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.accentHex }, photoUrls: FIXTURE_PHOTOS })
  const h1AccentRuleMatch = html.match(/\.h1-accent \{[^}]*\}/)
  assert.ok(h1AccentRuleMatch, 'expected a .h1-accent CSS rule in the output')
  assert.ok(!h1AccentRuleMatch[0].includes(BASE_PALETTE.accentHex), `.h1-accent should not be accentHex when background matches accentHex, got: ${h1AccentRuleMatch[0]}`)
  assert.match(h1AccentRuleMatch[0], /var\(--charcoal\)/)
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

test('buildBackHtml renders the kicker, headline, subhead, and QR label from content.back', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige }, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, />SNACKET</)
  assert.match(html, />Your Brand\.</)
  assert.match(html, />Deployed\.</)
  assert.match(html, /Physical brand presence\.<br>On demand\./)
  assert.match(html, />See the platform in action</)
})

test('buildBackHtml escapes unsafe characters in back content fields', () => {
  const html = buildBackHtml({
    content: { ...FIXTURE_CONTENT, back: { ...FIXTURE_CONTENT.back, kicker: '<script>alert(1)</script>' } },
    palette: { ...BASE_PALETTE, backgroundHex: BASE_PALETTE.beige },
    photoUrls: FIXTURE_PHOTOS,
  })
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&lt;script&gt;/)
})
