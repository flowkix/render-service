'use strict'
const path = require('path')
const fs = require('fs')

function loadZonesConfig(zonesFileName) {
  const file = path.join(__dirname, 'config', zonesFileName)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * Resolves which zones config file to load for a given vehicle.
 * `vehicle` is optional — omitting it (every existing caller) preserves the
 * original single-vehicle (NitroCafé) behavior via engineConfig.zonesVersion.
 * Additive only: adding a vehicle here never changes what an unspecified
 * vehicle resolves to.
 */
function resolveZonesFileName(engineConfig, vehicle) {
  if (vehicle && engineConfig.vehicles && engineConfig.vehicles[vehicle]) {
    return engineConfig.vehicles[vehicle].zonesVersion
  }
  if (vehicle && (!engineConfig.vehicles || !engineConfig.vehicles[vehicle])) {
    const known = Object.keys(engineConfig.vehicles || {}).concat('(default/unspecified)')
    throw new Error(`Unknown vehicle "${vehicle}". Known vehicles: ${known.join(', ')}`)
  }
  return engineConfig.zonesVersion
}

/**
 * zones input contract: 'all' | string[] (non-empty)
 * Returns { selected: [ids], unselected: [ids] } in registry order.
 */
function resolveZones(input, zonesConfig) {
  const allIds = Object.keys(zonesConfig.zones)
  if (input === 'all' || input === undefined || input === null) {
    return { selected: allIds, unselected: [] }
  }
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error(`zones must be 'all' or a non-empty array. Valid ids: ${allIds.join(', ')}`)
  }
  const unknown = input.filter(id => !allIds.includes(id))
  if (unknown.length) {
    throw new Error(`Unknown zone id(s): ${unknown.join(', ')}. Valid ids: ${allIds.join(', ')}`)
  }
  const selectedSet = new Set(input)
  return {
    selected: allIds.filter(id => selectedSet.has(id)),
    unselected: allIds.filter(id => !selectedSet.has(id)),
  }
}

module.exports = { loadZonesConfig, resolveZonesFileName, resolveZones }
