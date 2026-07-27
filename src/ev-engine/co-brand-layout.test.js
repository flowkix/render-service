const { test } = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { combineZoneAssets } = require('./co-brand-layout')

async function solidPng(width, height, background) {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer()
}

test('combineZoneAssets throws on an unknown shape, listing the 3 valid shapes', async () => {
  const red = await solidPng(10, 10, { r: 255, g: 0, b: 0, alpha: 255 })
  await assert.rejects(
    () => combineZoneAssets({ shape: 'triangle', width: 10, height: 10, assetBuffers: [red, red] }),
    /unknown shape "triangle"\. Valid shapes: circle, rect_landscape, rect_portrait/
  )
})

test('combineZoneAssets with a single asset resizes it to fit the zone, centered', async () => {
  const red = await solidPng(50, 50, { r: 255, g: 0, b: 0, alpha: 255 })
  const result = await combineZoneAssets({ shape: 'circle', width: 100, height: 100, assetBuffers: [red] })
  const { data, info } = await sharp(result).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 100)
  assert.equal(info.height, 100)
  const idx = (50 * info.width + 50) * 4
  assert.deepEqual([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]], [255, 0, 0, 255])
})

test('combineZoneAssets with shape "circle" stacks 2 assets top/bottom', async () => {
  const red = await solidPng(50, 50, { r: 255, g: 0, b: 0, alpha: 255 })
  const blue = await solidPng(50, 50, { r: 0, g: 0, b: 255, alpha: 255 })
  const result = await combineZoneAssets({ shape: 'circle', width: 100, height: 100, assetBuffers: [red, blue] })
  const { data, info } = await sharp(result).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const topIdx = (25 * info.width + 50) * 4
  const bottomIdx = (75 * info.width + 50) * 4
  assert.deepEqual([data[topIdx], data[topIdx + 1], data[topIdx + 2], data[topIdx + 3]], [255, 0, 0, 255])
  assert.deepEqual([data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2], data[bottomIdx + 3]], [0, 0, 255, 255])
})

test('combineZoneAssets with shape "rect_landscape" places 2 assets left/right', async () => {
  const red = await solidPng(50, 50, { r: 255, g: 0, b: 0, alpha: 255 })
  const blue = await solidPng(50, 50, { r: 0, g: 0, b: 255, alpha: 255 })
  const result = await combineZoneAssets({ shape: 'rect_landscape', width: 100, height: 100, assetBuffers: [red, blue] })
  const { data, info } = await sharp(result).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const leftIdx = (50 * info.width + 25) * 4
  const rightIdx = (50 * info.width + 75) * 4
  assert.deepEqual([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2], data[leftIdx + 3]], [255, 0, 0, 255])
  assert.deepEqual([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2], data[rightIdx + 3]], [0, 0, 255, 255])
})

test('combineZoneAssets with shape "rect_portrait" stacks 2 assets top/bottom', async () => {
  const red = await solidPng(50, 50, { r: 255, g: 0, b: 0, alpha: 255 })
  const blue = await solidPng(50, 50, { r: 0, g: 0, b: 255, alpha: 255 })
  const result = await combineZoneAssets({ shape: 'rect_portrait', width: 100, height: 100, assetBuffers: [red, blue] })
  const { data, info } = await sharp(result).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const topIdx = (25 * info.width + 50) * 4
  const bottomIdx = (75 * info.width + 50) * 4
  assert.deepEqual([data[topIdx], data[topIdx + 1], data[topIdx + 2], data[topIdx + 3]], [255, 0, 0, 255])
  assert.deepEqual([data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2], data[bottomIdx + 3]], [0, 0, 255, 255])
})
