const { test } = require('node:test')
const assert = require('node:assert/strict')
const { warpImageToQuad } = require('./perspective-warp')

function solidRgba(width, height, [r, g, b, a]) {
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a
  }
  return { data, width, height, channels: 4 }
}

test('warpImageToQuad with an undistorted rectangle fills the bounding box with the source color', () => {
  const src = solidRgba(100, 50, [200, 100, 50, 255])
  const cornerPoints = [[10, 10], [110, 10], [110, 60], [10, 60]] // TL,TR,BR,BL
  const result = warpImageToQuad(src, cornerPoints)
  assert.equal(result.width, 100)
  assert.equal(result.height, 50)
  const idx = (25 * result.width + 50) * 4
  assert.deepEqual(
    [result.data[idx], result.data[idx + 1], result.data[idx + 2], result.data[idx + 3]],
    [200, 100, 50, 255]
  )
})

test('warpImageToQuad with a trapezoid restricts the fill to the quad, not the whole bounding box', () => {
  const src = solidRgba(100, 100, [30, 144, 255, 255])
  const cornerPoints = [[0, 0], [100, 20], [100, 80], [0, 100]] // narrows on the right side
  const result = warpImageToQuad(src, cornerPoints)
  assert.equal(result.width, 100)
  assert.equal(result.height, 100)
  // (95,50): geometrically inside the narrowed right edge of the trapezoid
  const insideIdx = (50 * result.width + 95) * 4
  assert.deepEqual(
    [result.data[insideIdx], result.data[insideIdx + 1], result.data[insideIdx + 2], result.data[insideIdx + 3]],
    [30, 144, 255, 255]
  )
  // (95,5): inside the bounding box but geometrically outside the narrowed trapezoid
  const outsideIdx = (5 * result.width + 95) * 4
  assert.deepEqual(
    [result.data[outsideIdx], result.data[outsideIdx + 1], result.data[outsideIdx + 2], result.data[outsideIdx + 3]],
    [0, 0, 0, 0]
  )
})
