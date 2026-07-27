// src/print-design/business-card-html.js
const { buildEffectsCss } = require('./effects-template')
const { loadFontFaceCss } = require('./fonts')
const { escapeHtml, escapeAttr } = require('./html-escape')

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
// control where the name wraps — same convention as bifold's footerText.
function nameHtml(name) {
  return escapeHtml(name).replace(/\n/g, '<br>')
}

function buildFrontHtml({ content, palette, photoUrls }) {
  const { front } = content
  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .sheet { background: #fff; }
  .accent-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 0.098in; background: var(--gold); z-index: 6; }
  .photo { position: absolute; left: 0; top: 0; width: 50%; height: 100%;
    background-image: url('${escapeAttr(photoUrls.mixobarUrl)}'); background-size: contain; background-repeat: no-repeat; background-position: center;
    transform: scale(1.35); transform-origin: 0% 50%; z-index: 1; }
  .id-block { position: absolute; right: 0.14in; bottom: 0.14in; width: 0.95in; text-align: right; z-index: 4; }
  .name { font-family: 'Barlow Condensed', sans-serif; font-weight: 900; font-size: 15pt; color: var(--charcoal); line-height: 1.05; text-transform: uppercase; }
  .title { font-family: 'Barlow', sans-serif; font-weight: 700; font-size: 7.5pt; letter-spacing: 2px; color: var(--gold); margin-top: 0.05in; text-transform: uppercase; }
  .badge { position: absolute; top: 0; right: 0; z-index: 5; width: 0.85in; height: 0.85in;
    display: flex; align-items: center; justify-content: center; }
  .badge img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
</head>
<body>
<div class="sheet">
  <div class="accent-bar"></div>
  <div class="photo"></div>
  <div class="id-block">
    <div class="name">${nameHtml(front.name)}</div>
    <div class="title">${escapeHtml(front.title)}</div>
  </div>
  <div class="badge"><img src="${escapeAttr(photoUrls.logoUrl)}"></div>
</div>
</body>
</html>`
}

function buildBackHtml({ content, palette, photoUrls }) {
  const { back } = content
  return `<!doctype html>
<html>
<head>
${sharedHead(palette)}
<style>
  .sheet { background-image: url('${escapeAttr(photoUrls.evPhotoUrl)}'); background-size: cover; background-position: center 45%; }
  .tint { position: absolute; inset: 0; z-index: 1;
    background: linear-gradient(200deg, rgba(28,30,33,0.45) 0%, rgba(54,60,67,0.55) 55%, rgba(28,30,33,0.75) 100%); }
  .contact-row { position: absolute; left: 0.14in; right: 0.14in; bottom: 0.14in; z-index: 5;
    display: flex; align-items: center; justify-content: space-between; gap: 0.1in; }
  .info-stack { display: flex; flex-direction: column; gap: 0.05in; }
  .info-box { background: rgba(28,30,33,0.68); color: #fff; font-weight: 600; font-size: 7pt;
    padding: 0.03in 0.07in; border-radius: 4pt; white-space: nowrap; }
  .qr-wrap { width: 0.5in; height: 0.5in; background: #fff; border-radius: 4pt; padding: 3pt; box-sizing: border-box; flex-shrink: 0; }
  .qr-wrap img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
</head>
<body>
<div class="sheet">
  <div class="tint"></div>
  <div class="contact-row">
    <div class="info-stack">
      <div class="info-box">${escapeHtml(back.phone)}</div>
      <div class="info-box">${escapeHtml(back.email)}</div>
      <div class="info-box">${escapeHtml(back.website)}</div>
    </div>
    <div class="qr-wrap"><img src="${escapeAttr(photoUrls.qrUrl)}"></div>
  </div>
</div>
</body>
</html>`
}

module.exports = { buildFrontHtml, buildBackHtml }
