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
  const twoLine = { ...FIXTURE_CONTENT, cover: { ...FIXTURE_CONTENT.cover, bigWord: 'YOUR BRAND.\nDEPLOYED.' } }
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

module.exports = { FIXTURE_PALETTE, FIXTURE_PHOTOS, FIXTURE_CONTENT }
