// src/print-design/bifold-html.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildFrontHtml, buildBackHtml } = require('./bifold-html')

const FIXTURE_PALETTE = { green: '#88AD59', gold: '#DAAB61', beige: '#E6D5B5' }

const FIXTURE_PHOTOS = {
  backCoverPhotoUrl: 'https://example.com/back.jpg',
  coverPhotoUrl: 'https://example.com/cover.jpg',
  interiorSpreadPhotoUrl: 'https://example.com/spread.jpg',
  logoUrl: 'https://example.com/logo.png',
  qrUrl: 'https://example.com/qr.png',
}

// v4 content refresh (2026-08-01) — back cover and both interior panels moved
// from short poster-style copy to long-form paragraphs + dense enumerated
// lists (10-12 items). Field names changed to match: backCover dropped
// eyebrow/taglineDesc/segs for intro/idealForList/ctaHeading; interiorLeft
// dropped taglineLead/taglineDesc/intro/isList/isNotList/resultRows for
// paragraphs/whyItMattersLines/whatYouGainList; interiorRight dropped
// taglineLead/taglineDesc/layerRows for intro/builtToCreate/deployedForList.
const FIXTURE_CONTENT = {
  backCover: {
    bigWord: 'WHERE SHOULD YOUR BRAND\nSHOW UP NEXT?',
    intro: "Whether you're launching a product or engaging employees, SNACKET helps your brand become part of people's day.",
    idealForList: [
      'Marketing Teams', 'Corporate & HR', 'Property Developers', 'Sports & Entertainment',
      'Healthcare Systems', 'Universities', 'Economic Development', 'Community Organizations',
      'Marketing Agencies', 'Event Professionals',
    ],
    ctaHeading: 'Ready To Deploy Your Brand?',
    ctaLine: 'Scan the QR code to explore deployment options or schedule a strategy conversation.',
    footerText: 'SNACKET®\nCharlotte, North Carolina\nWhere Brands Show Up™',
  },
  cover: {
    eyebrow: '',
    bigWord: 'YOUR BRAND.\nDEPLOYED.',
    taglineLead: '',
    taglineDesc: "Charlotte's first fully electric mobile experiential media platform.",
    pillText: 'VISIBILITY · ENGAGEMENT · PROOF',
  },
  interiorLeft: {
    bigWord: 'YOUR AUDIENCE\nIS ALREADY OUT THERE.',
    paragraphs: [
      'Every day, people interact with places, not advertisements.',
      "The question isn't whether your audience is there.",
      "It's whether your brand is.",
    ],
    whyItMattersLines: [
      'Digital builds awareness.',
      'Physical builds connection.',
      'The strongest brands combine both.',
    ],
    whatYouGainList: [
      'More visibility', 'More engagement', 'More memorable experiences', 'More branded content', 'More measurable interaction',
    ],
  },
  interiorRight: {
    bigWord: 'ONE PLATFORM.\nENDLESS POSSIBILITIES.',
    intro: 'SNACKET combines mobile media, immersive environments, and audience engagement into one deployable platform.',
    builtToCreate: [
      { label: 'Visibility', desc: 'A fully branded mobile presence that captures attention wherever it goes.' },
      { label: 'Engagement', desc: 'Interactive spaces designed for conversation, networking, and participation.' },
      { label: 'Proof', desc: 'QR engagement, lead capture, branded content, and post-deployment reporting.' },
    ],
    deployedForList: [
      'Corporate Networking', 'Product Launches', 'Recruiting Events', 'Employee Appreciation',
      'Sponsor Hospitality', 'Resident Engagement', 'Community Activations', 'University Campaigns',
      'Healthcare Outreach', 'Sports & Entertainment', 'Mixed-Use Developments', 'Brand Tours',
    ],
    fleetCards: [
      { name: 'NitroCafe', desc: 'Coffee-forward experiences for networking, recruiting, and employee engagement.' },
      { name: 'FreshBlend', desc: 'Wellness-focused experiences for campuses and community events.' },
      { name: 'MixoBar', desc: 'Premium hospitality experiences for sponsorships and evening activations.' },
    ],
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

test('front cover keeps the full brand row (with tagline); back cover is now compact too (title-led redesign)', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const wmTagCount = (front.match(/class="wm-tag"/g) || []).length
  assert.equal(wmTagCount, 2, 'both panels in buildFrontHtml call brandRow with the default full variant')
})

test('bigWord with an embedded newline renders as <br>, single-line bigWord renders unchanged', () => {
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

test('cover panel content is pushed down 2cm (1.0074in top padding) with the bottom unchanged at 0.22in', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-cover \.content\s*\{[^}]*padding:\s*1\.0074in 0 0\.22in 0/)
})

test('cover-hero-tint opacity was reduced so the photo (buildings) reads through clearly', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const tintCss = html.match(/\.cover-hero-tint\s*\{[^}]*\}/)[0]
  assert.match(tintCss, /rgba\(54, 60, 67, 0\.30\)/)
  assert.doesNotMatch(tintCss, /0\.55/)
})

// Client feedback (2026-08-01): switched from a natural-aspect <img> to a
// shorter fixed-aspect-ratio background-image (cover, biased toward the top
// of the source photo) so less empty foreground pavement shows and more of
// the buildings/skyline stay in frame.
test('cover-hero crops the photo to a fixed aspect ratio via cover + top-biased position, not a natural-aspect <img>', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const coverPanelHtml = html.split('panel-cover"').pop()
  assert.doesNotMatch(coverPanelHtml, /<img src="https:\/\/example\.com\/cover\.jpg"/)
  assert.match(html, /\.cover-hero\s*\{[^}]*background-image:\s*url\('https:\/\/example\.com\/cover\.jpg'\)/)
  assert.match(html, /\.cover-hero\s*\{[^}]*background-size:\s*cover/)
  assert.match(html, /\.cover-hero\s*\{[^}]*aspect-ratio:\s*1\.72/)
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

test('cover hero photo is full-bleed to the panel sides, not inset like other content', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /:not\(\.cover-hero\)/)
})

test('cover hero photo fades top and bottom via mask-image, not left/right', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const coverHeroCss = html.match(/\.cover-hero\s*\{[^}]*\}/)[0]
  assert.match(coverHeroCss, /mask-image:\s*linear-gradient\(to bottom/)
})

test('back cover has no eyebrow (folded into the unified two-line bigWord instead)', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.doesNotMatch(html, /class="back-eyebrow"/)
  assert.match(html, /WHERE SHOULD YOUR BRAND<br>SHOW UP NEXT\?/)
})

test('back-cover photo uses contain + a mask-image fade (top offset is aspect-ratio-agnostic, bottom is tuned to the current photo), not a hard cover crop', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-back \.photo\s*\{[^}]*background-size:\s*contain/)
  assert.match(html, /\.panel-back \.photo\s*\{[^}]*mask-image:\s*linear-gradient/)
  assert.doesNotMatch(html, /\.panel-back \.photo::before|\.panel-back \.photo::after/)
})

test('back-cover gets an additional soft charcoal wash layer on top of the existing legibility tint', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /<div class="charcoal-wash"><\/div>/)
  assert.match(html, /\.panel-back \.charcoal-wash\s*\{[^}]*background:\s*rgba\(54, 60, 67, 0\.28\)/)
})

test('back-cover CTA row (QR + right-aligned 2-line CTA text) is pinned to the bottom, independent of copy length; footer sits on one line below it with a 1cm bottom margin', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.cta-row\s*\{[^}]*margin-top:\s*auto/)
  assert.match(html, /\.cta-line\s*\{[^}]*text-align:\s*right/)
  assert.match(html, /\.panel-back \.content\s*\{[^}]*padding-bottom:\s*1cm/)
  const backPanelHtml = html.split('<div class="panel panel-back">')[1].split('<div class="panel panel-cover">')[0]
  assert.match(backPanelHtml, /class="bfoot-single"/)
  assert.doesNotMatch(backPanelHtml, /class="bblock"/)
})

test('back-cover renders the 10-item "Ideal For" tag grid, not the old 3-seg label/pitch list', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const backPanelHtml = html.split('<div class="panel panel-back">')[1].split('<div class="panel panel-cover">')[0]
  const tagCount = (backPanelHtml.match(/class="tag-item"/g) || []).length
  assert.equal(tagCount, 10)
  assert.doesNotMatch(backPanelHtml, /class="seg"/)
  assert.match(backPanelHtml, /Ideal For/)
  assert.match(backPanelHtml, /Ready To Deploy Your Brand\?/)
})

test('interior-left and interior-right share ONE spread photo (same URL), not two independent photos', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const urlCount = (html.match(/url\('https:\/\/example\.com\/spread\.jpg'\)/g) || []).length
  assert.equal(urlCount, 1, 'a single shared .panel-left .photo, .panel-right .photo rule should declare the background-image once')
  assert.match(html, /\.panel-left \.photo, \.panel-right \.photo\s*\{[^}]*url\('https:\/\/example\.com\/spread\.jpg'\)/, 'both selectors should be combined into one rule, not two separate ones')
  assert.doesNotMatch(html, /interiorLeftPhotoUrl|interiorRightPhotoUrl/)
})

test('interior spread photo is split across both panels: same size/position-y, offset position-x one panel-width apart', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-left \.photo, \.panel-right \.photo\s*\{[^}]*background-size:\s*10\.98in 7\.8467in/)
  assert.match(html, /\.panel-left \.photo, \.panel-right \.photo\s*\{[^}]*background-position-y:\s*0\.3266in/)
  assert.match(html, /\.panel-left \.photo\s*\{\s*background-position-x:\s*0in/)
  assert.match(html, /\.panel-right \.photo\s*\{\s*background-position-x:\s*-5\.49in/)
  assert.match(html, /\.panel-left \.photo, \.panel-right \.photo\s*\{[^}]*mask-image:\s*linear-gradient/)
})

test('back-cover photo is pushed to a fixed 1cm top margin instead of centered', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(front, /\.panel-back \.photo\s*\{[^}]*background-position:\s*center 1cm/)
  assert.doesNotMatch(front, /\.panel-back \.photo\s*\{[^}]*background-position:\s*center center/)
})

test('interior spread photo is vertically centered (no client ask to push it up, unlike back-cover)', () => {
  const back = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(back, /\.panel-left \.photo, \.panel-right \.photo\s*\{[^}]*background-position-y:\s*0\.3266in/)
  assert.doesNotMatch(back, /background-position:\s*center 1cm/)
})

test('back-cover fade ramp holds transparent through the fixed ~4.6% top edge, not fading in immediately', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(front, /\.panel-back \.photo\s*\{[^}]*mask-image:\s*linear-gradient\(to bottom, transparent 0%, transparent 4\.6%, black 14%/)
})

test('interior spread fade ramp holds transparent through its own true edge (~3.8%, letterbox math differs from back-cover)', () => {
  const back = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(back, /\.panel-left \.photo, \.panel-right \.photo\s*\{[^}]*mask-image:\s*linear-gradient\(to bottom, transparent 0%, transparent 3\.843%, black 13\.8%/)
})

test('back-cover bottom fade ramp is repositioned for the new, larger bottom letterbox gap', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-back \.photo\s*\{[^}]*black 29\.962%, transparent 39\.962%/)
})

test('interior spread bottom fade ramp mirrors the top ramp, symmetric around the centered letterbox', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-left \.photo, \.panel-right \.photo\s*\{[^}]*black 86\.2%, transparent 96\.157%/)
})

test('interior-left renders all paragraphs, the "Why It Matters" lines, and the "What You Gain" list', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const leftPanelHtml = html.split('<div class="panel panel-left">')[1].split('<div class="panel panel-right">')[0]
  for (const p of FIXTURE_CONTENT.interiorLeft.paragraphs) assert.match(leftPanelHtml, new RegExp(`<p>${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;')}</p>`))
  assert.match(leftPanelHtml, /Why It Matters/)
  const whyLineCount = (leftPanelHtml.match(/class="why-line"/g) || []).length
  assert.equal(whyLineCount, 3)
  assert.match(leftPanelHtml, /What You Gain/)
  const gainCount = (leftPanelHtml.match(/<li>/g) || []).length
  assert.equal(gainCount, 5)
  assert.doesNotMatch(leftPanelHtml, /SNACKET IS NOT|class="isnot"/)
})

test('interior-right renders "Built To Create" rows, the 12-item "Deployed For" tag grid, and fleet cards', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const rightPanelHtml = html.split('<div class="panel panel-right">').pop()
  assert.match(rightPanelHtml, /Built To Create/)
  const rowCount = (rightPanelHtml.match(/class="row"/g) || []).length
  assert.equal(rowCount, 3, 'builtToCreate has 3 items (Visibility/Engagement/Proof), not the old 4 layerRows')
  assert.match(rightPanelHtml, /Deployed For/)
  const tagCount = (rightPanelHtml.match(/class="tag-item"/g) || []).length
  assert.equal(tagCount, 12)
  assert.match(rightPanelHtml, /Configured To Match Your Experience/)
  const fleetCount = (rightPanelHtml.match(/class="fleet-card"/g) || []).length
  assert.equal(fleetCount, 3)
})

test('interior-left .glass and interior-right .row do not use the old fixed 60%/62% width', () => {
  const html = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.doesNotMatch(html, /\.glass\s*\{[^}]*width:\s*60%/)
  assert.doesNotMatch(html, /\.row\s*\{[^}]*width:\s*62%/)
})

test('the sheet and cover panel use the charcoal background, not near-black', () => {
  const front = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  const back = buildBackHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  for (const html of [front, back]) {
    assert.match(html, /\.sheet\s*\{[^}]*background:\s*var\(--charcoal\)/)
    assert.doesNotMatch(html, /\.sheet\s*\{[^}]*background:\s*var\(--near-black\)/)
  }
  assert.match(front, /\.panel-cover\s*\{[^}]*background:\s*var\(--charcoal\)/)
})

test('cover big-word has breathing room below the brand row instead of sitting flush against it', () => {
  const html = buildFrontHtml({ content: FIXTURE_CONTENT, palette: FIXTURE_PALETTE, photoUrls: FIXTURE_PHOTOS })
  assert.match(html, /\.panel-cover \.big-word\s*\{[^}]*margin-top:\s*22px/)
})

module.exports = { FIXTURE_PALETTE, FIXTURE_PHOTOS, FIXTURE_CONTENT }
