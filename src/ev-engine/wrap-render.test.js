// render-service/src/ev-engine/wrap-render.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { renderWrapZones } = require('./wrap-render')

const FIXTURE_CONFIG = {
  version: 'v1-test',
  vehicles: {
    testvan: {
      angles: {},
      zones: {
        zone_a: {
          label: 'Zone A',
          visibleInAngles: ['front'],
          shape: 'circle',
          compositingMode: 'sharp',
          cornerPoints: { front: [[60, 60], [140, 60], [140, 140], [60, 140]] },
        },
        zone_b: {
          label: 'Zone B (generative)',
          visibleInAngles: ['front'],
          shape: 'rect_landscape',
          compositingMode: 'generative',
        },
      },
    },
  },
}

async function makeBase() {
  return sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 220, g: 220, b: 220 } } }).png().toBuffer()
}
async function makeLogo(color) {
  return sharp({ create: { width: 80, height: 80, channels: 4, background: color } }).png().toBuffer()
}

test('renderWrapZones composites a single sharp zone and reports it applied', async () => {
  const baseImageBuffer = await makeBase()
  const logoBuffer = await makeLogo({ r: 0, g: 200, b: 0, alpha: 255 })
  const { buffer, appliedZoneIds } = await renderWrapZones({
    vehicleSlug: 'testvan',
    angle: 'front',
    baseImageBuffer,
    zoneInputs: [{ zoneId: 'zone_a', assetBuffers: [logoBuffer] }],
    wrapZonesConfig: FIXTURE_CONFIG,
  })
  assert.deepEqual(appliedZoneIds, ['zone_a'])
  const meta = await sharp(buffer).metadata()
  assert.equal(meta.width, 200)
  assert.equal(meta.height, 200)
})

test('renderWrapZones throws for an unknown vehicle', async () => {
  const baseImageBuffer = await makeBase()
  await assert.rejects(
    renderWrapZones({ vehicleSlug: 'nope', angle: 'front', baseImageBuffer, zoneInputs: [], wrapZonesConfig: FIXTURE_CONFIG }),
    /Unknown vehicle "nope"/
  )
})

test('renderWrapZones throws when a requested zone is compositingMode generative', async () => {
  const baseImageBuffer = await makeBase()
  const logoBuffer = await makeLogo({ r: 0, g: 0, b: 200, alpha: 255 })
  await assert.rejects(
    renderWrapZones({
      vehicleSlug: 'testvan',
      angle: 'front',
      baseImageBuffer,
      zoneInputs: [{ zoneId: 'zone_b', assetBuffers: [logoBuffer] }],
      wrapZonesConfig: FIXTURE_CONFIG,
    }),
    /not "sharp"/
  )
})

test('renderWrapZones throws when the zone has no cornerPoints calibrated for the requested angle', async () => {
  const baseImageBuffer = await makeBase()
  const logoBuffer = await makeLogo({ r: 200, g: 0, b: 0, alpha: 255 })
  const configMissingAngle = {
    version: 'v1-test',
    vehicles: { testvan: { angles: {}, zones: { zone_a: { ...FIXTURE_CONFIG.vehicles.testvan.zones.zone_a, cornerPoints: {} } } } },
  }
  await assert.rejects(
    renderWrapZones({
      vehicleSlug: 'testvan',
      angle: 'front',
      baseImageBuffer,
      zoneInputs: [{ zoneId: 'zone_a', assetBuffers: [logoBuffer] }],
      wrapZonesConfig: configMissingAngle,
    }),
    /no calibrated cornerPoints/
  )
})

test('renderWrapZones throws for an unknown zone id on a known vehicle', async () => {
  const baseImageBuffer = await makeBase()
  const logoBuffer = await makeLogo({ r: 100, g: 100, b: 100, alpha: 255 })
  await assert.rejects(
    renderWrapZones({
      vehicleSlug: 'testvan',
      angle: 'front',
      baseImageBuffer,
      zoneInputs: [{ zoneId: 'not_a_real_zone', assetBuffers: [logoBuffer] }],
      wrapZonesConfig: FIXTURE_CONFIG,
    }),
    /Unknown zone/
  )
})

test('renderWrapZones throws when the zone is not visible in the requested angle', async () => {
  const baseImageBuffer = await makeBase()
  const logoBuffer = await makeLogo({ r: 0, g: 200, b: 0, alpha: 255 })
  await assert.rejects(
    renderWrapZones({
      vehicleSlug: 'testvan',
      angle: 'rear',
      baseImageBuffer,
      zoneInputs: [{ zoneId: 'zone_a', assetBuffers: [logoBuffer] }],
      wrapZonesConfig: FIXTURE_CONFIG,
    }),
    /not visible in angle/
  )
})

test('renderWrapZones chains two zones — both get applied, second on top of the first result', async () => {
  const baseImageBuffer = await makeBase()
  const logoA = await makeLogo({ r: 0, g: 200, b: 0, alpha: 255 })
  const logoB = await makeLogo({ r: 0, g: 0, b: 200, alpha: 255 })
  const twoZoneConfig = {
    version: 'v1-test',
    vehicles: {
      testvan: {
        angles: {},
        zones: {
          zone_a: FIXTURE_CONFIG.vehicles.testvan.zones.zone_a,
          zone_c: {
            label: 'Zone C', visibleInAngles: ['front'], shape: 'circle', compositingMode: 'sharp',
            cornerPoints: { front: [[10, 10], [50, 10], [50, 50], [10, 50]] },
          },
        },
      },
    },
  }
  const { appliedZoneIds } = await renderWrapZones({
    vehicleSlug: 'testvan',
    angle: 'front',
    baseImageBuffer,
    zoneInputs: [
      { zoneId: 'zone_a', assetBuffers: [logoA] },
      { zoneId: 'zone_c', assetBuffers: [logoB] },
    ],
    wrapZonesConfig: twoZoneConfig,
  })
  assert.deepEqual(appliedZoneIds, ['zone_a', 'zone_c'])
})
