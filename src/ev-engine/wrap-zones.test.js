const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadWrapZonesConfig, resolveWrapZones, validateNoDirectionalBias } = require('./wrap-zones')

const FIXTURE_CONFIG = {
  version: 'v1-test',
  vehicles: {
    testvan: {
      angles: {},
      zones: {
        zone_a: { label: 'Zone A', visibleInAngles: ['front', 'rear'], shape: 'circle', compositingMode: 'sharp' },
        zone_b: { label: 'Zone B', visibleInAngles: ['side'], shape: 'rect_landscape', compositingMode: 'sharp' },
      },
    },
  },
}

test('loadWrapZonesConfig loads the real (still-empty) config without throwing, and resolveWrapZones on a vehicle with no zones returns empty selections', () => {
  const config = loadWrapZonesConfig()
  assert.equal(config.version, 'v1')
  const result = resolveWrapZones('nitrocafe', 'rear_3q', undefined, config)
  assert.deepEqual(result, { selected: [], unselected: [] })
})

test('resolveWrapZones filters zones by visibleInAngles for the requested angle', () => {
  const result = resolveWrapZones('testvan', 'front', 'all', FIXTURE_CONFIG)
  assert.deepEqual(result, { selected: ['zone_a'], unselected: ['zone_b'] })
})

test('resolveWrapZones throws on an unknown zone id, listing valid ids', () => {
  assert.throws(
    () => resolveWrapZones('testvan', 'front', ['zone_z'], FIXTURE_CONFIG),
    /Unknown zone id\(s\): zone_z\. Valid ids: zone_a, zone_b/
  )
})

test('validateNoDirectionalBias throws when a generative zone anchorDescription uses left/right with no landmark', () => {
  const biased = {
    vehicles: {
      nitrocafe: {
        zones: {
          bad_zone: { compositingMode: 'generative', anchorDescription: 'on the left side' },
        },
      },
    },
  }
  assert.throws(() => validateNoDirectionalBias(biased), /bad_zone/)
})

test('validateNoDirectionalBias allows left/right when a landmark is present in anchorDescription', () => {
  const ok = {
    vehicles: {
      nitrocafe: {
        zones: {
          good_zone: { compositingMode: 'generative', anchorDescription: 'directly behind the left-side faucet' },
        },
      },
    },
  }
  assert.doesNotThrow(() => validateNoDirectionalBias(ok))
})
