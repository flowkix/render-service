'use strict'
const path = require('path')
const fs = require('fs')

const DIRECTIONAL_RE = /\b(left|right)\b/i
const LANDMARK_ALLOWLIST_RE = /\b(faucet|hinge|door|wheel|cab|disc|panel|wall)\b/i

/**
 * Anti-bias guard: a generative-fill anchorDescription must not rely on raw "left"/"right"
 * without anchoring to a physical landmark — otherwise the generative model has no stable
 * reference point across camera angles/photos and will hallucinate position.
 */
function validateNoDirectionalBias(zonesConfig) {
  const vehicles = zonesConfig.vehicles || {}
  for (const [vehicleSlug, vehicle] of Object.entries(vehicles)) {
    const zones = vehicle.zones || {}
    for (const [zoneId, zone] of Object.entries(zones)) {
      if (zone.compositingMode !== 'generative') continue
      const desc = zone.anchorDescription || ''
      if (DIRECTIONAL_RE.test(desc) && !LANDMARK_ALLOWLIST_RE.test(desc)) {
        throw new Error(
          `wrap-zones anti-bias guard: zone "${zoneId}" (vehicle "${vehicleSlug}") anchorDescription "${desc}" uses left/right without a landmark reference. Add a landmark (faucet, hinge, door, wheel, cab, disc, panel, wall) or rephrase without left/right.`
        )
      }
    }
  }
}

function loadWrapZonesConfig() {
  const file = path.join(__dirname, 'config', 'wrap-zones.v1.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  validateNoDirectionalBias(config)
  return config
}

/**
 * Resolves which zones of a given vehicle apply for a given camera angle and selection.
 * selectedZoneIds contract: 'all' | undefined | null | string[] (non-empty)
 * Returns { selected: [ids], unselected: [ids] } — both scoped to zones visible in `angle`,
 * except `unselected` also includes zones that exist but aren't visible in this angle.
 */
function resolveWrapZones(vehicleSlug, angle, selectedZoneIds, wrapZonesConfig) {
  const vehicle = wrapZonesConfig.vehicles[vehicleSlug]
  const zones = (vehicle && vehicle.zones) || {}
  const allIds = Object.keys(zones)
  const visibleIds = allIds.filter(
    id => Array.isArray(zones[id].visibleInAngles) && zones[id].visibleInAngles.includes(angle)
  )

  if (selectedZoneIds === 'all' || selectedZoneIds === undefined || selectedZoneIds === null) {
    return { selected: visibleIds, unselected: allIds.filter(id => !visibleIds.includes(id)) }
  }
  if (!Array.isArray(selectedZoneIds) || selectedZoneIds.length === 0) {
    throw new Error(`zones must be 'all' or a non-empty array. Valid ids for angle "${angle}": ${visibleIds.join(', ')}`)
  }
  const unknown = selectedZoneIds.filter(id => !allIds.includes(id))
  if (unknown.length) {
    throw new Error(`Unknown zone id(s): ${unknown.join(', ')}. Valid ids: ${allIds.join(', ')}`)
  }
  const notVisible = selectedZoneIds.filter(id => !visibleIds.includes(id))
  if (notVisible.length) {
    throw new Error(`Zone id(s) not visible in angle "${angle}": ${notVisible.join(', ')}. Valid ids for this angle: ${visibleIds.join(', ')}`)
  }
  const selectedSet = new Set(selectedZoneIds)
  return {
    selected: visibleIds.filter(id => selectedSet.has(id)),
    unselected: visibleIds.filter(id => !selectedSet.has(id)),
  }
}

module.exports = { loadWrapZonesConfig, resolveWrapZones, validateNoDirectionalBias }
