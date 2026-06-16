const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')
const os = require('os')

const LOGO_PATH = process.env.LOGO_PATH || '/logo/snacket-logo.png'
const FONT_PATH = process.env.FONT_PATH || '/fonts/BarlowCondensed-Bold.ttf'
const W = 1080
const H = 1920
const FONT_SIZE = 72

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
const TEXT_Y_BOTTOM = 1680  // px from top for last text line (bottom-third)
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.25)
const LOGO_WIDTH = 160
const LOGO_MARGIN = 24
const CTA_LOGO_WIDTH = 200
const CHARCOAL = '#1A1A1A'
const GOLD = '#C9A227'

// Word-wrap: split at \n first, then wrap long lines at maxChars.
// Returns max maxLines lines total.
function wrapText(text, maxChars = 35, maxLines = 3) {
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
// Returns path to temp JPEG.
async function generateSlide(srcImagePath, text) {
  const outputPath = path.join(os.tmpdir(), `slide_${randomUUID()}.jpg`)
  const lines = wrapText(text)

  const [bgBuf, fgBuf] = await Promise.all([
    // Layer 1: blurred COVER background
    sharp(srcImagePath)
      .resize(W, H, { fit: 'cover' })
      .blur(20)
      .modulate({ brightness: 0.7 })
      .toBuffer(),
    // Layer 2: CONTAIN foreground (transparent letterbox)
    sharp(srcImagePath)
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
    .jpeg({ quality: 85 })
    .toFile(outputPath)

  return outputPath
}

// Generate a CTA slide (solid charcoal background + centered logo + gold text).
// Returns path to temp JPEG.
async function generateCtaSlide(ctaText) {
  const outputPath = path.join(os.tmpdir(), `slide_cta_${randomUUID()}.jpg`)
  const lines = wrapText(ctaText, 35, 2)

  // Text starts below center (where the logo will sit above center)
  const textStartY = H / 2 + CTA_LOGO_WIDTH / 2 + 60
  const textEls = lines.map((line, i) =>
    `<text x="${W / 2}" y="${textStartY + i * LINE_HEIGHT}"
      text-anchor="middle"
      font-family="${FONT_FAMILY}"
      font-size="${FONT_SIZE}" font-weight="bold" fill="${GOLD}">${escapeXml(line)}</text>`
  ).join('\n')

  const svgBase = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>${fontStyle()}</defs>
    <rect width="${W}" height="${H}" fill="${CHARCOAL}"/>
    ${textEls}
  </svg>`

  const composites = []
  const logoBuf = await loadLogo(CTA_LOGO_WIDTH)
  if (logoBuf) {
    const meta = await sharp(logoBuf).metadata()
    const logoH = meta.height || CTA_LOGO_WIDTH
    composites.push({
      input: logoBuf,
      top: Math.max(0, Math.floor(H / 2 - logoH / 2) - 40),
      left: Math.floor(W / 2 - CTA_LOGO_WIDTH / 2),
      blend: 'over',
    })
  }

  const base = sharp(Buffer.from(svgBase))
  await (composites.length ? base.composite(composites) : base)
    .jpeg({ quality: 90 })
    .toFile(outputPath)

  return outputPath
}

module.exports = { generateSlide, generateCtaSlide, wrapText }
