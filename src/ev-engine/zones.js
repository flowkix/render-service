'use strict'
const path = require('path')
const fs = require('fs')

function loadZonesConfig(engineConfig) {
  const file = path.join(__dirname, 'config', engineConfig.zonesVersion)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
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

module.exports = { loadZonesConfig, resolveZones }
