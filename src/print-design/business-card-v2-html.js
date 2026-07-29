// src/print-design/business-card-v2-html.js
const { buildEffectsCss } = require('./effects-template')
const { loadFontFaceCss } = require('./fonts')
const { escapeHtml, escapeAttr } = require('./html-escape')
const { resolveTokens } = require('./business-card-v2-tokens')

function sharedHead(palette) {
  return `
<meta charset="utf-8">
<style>${loadFontFaceCss()}</style>
<style>${buildEffectsCss(palette)}</style>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Barlow', sans-serif; }
  .sheet { position: relative; width: 3.62in; height: 2.12in; overflow: hidden; }
</style>`
}

// content.front.name may contain a literal newline (e.g. "Johanna\nSuarez") to
// control where the name wraps — same convention as the shipped card.
function nameHtml(name) {
  return escapeHtml(name).replace(/\n/g, '<br>')
}

function buildFrontHtml({ content, palette, photoUrls }) {
  const { front } = content
  const t = resolveTokens(palette)
  const logoBlock = t.hasLogoPlate
    ? `<div class="logo-plate"><img class="logo" src="${escapeAttr(photoUrls.logoUrl)}"></div>`
    : `<img class="logo" src="${escapeAttr(photoUrls.logoUrl)}">`
  const logoPlateCss = t.hasLogoPlate
    ? `  .logo-plate { width: 0.92in; height: 0.92in; border-radius: 50%; background: #f7f5f0;
    display: flex; align-items: center; justify-content: center; }\n`
    : ''

  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .sheet { background: ${t.sheetBg}; padding: 0.1467in 0.1333in; display: flex; align-items: center; }
  .left { width: 47%; display: flex; flex-direction: column; align-items: center; text-align: center; }
${logoPlateCss}  .logo { width: ${t.hasLogoPlate ? '0.76in' : '0.8in'}; height: ${t.hasLogoPlate ? '0.76in' : '0.8in'}; object-fit: contain; }
  .tag { margin-top: 0.0667in; font-family: 'Barlow Condensed', sans-serif; font-weight: 900;
    font-size: 5.5pt; line-height: 1.22; letter-spacing: 0.15pt; color: ${t.primaryTextColor}; }
  .tag span { display: block; }
  .tag .g { color: ${t.greenAccentColor}; }
  .div { width: 0.01in; align-self: stretch; background: ${t.dividerColor}; margin: 0 0.12in; }
  .right { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .name { font-family: 'Barlow Condensed', sans-serif; font-weight: 900; font-size: 9.6pt;
    color: ${t.primaryTextColor}; letter-spacing: 0.15pt; text-transform: uppercase; }
  .title { font-family: 'Barlow', sans-serif; font-weight: 700; font-size: 4.8pt; letter-spacing: 1pt;
    color: ${t.titleColor}; margin-top: 0.02in; margin-bottom: 0.08in; text-transform: uppercase; }
  .row { display: flex; align-items: center; gap: 0.0667in; margin-top: 0.0467in; }
  .badge { width: 0.1333in; height: 0.1333in; border-radius: 50%; background: ${t.badgeFill};
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .badge svg { width: 0.0667in; height: 0.0667in; }
  .line { font-family: 'Barlow', sans-serif; font-weight: 600; font-size: 5pt; color: ${t.contactLineColor}; }
</style>
</head>
<body>
<div class="sheet">
  <div class="left">
    ${logoBlock}
    <div class="tag">
      <span>CHARLOTTE'S FIRST</span>
      <span>FULLY ELECTRIC</span>
      <span class="g">MOBILE EXPERIENTIAL</span>
      <span class="g">MEDIA PLATFORM.</span>
    </div>
  </div>
  <div class="div"></div>
  <div class="right">
    <div class="name">${nameHtml(front.name)}</div>
    <div class="title">${escapeHtml(front.title)}</div>
    <div class="row">
      <div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="${t.badgeStroke}" stroke-width="2"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1z"/></svg></div>
      <div class="line">${escapeHtml(front.phone)}</div>
    </div>
    <div class="row">
      <div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="${t.badgeStroke}" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 6l10 7 10-7"/></svg></div>
      <div class="line">${escapeHtml(front.email)}</div>
    </div>
    <div class="row">
      <div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="${t.badgeStroke}" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z"/></svg></div>
      <div class="line">${escapeHtml(front.website)}</div>
    </div>
    <div class="row">
      <div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="${t.badgeStroke}" stroke-width="2"><path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/></svg></div>
      <div class="line">${escapeHtml(front.location)}</div>
    </div>
  </div>
</div>
</body>
</html>`
}

function buildBackHtml({ content, palette, photoUrls }) {
  const t = resolveTokens(palette)
  const photoPlate = t.hasPhotoWindow ? '<div class="photo-plate"></div>' : ''
  const photoRect = t.hasPhotoWindow
    ? 'right: 0.18in; top: 0.1in; bottom: 0.1in; width: 57%;'
    : 'right: 0.08in; top: 0; height: 100%; width: 60%;'
  const photoPlateCss = t.hasPhotoWindow
    ? `  .photo-plate { position: absolute; right: 0.1in; top: 0.1in; bottom: 0.1in; width: 61%;
    background: #f7f5f0; border-radius: 0.05in; box-shadow: 0 0 0.05in rgba(0,0,0,0.35); z-index: 1; }\n`
    : ''

  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .sheet { background: ${t.sheetBg}; }
${photoPlateCss}  .photo { position: absolute; ${photoRect}
    background-image: url('${escapeAttr(photoUrls.mixobarUrl)}'); background-size: contain; background-repeat: no-repeat;
    background-position: center; transform: scaleX(-1); mix-blend-mode: multiply; z-index: 2; }
  .text { position: absolute; left: 0.1733in; top: 0; height: 1.4667in; width: ${t.hasPhotoWindow ? '52%' : '54%'};
    display: flex; flex-direction: column; justify-content: center; z-index: 3; }
  .kicker { display: flex; align-items: center; gap: 0.0533in; margin-bottom: 0.0667in; }
  .kicker .ln { height: 0.01in; width: 0.16in; background: ${t.dividerColor}; }
  .kicker span { font-family: 'Barlow', sans-serif; font-weight: 700; font-size: 4.3pt;
    letter-spacing: 1.5pt; color: ${t.dividerColor}; }
  .h1 { font-family: 'Barlow Condensed', sans-serif; font-weight: 900; font-size: 12.5pt;
    line-height: 1.02; letter-spacing: 0.15pt; color: ${t.primaryTextColor}; text-transform: uppercase; }
  .h1 span { display: block; }
  .h1 .g { color: ${t.greenAccentColor}; }
  .rule { width: 0.4667in; height: 0.01in; background: ${t.dividerColor}; margin: 0.0667in 0; }
  .sub { font-family: 'Barlow', sans-serif; font-weight: 700; font-size: 4pt; letter-spacing: 0.7pt;
    color: ${t.subColor}; line-height: 1.4; text-transform: uppercase; }
  .qr { position: absolute; left: 0.1733in; bottom: 0.1467in; display: flex; align-items: center;
    gap: 0.0533in; z-index: 3; }
  .qr-box { width: 0.56in; height: 0.56in; background: #fff; border-radius: 0.033in; padding: 0.027in;
    box-sizing: border-box; }
  .qr-box img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .qr-label { font-family: 'Barlow', sans-serif; font-weight: 700; font-size: 3.4pt; letter-spacing: 0.5pt;
    color: ${t.qrLabelColor}; max-width: 0.5in; line-height: 1.4; text-transform: uppercase; }
</style>
</head>
<body>
<div class="sheet">
  ${photoPlate}
  <div class="photo"></div>
  <div class="text">
    <div class="kicker"><div class="ln"></div><span>SNACKETNOW</span><div class="ln"></div></div>
    <div class="h1"><span>Your Brand.</span><span class="g">Deployed.</span></div>
    <div class="rule"></div>
    <div class="sub">Physical brand presence.<br>On demand.</div>
  </div>
  <div class="qr">
    <div class="qr-box"><img src="${escapeAttr(photoUrls.qrUrl)}"></div>
    <div class="qr-label">See the platform in action</div>
  </div>
</div>
</body>
</html>`
}

module.exports = { buildFrontHtml, buildBackHtml }
