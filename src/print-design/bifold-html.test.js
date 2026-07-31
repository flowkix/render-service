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

module.exports = { FIXTURE_PALETTE, FIXTURE_PHOTOS, FIXTURE_CONTENT }
