// src/print-design/bifold-html.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildFrontHtml, buildBackHtml } = require('./bifold-html')

const FIXTURE_PALETTE = { green: '#88AD59', gold: '#DAAB61', beige: '#E6D5B5' }

const FIXTURE_PHOTOS = {
  backCoverPhotoUrl: 'https://example.com/back.jpg',
  coverPhotoUrl: 'https://example.com/cover.jpg',
  interiorLeftPhotoUrl: 'https://example.com/left.jpg',
  interiorRightPhotoUrl: 'https://example.com/right.jpg',
  logoUrl: 'https://example.com/logo.png',
  qrUrl: 'https://example.com/qr.png',
}

const FIXTURE_CONTENT = {
  backCover: {
    bigWord: 'SHOW UP.\nNEXT.',
    taglineDesc: 'Built for brands that want more than impressions.',
    segs: [
      { label: 'Marketing Agencies', pitch: 'A physical asset you plug into any pitch.' },
      { label: 'Corporate & HR Teams', pitch: 'On-brand, on-site presence for launches and events.' },
      { label: 'Event Organizers & Sponsors', pitch: 'A premium sponsor zone that closes bigger deals.' },
    ],
    ctaLine: 'Scan to explore deployment options or schedule a conversation.',
    footerText: 'SNACKET®\nCharlotte, NC · snacketnow.com\nSNACKET Foods, LLC',
  },
  cover: {
    eyebrow: '',
    bigWord: 'YOUR BRAND.\nDEPLOYED.',
    taglineLead: '',
    taglineDesc: "Charlotte's fully electric mobile experiential media platform.",
    pillText: 'VISIBILITY · ENGAGEMENT · PROOF',
  },
  interiorLeft: {
    bigWord: 'SHOW UP.',
    taglineLead: 'Where your audience',
    taglineDesc: 'already is.',
    intro: 'SNACKET is structured activation infrastructure.',
    isList: ['A mobile brand activation platform', 'Scalable activation infrastructure', 'An EV-based physical media asset', 'On-demand deployment system'],
    isNotList: ['A marketing agency', 'A food truck', 'A catering company', 'A generic pop-up vendor'],
    resultRows: [
      { label: 'VISIBILITY', desc: 'The EV becomes a high-impact mobile brand asset.', color: 'green' },
      { label: 'ENGAGEMENT', desc: 'A defined activation area built for real interaction.', color: 'gold' },
      { label: 'PROOF', desc: 'Digital capture through QR, leads, and reporting.', color: 'green' },
    ],
  },
  interiorRight: {
    bigWord: 'LAYERS.',
    taglineLead: 'One platform.',
    taglineDesc: 'Built in layers.',
    layerRows: [
      { label: 'Hardware Layer', desc: 'EV SNACKET (NitroCafe, FreshBlend, or MixoBar)' },
      { label: 'Visibility Layer', desc: 'Brand Platform: full wrap, lift-up doors, interior panels' },
      { label: 'Engagement Layer', desc: 'Activation Area: backdrop, photo/social zone' },
      { label: 'Interaction Layer', desc: 'Brand Ambassador + EV Operator on-site' },
    ],
    fleetCards: [
      { name: 'NitroCafe', desc: 'Coffee & beverages, any time of day' },
      { name: 'FreshBlend', desc: 'Smoothies & wellness blends' },
      { name: 'MixoBar', desc: 'Mocktails, cocktails, premium bar' },
    ],
    addonsLine: 'Add-ons: branding & set design, digital lead capture, staffing, brand-aligned F&B.',
  },
}

test('buildFrontHtml + buildBackHtml render the correct physical sheet size (11.11in x 8.63in)', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const back = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  for (const html of [front, back]) {
    assert.match(html, /width:\s*11\.11in/)
    assert.match(html, /height:\s*8\.63in/)
  }
})

test('.content padding gives real cushion past the 0.125in safety line, not exactly on it', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.content\s*\{[^}]*padding:\s*0\.22in/)
  assert.doesNotMatch(html, /\.content\s*\{[^}]*padding:\s*0\.125in/)
})

test('the wordmark is SNACKET (not SNACKETNOW)', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /class="wordmark">SNACKET&reg;</)
  assert.doesNotMatch(html, /SNACKETNOW/)
})

test('compact brandRow (interior panels) renders wordmark only, no badge', () => {
  const back = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.doesNotMatch(back, /class="badge"/, 'interior panels should have no badge element')
  assert.match(back, /class="wordmark">SNACKET&reg;</, 'interior panels should still render wordmark')
})

test('full brandRow (front/back covers) still renders the badge', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const badgeCount = (front.match(/class="badge"/g) || []).length
  assert.equal(badgeCount, 2, 'buildFrontHtml renders 2 panels (back cover + cover), both should keep the badge')
})

test('interior panels use a compact brand row (no repeated tagline)', () => {
  const back = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const wmTagCount = (back.match(/class="wm-tag"/g) || []).length
  assert.equal(wmTagCount, 0, 'interior (buildBackHtml) panels should render zero wm-tag lines')
})

test('front cover and back cover keep the full brand row (with tagline)', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const wmTagCount = (front.match(/class="wm-tag"/g) || []).length
  assert.equal(wmTagCount, 2, 'buildFrontHtml renders 2 panels (back cover + cover), both full lockup')
})

test('bigWord with an embedded newline renders as <br>, single-line bigWord renders unchanged', () => {
  // Uses backCover (plain shared bigWordHtml()) rather than cover here: cover's
  // big-word now goes through the two-tone coverBigWordHtml() helper (see the
  // dedicated "cover big-word alternates gold/green per line" test below), which
  // still emits <br> between lines but wraps each line in a <span> too.
  const twoLine = { ...FIXTURE_CONTENT, backCover: { ...FIXTURE_CONTENT.backCover, bigWord: 'YOUR BRAND.\nDEPLOYED.' } }
  const html = buildFrontHtml({ content: twoLine, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /YOUR BRAND\.<br>DEPLOYED\./)

  const oneLine = { ...FIXTURE_CONTENT, interiorLeft: { ...FIXTURE_CONTENT.interiorLeft, bigWord: 'SHOW UP.' } }
  const back = buildBackHtml({ content: oneLine, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(back, /class="big-word">SHOW UP\.</)
  assert.doesNotMatch(back, /SHOW UP\.<br>/)
})

test('cover renders no eyebrow/lead markup when those fields are empty', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  // FIXTURE_CONTENT.cover.eyebrow === '' and taglineLead === ''
  assert.doesNotMatch(html, /class="eyebrow"/)
  assert.doesNotMatch(html, /class="lead"/)
})

test('cover still renders eyebrow/lead when those fields are non-empty', () => {
  const withEyebrow = {
    ...FIXTURE_CONTENT,
    cover: { ...FIXTURE_CONTENT.cover, eyebrow: 'Mobile Experiential Media', taglineLead: 'Your Brand.' },
  }
  const html = buildFrontHtml({ content: withEyebrow, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /class="eyebrow">Mobile Experiential Media</)
  assert.match(html, /class="lead">Your Brand\.</)
})

test('interior photos are not zoomed past their natural frame', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.doesNotMatch(html, /transform:\s*scale\(1\.15\)/)
})

test('cover panel docks the photo as a full-width <img>, not a cropped background', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const coverPanelHtml = html.split('panel-cover"').pop()
  assert.match(coverPanelHtml, /<img src="https:\/\/example\.com\/cover\.jpg"/)
  assert.doesNotMatch(coverPanelHtml, /panel-cover \.photo \{ background-image/)
})

test('cover panel has no tint layer (text no longer sits over the photo)', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const coverPanelMarkup = html.split('<div class="panel panel-cover">').pop()
  assert.doesNotMatch(coverPanelMarkup, /class="tint"/)
})

test('cover big-word alternates gold/green per line', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /<span class="bw-gold">YOUR BRAND\.<\/span><br><span class="bw-green">DEPLOYED\.<\/span>/)
})

test('cover hero photo gets the same left/right inset as other content', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.doesNotMatch(html, /:not\(\.cover-hero\)/)
})

test('back-cover renders an eyebrow line when provided, nothing when empty/absent', () => {
  const withEyebrow = { ...FIXTURE_CONTENT, backCover: { ...FIXTURE_CONTENT.backCover, eyebrow: 'Where should your brand' } }
  const html = buildFrontHtml({ content: withEyebrow, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /class="back-eyebrow">Where should your brand</)

  const withoutEyebrow = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.doesNotMatch(withoutEyebrow, /class="back-eyebrow"/)
})

// The back-cover photo is admin-uploadable per generation (HUB Photos tab).
// background-position: center 1cm pins the TOP offset as a fixed length, which
// is aspect-ratio-agnostic by construction (a CSS <length>, unlike a
// <percentage>, offsets the image edge from the container edge regardless of
// the image/container size difference) — the top mask-image stop is tuned
// once and stays correct for any photo. The BOTTOM mask-image stop is NOT
// aspect-ratio-agnostic: it's tuned to where the CURRENT photo's real bottom
// edge lands (computed from its actual dimensions), so it will need
// re-tuning if a future replacement photo has a meaningfully different aspect
// ratio (same re-tuning pattern already used for the two interior panels —
// see the git history on those). Directly verified against the real
// production photo (back-novacare-gala.jpg) via renderHtmlStringToPng: the
// image fades smoothly into the panel's near-black background, no hard seam.
test('back-cover photo uses contain + a mask-image fade (top offset is aspect-ratio-agnostic, bottom is tuned to the current photo), not a hard cover crop', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-back \.photo\s*\{[^}]*background-size:\s*contain/)
  assert.match(html, /\.panel-back \.photo\s*\{[^}]*mask-image:\s*linear-gradient/)
  assert.doesNotMatch(html, /::before|::after/)
})

test('interior panels use contain + mask-image letterbox, not a hard cover crop', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-left \.photo\s*\{[^}]*background-size:\s*contain/)
  assert.match(html, /\.panel-left \.photo\s*\{[^}]*mask-image:\s*linear-gradient/)
  assert.match(html, /\.panel-right \.photo\s*\{[^}]*background-size:\s*contain/)
  assert.match(html, /\.panel-right \.photo\s*\{[^}]*mask-image:\s*linear-gradient/)
})

// Client feedback (2026-07-31): push the letterboxed photo UP to a fixed ~1cm
// top gap instead of centering it, so the leftover letterbox space lands at
// the bottom instead of being split evenly. background-position: center 1cm
// is a CSS length, not a percentage, so it offsets the image's top edge by
// exactly 1cm regardless of the photo's aspect ratio (verified via
// renderHtmlStringToPng + raw pixel sampling: the real photo edge lands right
// at the predicted 4.6%-of-panel-height mark on all 3 panels).
test('back-cover and interior photos are pushed to a fixed 1cm top margin instead of centered', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const back = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(front, /\.panel-back \.photo\s*\{[^}]*background-position:\s*center 1cm/)
  assert.match(back, /\.panel-left \.photo\s*\{[^}]*background-position:\s*center 1cm/)
  assert.match(back, /\.panel-right \.photo\s*\{[^}]*background-position:\s*center 1cm/)
  assert.doesNotMatch(front, /\.panel-back \.photo\s*\{[^}]*background-position:\s*center center/)
  assert.doesNotMatch(back, /\.panel-left \.photo\s*\{[^}]*background-position:\s*center center/)
  assert.doesNotMatch(back, /\.panel-right \.photo\s*\{[^}]*background-position:\s*center center/)
})

// The mask must reach exactly 0% opacity right at the photo's real raster
// edge for the seam to actually dissolve rather than just soften before a
// hard cutoff (see the derivation in buildFrontHtml's .panel-back .photo
// comment). Top ramp is identical on all 3 panels since the 1cm top offset is
// now fixed regardless of photo; bottom ramp differs per panel because the
// bottom letterbox gap still depends on each photo's real aspect ratio.
test('the fade ramps hold transparent through the fixed ~4.6% top edge, not fading in immediately', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const back = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  for (const [html, selector] of [[front, '\\.panel-back \\.photo'], [back, '\\.panel-left \\.photo'], [back, '\\.panel-right \\.photo']]) {
    const re = new RegExp(selector + '\\s*\\{[^}]*mask-image:\\s*linear-gradient\\(to bottom, transparent 0%, transparent 4\\.6%, black 14%')
    assert.match(html, re, `${selector} should hold transparent through the fixed 4.6% edge before ramping to opaque`)
  }
})

test('back-cover bottom fade ramp is repositioned for the new, larger bottom letterbox gap', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-back \.photo\s*\{[^}]*black 31%, transparent 41%/)
})

test('interior panels bottom fade ramp is repositioned for the new, larger bottom letterbox gap', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-left \.photo\s*\{[^}]*black 60%, transparent 70%/)
  assert.match(html, /\.panel-right \.photo\s*\{[^}]*black 60%, transparent 70%/)
})

test('interior-right renders no taglineDesc markup when empty, renders it when present', () => {
  const empty = { ...FIXTURE_CONTENT, interiorRight: { ...FIXTURE_CONTENT.interiorRight, taglineDesc: '' } }
  const htmlEmpty = buildBackHtml({ content: empty, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const rightPanelEmpty = htmlEmpty.split('panel-right"').pop()
  assert.doesNotMatch(rightPanelEmpty, /class="desc"/)

  const withDesc = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(withDesc, /class="desc">Built in layers\./)
})

test('interior-left .glass and interior-right .row are narrower than the old 78%/82% to show more photo', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.doesNotMatch(html, /\.glass\s*\{[^}]*width:\s*78%/)
  assert.doesNotMatch(html, /\.row\s*\{[^}]*width:\s*82%/)
  assert.match(html, /\.glass\s*\{[^}]*width:\s*\d{1,2}%/)
  assert.match(html, /\.row\s*\{[^}]*width:\s*\d{1,2}%/)
})

module.exports = { FIXTURE_PALETTE, FIXTURE_PHOTOS, FIXTURE_CONTENT }
