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

test('loadWrapZonesConfig loads the real calibrated config without throwing, and resolveWrapZones on an unknown angle selects nothing (all 13 real zones fall through to unselected)', () => {
  const config = loadWrapZonesConfig()
  assert.equal(config.version, 'v1')
  // Real zone data was calibrated 2026-07-28 from the user's hand-drawn area sketches — all
  // 3 vehicles now have real zones under the single 'assembled' angle (see this plan's memory
  // note on why one combined photo per vehicle was chosen over 3 separate crops, not 3 real
  // angles). Querying a non-real angle like 'rear_3q' correctly selects none of them — but
  // unlike Phase 1's still-empty catalog, `unselected` is no longer empty either: all 13 real
  // zone ids exist and are reported as not-visible-in-this-angle, not simply absent.
  const result = resolveWrapZones('nitrocafe', 'rear_3q', undefined, config)
  assert.deepEqual(result.selected, [])
  assert.equal(result.unselected.length, 13)
})

test('resolveWrapZones on the real nitrocafe config resolves all 13 zones under the assembled angle', () => {
  const config = loadWrapZonesConfig()
  const result = resolveWrapZones('nitrocafe', 'assembled', 'all', config)
  assert.equal(result.selected.length, 13)
  assert.deepEqual(result.unselected, [])
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
