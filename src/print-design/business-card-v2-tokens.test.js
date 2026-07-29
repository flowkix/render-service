const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isLightBackground, resolveTokens } = require('./business-card-v2-tokens')

test('isLightBackground classifies SNACKET brand colors as light', () => {
  assert.equal(isLightBackground('#88AD59'), true) // green
  assert.equal(isLightBackground('#DAAB61'), true) // gold
  assert.equal(isLightBackground('#E6D5B5'), true) // beige
})

test('isLightBackground classifies charcoal as dark', () => {
  assert.equal(isLightBackground('#363C43'), false)
})

const PALETTE = { green: '#88AD59', gold: '#DAAB61', beige: '#E6D5B5' }

test('resolveTokens picks the light-treatment bundle for a light background', () => {
  const t = resolveTokens({ ...PALETTE, backgroundHex: '#E6D5B5' })
  assert.equal(t.light, true)
  assert.equal(t.primaryTextColor, 'var(--charcoal)')
  assert.equal(t.contactLineColor, '#333')
  assert.equal(t.subColor, '#4a4a4a')
  assert.equal(t.qrLabelColor, '#666')
  assert.equal(t.badgeFill, 'var(--charcoal)')
  assert.equal(t.badgeStroke, '#fff')
  assert.equal(t.hasLogoPlate, false)
  assert.equal(t.hasPhotoWindow, false)
  assert.equal(t.dividerColor, 'var(--gold)')
})

test('resolveTokens picks the dark-treatment bundle for the charcoal background', () => {
  const t = resolveTokens({ ...PALETTE, backgroundHex: '#363C43' })
  assert.equal(t.light, false)
  assert.equal(t.primaryTextColor, '#F5F3EE')
  assert.equal(t.contactLineColor, '#D8D5CD')
  assert.equal(t.subColor, '#C9C6BE')
  assert.equal(t.qrLabelColor, '#C9C6BE')
  assert.equal(t.badgeFill, 'var(--gold)')
  assert.equal(t.badgeStroke, '#363C43')
  assert.equal(t.hasLogoPlate, true)
  assert.equal(t.hasPhotoWindow, true)
  assert.equal(t.dividerColor, 'var(--gold)')
})

test('resolveTokens falls the divider back to charcoal when the chosen background equals palette.gold', () => {
  const t = resolveTokens({ ...PALETTE, backgroundHex: PALETTE.gold })
  assert.equal(t.dividerColor, 'var(--charcoal)')
})

test('resolveTokens does not fall back the divider for any other background', () => {
  const t = resolveTokens({ ...PALETTE, backgroundHex: PALETTE.green })
  assert.equal(t.dividerColor, 'var(--gold)')
})

test('resolveTokens falls the title color back to charcoal when the chosen background equals palette.gold (same collision as the divider)', () => {
  const t = resolveTokens({ ...PALETTE, backgroundHex: PALETTE.gold })
  assert.equal(t.titleColor, 'var(--charcoal)')
})

test('resolveTokens keeps the title color gold for any other background', () => {
  const t = resolveTokens({ ...PALETTE, backgroundHex: PALETTE.beige })
  assert.equal(t.titleColor, 'var(--gold)')
})

test('resolveTokens falls the green accent color back to charcoal when the chosen background equals palette.green', () => {
  const t = resolveTokens({ ...PALETTE, backgroundHex: PALETTE.green })
  assert.equal(t.greenAccentColor, 'var(--charcoal)')
})

test('resolveTokens keeps the green accent color green for any other background', () => {
  const t = resolveTokens({ ...PALETTE, backgroundHex: PALETTE.beige })
  assert.equal(t.greenAccentColor, 'var(--green)')
})
