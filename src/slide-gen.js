const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')
const os = require('os')

const LOGO_PATH = process.env.LOGO_PATH || '/logo/snacket-logo.png'
const FONT_PATH = process.env.FONT_PATH || '/fonts/BarlowCondensed-Bold.ttf'
const W = 1080
const H = 1920
const FONT_SIZE = 46

// Load font as base64 once at startup — embedded in every SVG so fontconfig is not needed
let FONT_B64 = ''
try {
  FONT_B64 = fs.readFileSync(FONT_PATH).toString('base64')
  console.log('[slide-gen] font loaded:', FONT_PATH)
} catch {
  console.warn('[slide-gen] font not found at', FONT_PATH, '— text will use system fallback')
}

function fontStyle() {
  if (!FONT_B64) return ''
  return `<style>
    @font-face {
      font-family: 'BarlowSlide';
      src: url('data:font/truetype;base64,${FONT_B64}');
      font-weight: bold;
    }
  </style>`
}

const FONT_FAMILY = "'BarlowSlide', 'Arial Narrow', sans-serif"
const TEXT_Y_BOTTOM = 1680  // bottom anchor: last line at y=1680 (87.5% of 1920) — matches ffmpeg y=h*0.85
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.25)
const LOGO_WIDTH = 160
const LOGO_MARGIN = 24
const CTA_LOGO_WIDTH = 200
const CHARCOAL = '#1A1A1A'
const GOLD = '#C9A227'

// Word-wrap: split at \n first, then wrap long lines at maxChars.
// Returns max maxLines lines total.
function wrapText(text, maxChars = 36, maxLines = 2) {
  if (!text) return []
  const lines = []
  for (const seg of text.split('\n')) {
    if (lines.length >= maxLines) break
    if (seg.length <= maxChars) {
      lines.push(seg)
    } else {
      let current = ''
      for (const word of seg.split(' ')) {
        if (lines.length >= maxLines) break
        const candidate = current ? `${current} ${word}` : word
        if (candidate.length <= maxChars) {
          current = candidate
        } else {
          if (current) lines.push(current)
          current = word.slice(0, maxChars)
        }
      }
      if (current && lines.length < maxLines) lines.push(current)
    }
  }
  return lines
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// SVG overlay: vignette + text, transparent background
function buildOverlaySvg(lines, color = 'white') {
  const totalTextH = lines.length * LINE_HEIGHT
  const startY = TEXT_Y_BOTTOM - totalTextH + LINE_HEIGHT

  const textEls = lines.map((line, i) =>
    `<text x="${W / 2}" y="${startY + i * LINE_HEIGHT}"
      text-anchor="middle"
      font-family="${FONT_FAMILY}"
      font-size="${FONT_SIZE}" font-weight="bold" fill="${color}"
      filter="url(#shadow)">${escapeXml(line)}</text>`
  ).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    ${fontStyle()}
    <linearGradient id="gTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.45"/>
      <stop offset="40%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gBot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="70%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.65"/>
    </linearGradient>
    <filter id="shadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.9"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H * 0.4}" fill="url(#gTop)"/>
  <rect y="${H * 0.7}" width="${W}" height="${H * 0.3}" fill="url(#gBot)"/>
  ${textEls}
</svg>`
}

// Load and resize logo buffer. Returns null if logo file not found.
async function loadLogo(width) {
  if (!fs.existsSync(LOGO_PATH)) return null
  return sharp(LOGO_PATH)
    .resize(width, null, { fit: 'inside' })
    .png()
    .toBuffer()
}

// Generate a styled slide from a source image file path.
// Returns path to temp PNG (lossless — avoids JPEG-on-JPEG artifact compounding).
async function generateSlide(srcImagePath, text) {
  const outputPath = path.join(os.tmpdir(), `slide_${randomUUID()}.png`)
  const lines = wrapText(text, 36, 2)

  const [bgBuf, fgBuf] = await Promise.all([
    // Layer 1: blurred COVER background — .rotate() auto-orients by EXIF
    sharp(srcImagePath)
      .rotate()
      .resize(W, H, { fit: 'cover' })
      .blur(20)
      .modulate({ brightness: 0.7 })
      .toBuffer(),
    // Layer 2: CONTAIN foreground (transparent letterbox) — .rotate() auto-orients by EXIF
    sharp(srcImagePath)
      .rotate()
      .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ])

  const composites = [
    { input: fgBuf, blend: 'over' },
    { input: Buffer.from(buildOverlaySvg(lines)), blend: 'over' },
  ]

  const logoBuf = await loadLogo(LOGO_WIDTH)
  if (logoBuf) {
    const meta = await sharp(logoBuf).metadata()
    composites.push({
      input: logoBuf,
      top: LOGO_MARGIN,
      left: W - LOGO_WIDTH - LOGO_MARGIN,
      blend: 'over',
    })
  }

  await sharp(bgBuf)
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toFile(outputPath)

  return outputPath
}

// Generate a CTA slide (solid charcoal background + centered logo + gold text).
// Uses sharp.create() for the base — avoids SVG-as-primary-input (requires librsvg).
// Same pattern as generateSlide(): solid PNG base + SVG composite overlay.
// Returns path to temp PNG (lossless).
async function generateCtaSlide(ctaText) {
  const outputPath = path.join(os.tmpdir(), `slide_cta_${randomUUID()}.png`)
  const lines = wrapText(ctaText, 24, 2)

  // Charcoal base via sharp.create — no SVG rasterization needed
  const bgBuf = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 26, g: 26, b: 26 } }
  }).png().toBuffer()

  // Gold text SVG overlay (same pattern as buildOverlaySvg but gold + centered)
  const textStartY = Math.round(H / 2 + CTA_LOGO_WIDTH / 2 + 60)
  const textEls = lines.map((line, i) =>
    `<text x="${W / 2}" y="${textStartY + i * LINE_HEIGHT}"
      text-anchor="middle"
      font-family="${FONT_FAMILY}"
      font-size="${FONT_SIZE}" font-weight="bold" fill="${GOLD}">${escapeXml(line)}</text>`
  ).join('\n')

  const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>${fontStyle()}</defs>
    ${textEls}
  </svg>`

  const composites = [{ input: Buffer.from(textSvg), blend: 'over' }]

  const logoBuf = await loadLogo(CTA_LOGO_WIDTH)
  if (logoBuf) {
    const meta = await sharp(logoBuf).metadata()
    const logoH = meta.height || CTA_LOGO_WIDTH
    // Logo above center, text below — insert logo before text in composites
    composites.unshift({
      input: logoBuf,
      top: Math.max(0, Math.floor(H / 2 - logoH / 2) - 40),
      left: Math.floor(W / 2 - CTA_LOGO_WIDTH / 2),
      blend: 'over',
    })
  }

  await sharp(bgBuf)
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toFile(outputPath)

  return outputPath
}

// Word-wrap that respects explicit \n paragraph breaks first, then wraps at maxLen.
function wrapOverlayText(text, maxLen) {
  const paras = String(text || '').split(/\n+/).filter(Boolean)
  const lines = []
  for (const para of paras) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const candidate = line ? line + ' ' + w : w
      if (candidate.length > maxLen && line) { lines.push(line); line = w }
      else line = candidate
    }
    if (line) lines.push(line)
  }
  return lines
}

// SVG overlay: vignette (bottom-heavy) + title/body/cta, bottom-anchored layout.
// Proportions scale from the 1080x1080 carousel formula (locked 2026-05-31) via
// `scale = width / 1080`. Square carousel output is byte-identical to before this
// refactor — verify that in Task 2 before trusting the landscape output.
function buildOverlaySvgFor(width, height, title, body, cta) {
  const scale = width / 1080
  const marginX = Math.round(64 * scale)
  const bodyFontSize = Math.round(36 * scale)
  const ctaFontSize = Math.round(32 * scale)
  const bodyLineH = Math.round(52 * scale)
  const bodyWrapChars = Math.round(50 * scale)

  // Title wrap width: derived from actual usable pixel width (canvas minus both
  // margins) divided by an estimated glyph width for bold uppercase text with
  // letter-spacing, rather than a flat char-count scaled off `width` alone. The old
  // `Math.round(22 * scale)` heuristic was tuned to just fit the locked 1080x1080
  // carousel case, but independent rounding of marginX/titleWrapChars at other scales
  // let lines exceed the usable width (verified clipping "BUSINESSES" off the right
  // edge at 1200x627). AVG_CHAR_TO_FONT_RATIO=0.66 reproduces titleWrapChars=22 at the
  // original square scale (952px usable / 64px font / 22 chars ≈ 0.676), so the square
  // carousel output is unaffected; this only changes non-square canvases.
  const AVG_CHAR_TO_FONT_RATIO = 0.66

  const bodyLines = wrapOverlayText(body, bodyWrapChars)

  const BOTTOM = height - marginX
  let y = BOTTOM
  const ctaY = cta ? y : 0
  if (cta) y -= Math.round(52 * scale)
  y -= Math.round(16 * scale)

  const bodyEndY = y
  const bodyStartY = bodyEndY - (bodyLines.length - 1) * bodyLineH
  const titleEndY = bodyStartY - Math.round(84 * scale)

  // Shrink-to-fit: a post-hoc position clamp (previous approach) can stop titleStartY
  // from going MORE negative, but it can't manufacture vertical space that doesn't
  // exist — a title that wraps to more lines than fit in the available budget at full
  // size still has its top lines rendered above y=0 and sliced off (verified via
  // pixel-row brightness analysis: rows 0+ were flat-saturated, the signature of a
  // glyph sheared by the canvas edge, not a natural glyph apex). So instead of sizing
  // the title first and fixing up the position after, compute the vertical budget
  // available for the title block (titleEndY down to a safe top margin) and shrink
  // titleFontSize/titleLineH/titleWrapChars together — then re-wrap — until the
  // wrapped line count actually fits that budget. Floors at 55% of full size so
  // extreme inputs degrade gracefully instead of shrinking to unreadable text.
  const titleFontSizeFull = Math.round(64 * scale)
  const titleLineHFull = Math.round(78 * scale)
  const topMargin = Math.round(16 * scale)
  let titleFontSize = titleFontSizeFull
  let titleLineH = titleLineHFull
  let titleLines
  let titleStartY
  for (let shrinkStep = 0; shrinkStep <= 10; shrinkStep++) {
    const shrink = 1 - shrinkStep * 0.045 // down to 0.55 at step 10
    titleFontSize = Math.max(24, Math.round(titleFontSizeFull * shrink))
    titleLineH = Math.max(28, Math.round(titleLineHFull * shrink))
    const usableWidth = width - marginX * 2
    const titleWrapChars = Math.max(8, Math.floor(usableWidth / (titleFontSize * AVG_CHAR_TO_FONT_RATIO)))
    titleLines = wrapOverlayText(String(title || '').toUpperCase(), titleWrapChars)

    const titleAscent = titleFontSize * 0.75
    const minTitleTop = topMargin + titleAscent
    titleStartY = titleEndY - (titleLines.length - 1) * titleLineH

    if (titleStartY >= minTitleTop || shrink <= 0.55) {
      if (titleStartY < minTitleTop) titleStartY = minTitleTop // last-resort floor — narrows but does not fully eliminate the clamp failure mode from the previous fix; only reachable when title+body+cta are all near their length bounds simultaneously
      break
    }
  }

  const titleText = titleLines.map((l, i) =>
    `<text x="${marginX}" y="${titleStartY + i * titleLineH}" font-size="${titleFontSize}" fill="white" font-weight="700" font-family="sans-serif" letter-spacing="3">${escapeXml(l)}</text>`
  ).join('\n  ')

  const bodyText = bodyLines.map((l, i) =>
    `<text x="${marginX}" y="${bodyStartY + i * bodyLineH}" font-size="${bodyFontSize}" fill="rgba(255,255,255,0.92)" font-weight="300" font-family="sans-serif">${escapeXml(l)}</text>`
  ).join('\n  ')

  const ctaText = cta
    ? `<text x="${marginX}" y="${ctaY}" font-size="${ctaFontSize}" fill="rgba(255,255,255,0.88)" font-family="sans-serif">${escapeXml(cta)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="overlayVig" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%"  stop-color="rgba(0,0,0,0.72)"/>
      <stop offset="36%" stop-color="rgba(0,0,0,0.28)"/>
      <stop offset="65%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#overlayVig)"/>
  ${titleText}
  ${bodyText}
  ${ctaText}
</svg>`
}

// Generate any overlay slide: real photo (cover-fit, EXIF-rotated) + clean text
// overlay, no logo, no template. Dimensions are caller-specified. Returns path
// to temp PNG.
async function generateOverlaySlide(srcImagePath, { title, body, cta }, { width, height }) {
  const outputPath = path.join(os.tmpdir(), `overlay_${randomUUID()}.png`)
  const svgOverlay = Buffer.from(buildOverlaySvgFor(width, height, title, body, cta))

  await sharp(srcImagePath)
    .rotate()
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .composite([{ input: svgOverlay, blend: 'over' }])
    .png({ compressionLevel: 8 })
    .toFile(outputPath)

  return outputPath
}

// Backward-compatible wrapper — this is what WF8 calls. Must produce pixel-identical
// output to the pre-refactor implementation (verified in Task 2).
async function generateCarouselSlide(srcImagePath, opts) {
  return generateOverlaySlide(srcImagePath, opts, { width: 1080, height: 1080 })
}

module.exports = { generateSlide, generateCtaSlide, wrapText, generateCarouselSlide, generateOverlaySlide }
