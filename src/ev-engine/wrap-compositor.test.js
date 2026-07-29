const { test } = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { compositeZoneOntoBase } = require('./wrap-compositor')

async function buildFixtures() {
  const darkPatch = await sharp({
    create: { width: 80, height: 80, channels: 3, background: { r: 90, g: 90, b: 90 } },
  }).png().toBuffer()
  const baseImageBuffer = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 220, g: 220, b: 220 } },
  }).composite([{ input: darkPatch, left: 60, top: 60 }]).png().toBuffer()
  const logoImageBuffer = await sharp({
    create: { width: 80, height: 80, channels: 4, background: { r: 0, g: 200, b: 0, alpha: 255 } },
  }).png().toBuffer()
  const cornerPoints = [[60, 60], [140, 60], [140, 140], [60, 140]]
  return { baseImageBuffer, logoImageBuffer, cornerPoints }
}

test('compositeZoneOntoBase returns a valid JPEG at the base image dimensions', async () => {
  const { baseImageBuffer, logoImageBuffer, cornerPoints } = await buildFixtures()
  const result = await compositeZoneOntoBase({ baseImageBuffer, logoImageBuffer, cornerPoints })
  const meta = await sharp(result).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.equal(meta.width, 200)
  assert.equal(meta.height, 200)
})

test('compositeZoneOntoBase reintegrates the base shadow so the zone center differs from a flat (no-shadow) composite', async () => {
  const { baseImageBuffer, logoImageBuffer, cornerPoints } = await buildFixtures()
  const result = await compositeZoneOntoBase({ baseImageBuffer, logoImageBuffer, cornerPoints })
  const control = await sharp(baseImageBuffer)
    .composite([{ input: logoImageBuffer, left: 60, top: 60, blend: 'over' }])
    .jpeg({ quality: 92 })
    .toBuffer()

  const { data: resultData, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true })
  const { data: controlData } = await sharp(control).raw().toBuffer({ resolveWithObject: true })
  const idx = (100 * info.width + 100) * info.channels
  const resultPixel = [resultData[idx], resultData[idx + 1], resultData[idx + 2]]
  const controlPixel = [controlData[idx], controlData[idx + 1], controlData[idx + 2]]
  assert.notDeepEqual(resultPixel, controlPixel)
})
