'use strict'
// Renders the 5 test logos (SVG -> PNG via sharp) used by the bench matrix.
// Fictional brands, increasing visual complexity. Run once: node bench/fixtures/generate-logos.js
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const OUT_DIR = path.join(__dirname, 'logos')

const LOGOS = {
  // 1 — simple single-color wordmark
  'apex-wordmark.png': `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">
      <text x="400" y="195" font-family="Arial Black, Arial, sans-serif" font-size="150" font-weight="900"
            fill="#1B5FCC" text-anchor="middle" letter-spacing="12">APEX</text>
    </svg>`,

  // 2 — icon + text, two colors
  'novacare-icon-text.png': `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="300">
      <circle cx="150" cy="150" r="110" fill="#00A886"/>
      <path d="M150 80 v140 M80 150 h140" stroke="#FFFFFF" stroke-width="34" stroke-linecap="round"/>
      <text x="310" y="200" font-family="Verdana, sans-serif" font-size="110" font-weight="bold" fill="#0B3B5C">NovaCare</text>
    </svg>`,

  // 3 — monochrome emblem
  'ironpeak-emblem.png': `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <circle cx="200" cy="200" r="185" fill="none" stroke="#111111" stroke-width="18"/>
      <path d="M70 280 L160 120 L210 210 L250 150 L330 280 Z" fill="#111111"/>
      <text x="200" y="345" font-family="Georgia, serif" font-size="52" font-weight="bold" fill="#111111" text-anchor="middle">IRONPEAK</text>
    </svg>`,

  // 4 — multicolor gradient mark
  'solstice-gradient.png': `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="360">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF6B35"/>
          <stop offset="50%" stop-color="#F72585"/>
          <stop offset="100%" stop-color="#7209B7"/>
        </linearGradient>
      </defs>
      <circle cx="180" cy="160" r="110" fill="url(#g)"/>
      <circle cx="180" cy="160" r="62" fill="#FFFFFF"/>
      <text x="340" y="205" font-family="Trebuchet MS, sans-serif" font-size="105" font-weight="bold" fill="url(#g)">Solstice</text>
    </svg>`,

  // 5 — fine detail worst case: thin lines + small text
  'meridian-fine-detail.png': `
    <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
      <g fill="none" stroke="#14532D" stroke-width="3">
        <circle cx="250" cy="210" r="150"/>
        <circle cx="250" cy="210" r="130"/>
        <circle cx="250" cy="210" r="110"/>
        <ellipse cx="250" cy="210" rx="150" ry="60"/>
        <ellipse cx="250" cy="210" rx="60" ry="150"/>
        <line x1="100" y1="210" x2="400" y2="210"/>
        <line x1="250" y1="60" x2="250" y2="360"/>
      </g>
      <text x="250" y="420" font-family="Times New Roman, serif" font-size="42" fill="#14532D" text-anchor="middle" letter-spacing="6">MERIDIAN</text>
      <text x="250" y="465" font-family="Times New Roman, serif" font-size="20" fill="#14532D" text-anchor="middle" letter-spacing="4">ANALYTICS · EST. 2018</text>
    </svg>`,
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const [file, svg] of Object.entries(LOGOS)) {
    const out = path.join(OUT_DIR, file)
    await sharp(Buffer.from(svg)).png().toFile(out)
    const { size } = fs.statSync(out)
    console.log(`${file} — ${(size / 1024).toFixed(1)}KB`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
