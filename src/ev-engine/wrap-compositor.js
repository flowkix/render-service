'use strict'
const sharp = require('sharp')
const { warpImageToQuad } = require('./perspective-warp')

function boundingBoxOf(cornerPoints) {
  const xs = cornerPoints.map(p => p[0])
  const ys = cornerPoints.map(p => p[1])
  return {
    left: Math.floor(Math.min(...xs)),
    top: Math.floor(Math.min(...ys)),
  }
}

/**
 * Warps `logoImageBuffer` into `cornerPoints` on top of `baseImageBuffer`, then reintegrates
 * the base image's original light/shadow at that exact spot (grayscale crop of the ORIGINAL
 * base, dimmed via `shadowOpacity`, re-composited with `shadowBlendMode`) so the flat logo
 * doesn't look like a pasted-on decal. Returns a JPEG buffer at the base image's dimensions.
 */
async function compositeZoneOntoBase({
  baseImageBuffer,
  logoImageBuffer,
  cornerPoints,
  shadowBlendMode = 'soft-light',
  shadowOpacity = 0.35,
}) {
  // 1-2. Load logo as raw RGBA and warp it into the quad.
  const logoRaw = await sharp(logoImageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const warped = warpImageToQuad(
    { data: logoRaw.data, width: logoRaw.info.width, height: logoRaw.info.height, channels: logoRaw.info.channels },
    cornerPoints
  )

  // 3. Reconstruct the warped raw buffer as a PNG so sharp can composite it.
  const warpedPng = await sharp(Buffer.from(warped.data), {
    raw: { width: warped.width, height: warped.height, channels: 4 },
  }).png().toBuffer()

  const { left, top } = boundingBoxOf(cornerPoints)

  // 4. Composite the warped logo onto the base.
  const withLogoBuffer = await sharp(baseImageBuffer)
    .composite([{ input: warpedPng, left, top, blend: 'over' }])
    .png()
    .toBuffer()

  // 5. Extract the SAME region from the ORIGINAL base, grayscale it, dim its alpha to
  //    shadowOpacity, and re-composite it on top with shadowBlendMode — this is what
  //    reintegrates the surface's real light/shadow into the flat logo.
  const grayCrop = await sharp(baseImageBuffer)
    .extract({ left, top, width: warped.width, height: warped.height })
    .grayscale()
    .removeAlpha()
    .ensureAlpha(shadowOpacity)
    .png()
    .toBuffer()

  // 6. Final encode.
  return sharp(withLogoBuffer)
    .composite([{ input: grayCrop, left, top, blend: shadowBlendMode }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

module.exports = { compositeZoneOntoBase }
