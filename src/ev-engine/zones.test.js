const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadZonesConfig, resolveZonesFileName, resolveZones } = require('./zones')

const FIXTURE_ENGINE_CONFIG = {
  zonesVersion: 'zones.v1.json',
  vehicles: {
    mixobar: { zonesVersion: 'zones-mixobar.v1.json' },
  },
}

test('resolveZonesFileName with no vehicle returns the default (NitroCafé) file — every pre-existing caller', () => {
  assert.equal(resolveZonesFileName(FIXTURE_ENGINE_CONFIG, undefined), 'zones.v1.json')
})

test('resolveZonesFileName with a known vehicle returns that vehicle\'s file', () => {
  assert.equal(resolveZonesFileName(FIXTURE_ENGINE_CONFIG, 'mixobar'), 'zones-mixobar.v1.json')
})

test('resolveZonesFileName with an unknown vehicle throws a clear error', () => {
  assert.throws(() => resolveZonesFileName(FIXTURE_ENGINE_CONFIG, 'freshblend'), /Unknown vehicle "freshblend"/)
})

test('resolveZonesFileName against an engineConfig with no vehicles map still resolves the default', () => {
  assert.equal(resolveZonesFileName({ zonesVersion: 'zones.v1.json' }, undefined), 'zones.v1.json')
})

test('loadZonesConfig loads the real NitroCafé config (default) without throwing', () => {
  const config = loadZonesConfig('zones.v1.json')
  assert.equal(config.version, 'v1')
  assert.ok(config.zones.left_door_interior)
  assert.ok(config.zones.header_band)
})

test('loadZonesConfig loads the real MixoBar config without throwing, with the 3 verified zones', () => {
  const config = loadZonesConfig('zones-mixobar.v1.json')
  assert.equal(config.version, 'v1')
  assert.ok(config.referenceImage.startsWith('https://'))
  assert.deepEqual(Object.keys(config.zones).sort(), ['driver_cab_panel', 'left_door_interior', 'right_door_interior'])
})

test('resolveZones("all") on the real MixoBar config selects all 3 zones', () => {
  const config = loadZonesConfig('zones-mixobar.v1.json')
  const result = resolveZones('all', config)
  assert.equal(result.selected.length, 3)
  assert.deepEqual(result.unselected, [])
})
