// Mirrors hub/scripts/print-design/templates/_shared/effects.css — keep in sync manually
// (separate repos, no shared module boundary — see plan's "Repo boundary correction").
function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

// palette: { green: '#hex', gold: '#hex', beige: '#hex' }
function buildEffectsCss(palette) {
  const beigeRgb = hexToRgb(palette.beige)
  const goldRgb = hexToRgb(palette.gold)
  const greenRgb = hexToRgb(palette.green)

  return `
:root {
  --charcoal: #363C43;
  --beige: ${palette.beige};
  --green: ${palette.green};
  --gold: ${palette.gold};
  --deepgreen: #12502B;
  --beige-rgb: ${beigeRgb};
  --gold-rgb: ${goldRgb};
  --green-rgb: ${greenRgb};
  --near-black: #1c1e21;
}

.grain {
  position: absolute;
  inset: 0;
  opacity: 0.08;
  mix-blend-mode: overlay;
  pointer-events: none;
  z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}
`
}

module.exports = { buildEffectsCss, hexToRgb }
