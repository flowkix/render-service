'use strict'

/**
 * Computes the 3x3 projective matrix (as [a,b,c,d,e,f,g,h], with the implicit bottom-right
 * entry fixed at 1) that maps the unit square (0,0),(1,0),(1,1),(0,1) onto the destination
 * quadrilateral cornerPoints = [TL, TR, BR, BL]. Classic "unit square to quad" derivation
 * (Heckbert, "Fundamentals of Texture Mapping and Image Warping", 1989).
 * Forward mapping: x = (a*u + b*v + c) / (g*u + h*v + 1), y likewise with d,e,f.
 */
function computeQuadMatrix(cornerPoints) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = cornerPoints
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  let a, b, c, d, e, f, g, h
  if (dx3 === 0 && dy3 === 0) {
    // Parallelogram special case: purely affine, no projective term needed.
    a = x1 - x0; b = x2 - x1; c = x0
    d = y1 - y0; e = y2 - y1; f = y0
    g = 0; h = 0
  } else {
    const denom = dx1 * dy2 - dy1 * dx2
    g = (dx3 * dy2 - dx2 * dy3) / denom
    h = (dx1 * dy3 - dy1 * dx3) / denom
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0
  }
  return [a, b, c, d, e, f, g, h]
}

/** Inverts the 3x3 matrix [[a,b,c],[d,e,f],[g,h,1]], returned flattened as 9 numbers. */
function invertMatrix([a, b, c, d, e, f, g, h]) {
  const A = e - f * h, B = -(d - f * g), C = d * h - e * g
  const D = -(b - c * h), E = a - c * g, F = -(a * h - b * g)
  const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d
  const det = a * A + b * B + c * C
  if (det === 0) throw new Error('perspective-warp: degenerate quad, matrix not invertible')
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det]
}

/** Bilinear sample of `src` (raw RGBA) at continuous coordinates (srcX, srcY). */
function bilinearSample(src, srcX, srcY) {
  const { data, width, height, channels } = src
  const x0 = Math.floor(srcX), y0 = Math.floor(srcY)
  const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1)
  const cx0 = Math.max(0, Math.min(x0, width - 1)), cy0 = Math.max(0, Math.min(y0, height - 1))
  const fx = srcX - x0, fy = srcY - y0
  const out = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const v00 = c < channels ? data[(cy0 * width + cx0) * channels + c] : 255
    const v10 = c < channels ? data[(cy0 * width + x1) * channels + c] : 255
    const v01 = c < channels ? data[(y1 * width + cx0) * channels + c] : 255
    const v11 = c < channels ? data[(y1 * width + x1) * channels + c] : 255
    const top = v00 * (1 - fx) + v10 * fx
    const bottom = v01 * (1 - fx) + v11 * fx
    out[c] = top * (1 - fy) + bottom * fy
  }
  return out
}

/**
 * Warps `src` (raw RGBA object: {data, width, height, channels}) into the quadrilateral
 * described by `cornerPoints` ([TL,TR,BR,BL], absolute coordinates). Returns a raw RGBA
 * buffer sized to the quad's bounding box, with alpha=0 for any pixel that falls inside the
 * bounding box but outside the quad (inverse mapping — no gaps, hard edge, no antialiasing).
 */
function warpImageToQuad(src, cornerPoints) {
  if (!Array.isArray(cornerPoints) || cornerPoints.length !== 4) {
    throw new Error('warpImageToQuad: cornerPoints must be an array of 4 [x,y] points (TL,TR,BR,BL)')
  }
  const xs = cornerPoints.map(p => p[0])
  const ys = cornerPoints.map(p => p[1])
  const minX = Math.floor(Math.min(...xs))
  const minY = Math.floor(Math.min(...ys))
  const maxX = Math.ceil(Math.max(...xs))
  const maxY = Math.ceil(Math.max(...ys))
  const outWidth = maxX - minX
  const outHeight = maxY - minY

  const M = computeQuadMatrix(cornerPoints)
  const [ia, ib, ic, id_, ie, if_, ig, ih, ii] = invertMatrix(M)

  const out = Buffer.alloc(outWidth * outHeight * 4, 0)

  for (let oy = 0; oy < outHeight; oy++) {
    for (let ox = 0; ox < outWidth; ox++) {
      const absX = minX + ox
      const absY = minY + oy
      const wCoord = ig * absX + ih * absY + ii
      const u = (ia * absX + ib * absY + ic) / wCoord
      const v = (id_ * absX + ie * absY + if_) / wCoord
      const outIdx = (oy * outWidth + ox) * 4
      if (u < 0 || u > 1 || v < 0 || v > 1) continue // stays alpha=0 (already zeroed)
      const srcX = u * (src.width - 1)
      const srcY = v * (src.height - 1)
      const [r, g, b, a] = bilinearSample(src, srcX, srcY)
      out[outIdx] = Math.round(r)
      out[outIdx + 1] = Math.round(g)
      out[outIdx + 2] = Math.round(b)
      out[outIdx + 3] = Math.round(a)
    }
  }

  return { data: out, width: outWidth, height: outHeight, channels: 4 }
}

module.exports = { warpImageToQuad }
