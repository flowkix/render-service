const { buildEffectsCss } = require('./effects-template')
const { loadFontFaceCss } = require('./fonts')
const { escapeHtml, escapeAttr } = require('./html-escape')

const WORDMARK = 'SNACKET&reg;'
const WM_TAG = 'Where Brands Show Up'

function brandRow(logoUrl, variant = 'full') {
  if (variant === 'full') {
    return `
      <div class="brand-row">
        <div class="badge"><img src="${escapeAttr(logoUrl)}"></div>
        <div class="wordmark-col"><div class="wordmark">${WORDMARK}</div><div class="wm-tag">${WM_TAG}</div></div>
      </div>`
  }
  return `
      <div class="brand-row brand-row--compact">
        <div class="wordmark">${WORDMARK}</div>
      </div>`
}

function sharedHead(palette) {
  return `
<meta charset="utf-8">
<style>${loadFontFaceCss()}</style>
<style>${buildEffectsCss(palette)}</style>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Barlow', sans-serif; }
  .sheet { position: relative; width: 11.11in; height: 8.63in; overflow: hidden; background: var(--charcoal); }
  .panel { position: absolute; top: 0.065in; width: 5.49in; height: 8.5in; overflow: hidden; }
  .photo { position: absolute; inset: 0; background-size: cover; z-index: 0; }
  .tint { position: absolute; inset: 0; z-index: 0; }
  .content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; padding: 0.22in; }
  .brand-row { display: flex; align-items: center; gap: 12px; }
  .badge { width: 52px; height: 52px; border-radius: 50%; overflow: hidden; flex: 0 0 auto; background: #fff;
    box-shadow: 0 0 0 2.5px rgba(230,213,181,0.9); padding: 3.5px; }
  .badge img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .wordmark-col { display: flex; flex-direction: column; gap: 2px; }
  .wordmark { font-family: 'Barlow', sans-serif; color: #fff; font-weight: 700; font-size: 21px; letter-spacing: 1.5px; line-height: 1; }
  .wm-tag { color: rgba(230,213,181,0.85); font-weight: 400; font-size: 10px; letter-spacing: 0.8px; line-height: 1; }
  .big-word { font-family: 'Barlow Condensed', sans-serif; color: #fff; font-weight: 900; letter-spacing: -1px;
    text-shadow: 0 8px 28px rgba(0,0,0,0.55); line-height: 0.85; margin-top: auto; }
  .tagline .lead { color: var(--gold); font-weight: 700; }
  .tagline .desc { color: #fff; font-weight: 400; line-height: 1.35; margin-top: 4px; }
</style>`
}

// content.backCover.footerText may contain a literal newline for the 2-line
// footer ("SNACKET FOODS LLC\nCharlotte, NC · snacketnow.com") — render as <br>.
function footerHtml(footerText) {
  return escapeHtml(footerText).replace(/\n/g, '<br>')
}

// content.*.bigWord may contain a literal newline for a 2-line poster statement
// (e.g. "YOUR BRAND.\nDEPLOYED.") — same convention as footerText, render as <br>.
function bigWordHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

// Cover-panel-only variant: alternates the SNACKET gold/green accent colors
// per line instead of the shared plain-white bigWordHtml() used elsewhere.
function coverBigWordHtml(text) {
  const colors = ['gold', 'green']
  return escapeHtml(text).split('\n').map((line, i) => `<span class="bw-${colors[i % colors.length]}">${line}</span>`).join('<br>')
}

function buildFrontHtml({ content, palette, photoUrls }) {
  const { backCover, cover } = content
  const eyebrowHtml = cover.eyebrow ? `<div class="eyebrow">${escapeHtml(cover.eyebrow)}</div>` : ''
  const leadHtml = cover.taglineLead ? `<div class="lead">${escapeHtml(cover.taglineLead)}</div>` : ''
  const backEyebrowHtml = backCover.eyebrow ? `<div class="back-eyebrow">${escapeHtml(backCover.eyebrow)}</div>` : ''
  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .panel-back { left: 0.065in; }
  .panel-cover { left: 5.555in; }
  /* This photo is landscape inside a portrait panel, so background-size: contain
     fits it to the panel's full width and letterboxes top/bottom. Client feedback:
     push the photo UP so there's only a small fixed ~1cm gap at the top instead of
     a big evenly-split gap, with the leftover space landing at the bottom.
     background-position: center 1cm is a LENGTH (not a percentage), so per spec it
     offsets the image's top edge exactly 1cm down from the panel's top edge
     regardless of the photo's aspect ratio — the top gap is therefore always
     exactly 1cm (~4.6% of this panel's 8.5in height) for any admin-uploaded photo.
     mask-image is a percentage-of-THIS-ELEMENT'S-OWN-BOX fade (the element is
     inset:0 = the full panel), not a percentage of the photo's rendered size.
     Fade math: outside the photo's rendered box there are no image pixels at all
     (background-repeat: no-repeat), so the mask can only visibly affect anything
     WITHIN the photo's real raster edges — for the seam to actually dissolve
     (not just partially dim before an unmasked hard cutoff), mask opacity must
     reach exactly 0% right at the photo's true edge, continuous with the fully
     transparent letterbox beyond it. First pass used a symmetric-looking
     "transparent 0%, black 9%" band (mask ~51% at the real 4.6% top edge) —
     verified via renderHtmlStringToPng + raw pixel sampling that this still left
     a measurable single-row luminance jump (~20-49pt depending on photo) right at
     the true edge on all 3 panels, i.e. a softened but still-real seam, not a
     dissolve. Fixed by anchoring the ramp's zero point exactly at the real edge
     instead: top ramp holds transparent through the fixed 4.6% edge, then climbs
     to fully opaque by 14% (9.4pt ramp, deeper INTO the photo, away from the
     edge). Bottom ramp mirrors this from the other direction: back-novacare-
     gala.jpg (2000x1116) contain-fits to ~36% of panel height, so with the top
     pinned to 1cm its real bottom edge lands at ~40.7% — ramps from fully opaque
     at 31% down to exactly transparent at 41%, so mask reaches 0% right where
     the photo pixels actually end. Re-verified after this fix: the single-row
     jump at both true edges drops to noise-floor level, confirmed via pixel
     sampling — genuinely smooth now, not just softened. */
  .panel-back .photo {
    background-image: url('${escapeAttr(photoUrls.backCoverPhotoUrl)}');
    background-position: center 1cm;
    background-size: contain;
    background-repeat: no-repeat;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, transparent 4.6%, black 14%, black 31%, transparent 41%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, transparent 4.6%, black 14%, black 31%, transparent 41%, transparent 100%);
  }
  /* margin-top: auto pulls the eyebrow (when present) down to sit directly above
     the big-word, instead of clinging to brand-row at the top of the panel; the
     adjacent-sibling override then keeps big-word hugging right under it. When
     no eyebrow is rendered, .big-word falls back to its own shared margin-top:
     auto and the layout is unchanged from before this feature existed. */
  .back-eyebrow { margin-top: auto; font-size: 12px; letter-spacing: 2px; font-weight: 700; color: var(--gold); text-transform: uppercase; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .back-eyebrow + .big-word { margin-top: 6px; }
  .panel-back .tint { background: linear-gradient(180deg, rgba(18,80,43,0.30) 0%, rgba(20,22,25,0.50) 38%, rgba(15,16,18,0.86) 100%); }
  .panel-back .big-word { font-size: 70px; }
  .panel-back .tagline { margin-top: 10px; }
  .panel-back .tagline .desc { font-size: 16px; max-width: 96%; }
  .panel-back .seg { font-size: 12px; margin-top: 12px; color: rgba(255,255,255,0.88); line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.4); width: 80%; }
  .panel-back .seg:first-of-type { margin-top: 52px; }
  .panel-back .seg b { color: var(--green); display: block; font-size: 13px; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .panel-back .cta-line { margin-top: 20px; font-size: 15px; color: var(--gold); font-weight: 700; line-height: 1.3; width: 84%; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .bblock { margin-top: 16px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .qrbox { width: 77px; height: 77px; flex: 0 0 77px; background: var(--beige); border-radius: 6px; padding: 6px; box-shadow: 0 3px 14px rgba(0,0,0,0.4); }
  .qrbox img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .bfoot { font-size: 11px; color: rgba(230,213,181,0.75); line-height: 1.5; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .panel-cover { background: var(--charcoal); }
  .panel-cover .content { padding: 0.22in 0; }
  .panel-cover .content > *:not(.pill) { padding-left: 0.22in; padding-right: 0.22in; }
  .eyebrow { margin-top: 12px; font-size: 14px; letter-spacing: 3px; font-weight: 700; color: var(--green); text-transform: uppercase; }
  .panel-cover .big-word { font-size: 58px; margin-top: 22px; }
  .panel-cover .big-word .bw-gold { color: var(--gold); }
  .panel-cover .big-word .bw-green { color: var(--green); }
  .panel-cover .tagline { margin-top: 14px; }
  .panel-cover .tagline .lead { font-size: 23px; }
  .panel-cover .tagline .desc { font-size: 18px; max-width: 92%; }
  .pill { margin-top: 16px; margin-left: 0.22in; align-self: flex-start; background: rgba(230,213,181,0.92); color: var(--charcoal);
    font-size: 13px; font-weight: 700; letter-spacing: 2px; padding: 10px 16px; border-radius: 30px; }
  .cover-hero { margin-top: auto; width: 100%; line-height: 0; }
  .cover-hero img { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
<div class="sheet">

  <div class="panel panel-back">
    <div class="photo"></div>
    <div class="tint"></div>
    <div class="grain"></div>
    <div class="content">
      ${brandRow(photoUrls.logoUrl)}
      ${backEyebrowHtml}
      <div class="big-word">${bigWordHtml(backCover.bigWord)}</div>
      <div class="tagline"><div class="desc">${escapeHtml(backCover.taglineDesc)}</div></div>
      ${backCover.segs.map(seg => `<div class="seg"><b>${escapeHtml(seg.label)}</b>${escapeHtml(seg.pitch)}</div>`).join('\n      ')}
      <div class="cta-line">${escapeHtml(backCover.ctaLine)}</div>
      <div class="bblock">
        <div class="bfoot">${footerHtml(backCover.footerText)}</div>
        <div class="qrbox"><img src="${escapeAttr(photoUrls.qrUrl)}"></div>
      </div>
    </div>
  </div>

  <div class="panel panel-cover">
    <div class="grain"></div>
    <div class="content">
      ${brandRow(photoUrls.logoUrl)}
      ${eyebrowHtml}
      <div class="big-word">${coverBigWordHtml(cover.bigWord)}</div>
      <div class="tagline">${leadHtml}<div class="desc">${escapeHtml(cover.taglineDesc)}</div></div>
      <div class="pill">${escapeHtml(cover.pillText)}</div>
      <div class="cover-hero"><img src="${escapeAttr(photoUrls.coverPhotoUrl)}" alt=""></div>
    </div>
  </div>

</div>
</body>
</html>`
}

function buildBackHtml({ content, palette, photoUrls }) {
  const { interiorLeft, interiorRight } = content
  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .panel-left { left: 0.065in; }
  .panel-right { left: 5.555in; }
  .tint { background: linear-gradient(180deg, rgba(18,80,43,0.30) 0%, rgba(20,22,25,0.50) 38%, rgba(15,16,18,0.86) 100%); }
  .big-word { font-size: 70px; }
  .tagline { margin-top: 10px; }
  .tagline .lead { font-size: 19px; }
  .tagline .desc { font-size: 16px; max-width: 95%; }
  /* Client feedback: push the letterboxed photo UP to a fixed ~1cm top gap
     instead of centering it, same change and same fade-math reasoning as the
     back-cover fix above (see buildFrontHtml's .panel-back .photo comment for
     the full derivation) — background-position: center 1cm is a length, so it
     offsets the image's top edge exactly 1cm from the panel top regardless of
     aspect ratio, and the mask must reach exactly 0% opacity right at the
     photo's true raster edge (not partway through) for the seam to actually
     dissolve rather than just soften before a hard cutoff. Top ramp (holds
     transparent through the fixed 4.6% edge, opaque by 14%) is identical on
     all 3 panels since that edge is now fixed regardless of photo.
     This panel's real photo (Your brand here - lobby.png, 2048x2048, a square
     1:1 image) is width-constrained by contain in this 5.49in x 8.5in portrait
     panel, rendering at panel-width x panel-width (5.49in tall) — with the top
     pinned to 1cm, that pushes the photo's real bottom edge down to ~69.2% of
     the panel height (previously ~82.3% when centered), leaving a much bigger
     bottom letterbox gap than before. Bottom ramp fades from fully opaque at
     60% down to exactly transparent at 70%, landing the zero point right on
     that real ~69.2% edge. Verified via renderHtmlStringToPng + raw pixel
     sampling against the real photo — top gap reads as a small clean margin,
     both seams fade smoothly with no measurable jump at the true edge. */
  .panel-left .photo {
    background-image: url('${escapeAttr(photoUrls.interiorLeftPhotoUrl)}');
    background-position: center 1cm;
    background-size: contain;
    background-repeat: no-repeat;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, transparent 4.6%, black 14%, black 60%, transparent 70%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, transparent 4.6%, black 14%, black 60%, transparent 70%, transparent 100%);
  }
  .intro { margin-top: 20px; font-size: 12px; color: rgba(255,255,255,0.92); line-height: 1.4; width: 88%; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .glass { background: rgba(230,213,181,0.13); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
    border: 1px solid rgba(218,171,97,0.4); border-radius: 10px; padding: 14px; margin-top: 14px; width: 60%; }
  .col-title { font-size: 12px; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 5px; }
  .is .col-title { color: var(--green); } .isnot .col-title { color: rgba(230,213,181,0.6); margin-top: 10px; }
  .glass ul { list-style: none; margin: 0; padding: 0; }
  .glass li { font-size: 11px; color: rgba(255,255,255,0.88); margin-bottom: 3px; padding-left: 14px; position: relative; line-height: 1.3; }
  .is li::before { content: '+'; position: absolute; left: 0; color: var(--green); font-weight: 700; }
  .isnot li { color: rgba(230,213,181,0.5); } .isnot li::before { content: '\\2013'; position: absolute; left: 0; color: rgba(230,213,181,0.5); }
  .result-row { font-size: 11px; color: #fff; margin-top: 8px; line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.4); width: 88%; }
  .result-row b { font-weight: 700; letter-spacing: 0.4px; }
  .result-row.c-green b { color: var(--green); } .result-row.c-gold b { color: var(--gold); }
  /* Same fixed-1cm-top change and same zero-at-the-real-edge fade math as
     .panel-left .photo above. The existing NitroCafe photo (1024x1024) is
     also a square 1:1 image, so it hits the exact same contain math in this
     identically-sized panel: width-constrained to 5.49in tall, real bottom
     edge at ~69.2% of panel height once the top is pinned to 1cm — same
     60%->70% bottom ramp applies. Verified via renderHtmlStringToPng + raw
     pixel sampling against the real photo — no measurable jump at the true
     edge. */
  .panel-right .photo {
    background-image: url('${escapeAttr(photoUrls.interiorRightPhotoUrl)}');
    background-position: center 1cm;
    background-size: contain;
    background-repeat: no-repeat;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, transparent 4.6%, black 14%, black 60%, transparent 70%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, transparent 4.6%, black 14%, black 60%, transparent 70%, transparent 100%);
  }
  .row { background: rgba(230,213,181,0.15); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border-left: 3px solid var(--green); border-radius: 0 6px 6px 0; width: 62%;
    padding: 8px 12px; margin-top: 8px; font-size: 11.5px; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.4); line-height: 1.25; }
  .row:first-of-type { margin-top: 52px; }
  .row .rt { font-weight: 700; display: block; }
  .fleet { margin-top: 16px; display: flex; gap: 8px; }
  .fleet-card { flex: 1; border: 1px solid var(--green); border-radius: 7px; padding: 8px 9px; background: rgba(20,22,25,0.5); backdrop-filter: blur(5px); }
  .fleet-card b { display: block; color: var(--green); font-size: 11.5px; font-weight: 700; margin-bottom: 3px; }
  .fleet-card span { display: block; color: rgba(255,255,255,0.85); font-size: 10px; line-height: 1.3; }
  .addons { margin-top: 12px; font-size: 10px; color: rgba(230,213,181,0.8); line-height: 1.35; width: 90%; font-style: italic; }
</style>
</head>
<body>
<div class="sheet">

  <div class="panel panel-left">
    <div class="photo"></div>
    <div class="tint"></div>
    <div class="grain"></div>
    <div class="content">
      ${brandRow(photoUrls.logoUrl, 'compact')}
      <div class="big-word">${bigWordHtml(interiorLeft.bigWord)}</div>
      <div class="tagline"><div class="lead">${escapeHtml(interiorLeft.taglineLead)}</div><div class="desc">${escapeHtml(interiorLeft.taglineDesc)}</div></div>
      <div class="intro">${escapeHtml(interiorLeft.intro)}</div>
      <div class="glass">
        <div class="is"><div class="col-title">SNACKET IS</div><ul>
          ${interiorLeft.isList.map(item => `<li>${escapeHtml(item)}</li>`).join('\n          ')}
        </ul></div>
        <div class="isnot"><div class="col-title">SNACKET IS NOT</div><ul>
          ${interiorLeft.isNotList.map(item => `<li>${escapeHtml(item)}</li>`).join('\n          ')}
        </ul></div>
      </div>
      ${interiorLeft.resultRows.map(row => `<div class="result-row c-${row.color}"><b>${escapeHtml(row.label)}</b> — ${escapeHtml(row.desc)}</div>`).join('\n      ')}
    </div>
  </div>

  <div class="panel panel-right">
    <div class="photo"></div>
    <div class="tint"></div>
    <div class="grain"></div>
    <div class="content">
      ${brandRow(photoUrls.logoUrl, 'compact')}
      <div class="big-word">${bigWordHtml(interiorRight.bigWord)}</div>
      <div class="tagline"><div class="lead">${escapeHtml(interiorRight.taglineLead)}</div>${interiorRight.taglineDesc ? `<div class="desc">${escapeHtml(interiorRight.taglineDesc)}</div>` : ''}</div>
      ${interiorRight.layerRows.map(row => `<div class="row"><span class="rt">${escapeHtml(row.label)}</span>${escapeHtml(row.desc)}</div>`).join('\n      ')}
      <div class="fleet">
        ${interiorRight.fleetCards.map(card => `<div class="fleet-card"><b>${escapeHtml(card.name)}</b><span>${escapeHtml(card.desc)}</span></div>`).join('\n        ')}
      </div>
      <div class="addons">${escapeHtml(interiorRight.addonsLine)}</div>
    </div>
  </div>

</div>
</body>
</html>`
}

module.exports = { buildFrontHtml, buildBackHtml }
