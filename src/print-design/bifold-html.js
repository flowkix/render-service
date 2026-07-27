const { buildEffectsCss } = require('./effects-template')
const { loadFontFaceCss } = require('./fonts')

const WORDMARK = 'SNACKETNOW&reg;'
const WM_TAG = 'Where Brands Show Up'

function brandRow(logoUrl) {
  return `
      <div class="brand-row">
        <div class="badge"><img src="${escapeAttr(logoUrl)}"></div>
        <div class="wordmark-col"><div class="wordmark">${WORDMARK}</div><div class="wm-tag">${WM_TAG}</div></div>
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
  .sheet { position: relative; width: 11.11in; height: 8.63in; overflow: hidden; background: var(--near-black); }
  .panel { position: absolute; top: 0.065in; width: 5.49in; height: 8.5in; overflow: hidden; }
  .photo { position: absolute; inset: 0; background-size: cover; z-index: 0; }
  .tint { position: absolute; inset: 0; z-index: 0; }
  .content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; padding: 0.125in; }
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// escapeHtml only covers &/</>, insufficient for values landing inside quoted
// CSS url()/HTML attribute contexts (photoUrls) — also escape quotes here.
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;').replace(/"/g, '&quot;')
}

// content.backCover.footerText may contain a literal newline for the 2-line
// footer ("SNACKET FOODS LLC\nCharlotte, NC · snacketnow.com") — render as <br>.
function footerHtml(footerText) {
  return escapeHtml(footerText).replace(/\n/g, '<br>')
}

function buildExteriorHtml({ content, palette, photoUrls }) {
  const { backCover, cover } = content
  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .panel-back { left: 0.065in; }
  .panel-cover { left: 5.555in; }
  .panel-back .photo { background-image: url('${escapeAttr(photoUrls.backCoverPhotoUrl)}'); background-position: 19% center; }
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
  .panel-cover .photo { background-image: url('${escapeAttr(photoUrls.coverPhotoUrl)}'); background-position: 52% center; }
  .panel-cover .tint { background: linear-gradient(160deg, rgba(18,80,43,0.55) 0%, rgba(28,30,33,0.35) 45%, rgba(20,22,25,0.72) 100%); }
  .eyebrow { margin-top: 12px; font-size: 14px; letter-spacing: 3px; font-weight: 700; color: var(--green); text-transform: uppercase; }
  .panel-cover .big-word { font-size: 81px; }
  .panel-cover .tagline { margin-top: 14px; }
  .panel-cover .tagline .lead { font-size: 23px; }
  .panel-cover .tagline .desc { font-size: 18px; max-width: 92%; }
  .pill { margin-top: 20px; align-self: flex-start; background: rgba(230,213,181,0.92); color: var(--charcoal);
    font-size: 13px; font-weight: 700; letter-spacing: 2px; padding: 10px 16px; border-radius: 30px; }
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
      <div class="big-word">${escapeHtml(backCover.bigWord)}</div>
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
    <div class="photo"></div>
    <div class="tint"></div>
    <div class="grain"></div>
    <div class="content">
      ${brandRow(photoUrls.logoUrl)}
      <div class="eyebrow">${escapeHtml(cover.eyebrow)}</div>
      <div class="big-word">${escapeHtml(cover.bigWord)}</div>
      <div class="tagline"><div class="lead">${escapeHtml(cover.taglineLead)}</div><div class="desc">${escapeHtml(cover.taglineDesc)}</div></div>
      <div class="pill">${escapeHtml(cover.pillText)}</div>
    </div>
  </div>

</div>
</body>
</html>`
}

function buildInteriorHtml({ content, palette, photoUrls }) {
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
  .panel-left .photo { background-image: url('${escapeAttr(photoUrls.interiorLeftPhotoUrl)}'); background-position: 48% center;
    transform: scale(1.15); transform-origin: 48% 72%; }
  .intro { margin-top: 20px; font-size: 12px; color: rgba(255,255,255,0.92); line-height: 1.4; width: 88%; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .glass { background: rgba(230,213,181,0.13); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
    border: 1px solid rgba(218,171,97,0.4); border-radius: 10px; padding: 14px; margin-top: 14px; width: 78%; }
  .col-title { font-size: 12px; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 5px; }
  .is .col-title { color: var(--green); } .isnot .col-title { color: rgba(230,213,181,0.6); margin-top: 10px; }
  .glass ul { list-style: none; margin: 0; padding: 0; }
  .glass li { font-size: 11px; color: rgba(255,255,255,0.88); margin-bottom: 3px; padding-left: 14px; position: relative; line-height: 1.3; }
  .is li::before { content: '+'; position: absolute; left: 0; color: var(--green); font-weight: 700; }
  .isnot li { color: rgba(230,213,181,0.5); } .isnot li::before { content: '\\2013'; position: absolute; left: 0; color: rgba(230,213,181,0.5); }
  .result-row { font-size: 11px; color: #fff; margin-top: 8px; line-height: 1.3; text-shadow: 0 1px 4px rgba(0,0,0,0.4); width: 88%; }
  .result-row b { font-weight: 700; letter-spacing: 0.4px; }
  .result-row.c-green b { color: var(--green); } .result-row.c-gold b { color: var(--gold); }
  .panel-right .photo { background-image: url('${escapeAttr(photoUrls.interiorRightPhotoUrl)}'); background-position: 53% center;
    transform: scale(1.15); transform-origin: 53% 68%; }
  .row { background: rgba(230,213,181,0.15); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border-left: 3px solid var(--green); border-radius: 0 6px 6px 0; width: 82%;
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
      ${brandRow(photoUrls.logoUrl)}
      <div class="big-word">${escapeHtml(interiorLeft.bigWord)}</div>
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
      ${brandRow(photoUrls.logoUrl)}
      <div class="big-word">${escapeHtml(interiorRight.bigWord)}</div>
      <div class="tagline"><div class="lead">${escapeHtml(interiorRight.taglineLead)}</div><div class="desc">${escapeHtml(interiorRight.taglineDesc)}</div></div>
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

module.exports = { buildExteriorHtml, buildInteriorHtml }
