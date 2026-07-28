const { hexToRgb } = require('./effects-template')

// Perceived-brightness (YIQ) heuristic — a design decision for legible text
// placement, not a WCAG accessibility guarantee. 128/255 is the standard
// midpoint threshold.
function isLightBackground(hex) {
  const [r, g, b] = hexToRgb(hex).split(', ').map(Number)
  const brightness = (299 * r + 587 * g + 114 * b) / 1000
  return brightness >= 128
}

// palette: { green, gold, beige, backgroundHex } (BusinessCardV2Palette)
function resolveTokens(palette) {
  const light = isLightBackground(palette.backgroundHex)
  // Both hand-built CLI variants use palette.gold for every divider/rule/
  // kicker accent. If the user picks gold itself as the background, that
  // accent would render gold-on-gold — fall back to charcoal in that one case.
  const dividerColor = palette.backgroundHex === palette.gold ? 'var(--charcoal)' : 'var(--gold)'

  return {
    light,
    sheetBg: palette.backgroundHex,
    primaryTextColor: light ? 'var(--charcoal)' : '#F5F3EE',
    contactLineColor: light ? '#333' : '#D8D5CD',
    subColor: light ? '#4a4a4a' : '#C9C6BE',
    qrLabelColor: light ? '#666' : '#C9C6BE',
    badgeFill: light ? 'var(--charcoal)' : 'var(--gold)',
    badgeStroke: light ? '#fff' : '#363C43',
    hasLogoPlate: !light,
    hasPhotoWindow: !light,
    dividerColor,
  }
}

module.exports = { isLightBackground, resolveTokens }
