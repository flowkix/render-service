'use strict'
const sharp = require('sharp')

const VALID_SHAPES = ['circle', 'rect_landscape', 'rect_portrait']
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

async function resizeContain(buffer, width, height) {
  return sharp(buffer).resize(width, height, { fit: 'contain', background: TRANSPARENT }).png().toBuffer()
}

/**
 * 2-asset co-branding split. 'rect_landscape' places the assets side by side (left/right).
 * 'circle' and 'rect_portrait' stack them vertically (top/bottom) — a circular zone is split
 * on its horizontal diameter, same rule as a portrait rectangle.
 */
async function combineTwoAssets(shape, width, height, [bufA, bufB]) {
  let composites
  if (shape === 'rect_landscape') {
    const halfW = Math.floor(width / 2)
    const otherHalfW = width - halfW
    composites = [
      { input: await resizeContain(bufA, halfW, height), left: 0, top: 0 },
      { input: await resizeContain(bufB, otherHalfW, height), left: halfW, top: 0 },
    ]
  } else {
    const halfH = Math.floor(height / 2)
    const otherHalfH = height - halfH
    composites = [
      { input: await resizeContain(bufA, width, halfH), left: 0, top: 0 },
      { input: await resizeContain(bufB, width, otherHalfH), left: 0, top: halfH },
    ]
  }
  return sharp({ create: { width, height, channels: 4, background: TRANSPARENT } })
    .composite(composites)
    .png()
    .toBuffer()
}

/**
 * Combines 1 or 2 logo asset buffers into a single PNG sized (width, height) for a wrap zone.
 * With 1 asset: simple contain-fit, centered, transparent padding.
 * With 2 assets (co-branding): split per `shape` — see combineTwoAssets above.
 */
async function combineZoneAssets({ shape, width, height, assetBuffers }) {
  if (!VALID_SHAPES.includes(shape)) {
    throw new Error(`combineZoneAssets: unknown shape "${shape}". Valid shapes: ${VALID_SHAPES.join(', ')}`)
  }
  if (!Array.isArray(assetBuffers) || assetBuffers.length < 1 || assetBuffers.length > 2) {
    throw new Error(`combineZoneAssets: assetBuffers must contain 1 or 2 buffers, got ${Array.isArray(assetBuffers) ? assetBuffers.length : typeof assetBuffers}`)
  }
  if (assetBuffers.length === 1) {
    return resizeContain(assetBuffers[0], width, height)
  }
  return combineTwoAssets(shape, width, height, assetBuffers)
}

module.exports = { combineZoneAssets }
