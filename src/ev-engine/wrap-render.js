'use strict'
const { combineZoneAssets } = require('./co-brand-layout')
const { compositeZoneOntoBase } = require('./wrap-compositor')

function boundingSize(cornerPoints) {
  const xs = cornerPoints.map(p => p[0])
  const ys = cornerPoints.map(p => p[1])
  return {
    width: Math.ceil(Math.max(...xs) - Math.min(...xs)),
    height: Math.ceil(Math.max(...ys) - Math.min(...ys)),
  }
}

/**
 * Composites 1+ pre-resolved 'sharp' zones sequentially onto `baseImageBuffer` — each zone's
 * result becomes the base for the next, so multiple non-overlapping zones stack correctly in
 * one call. Zones in 'generative' mode must be filtered out by the caller before this runs
 * (see server.js's /generate-ev-wrap-sharp route) — this function rejects the whole batch if
 * any requested zone isn't 'sharp', rather than silently skipping it.
 */
async function renderWrapZones({ vehicleSlug, angle, baseImageBuffer, zoneInputs, wrapZonesConfig }) {
  const vehicle = wrapZonesConfig.vehicles[vehicleSlug]
  if (!vehicle) {
    throw new Error(`Unknown vehicle "${vehicleSlug}"`)
  }
  const zones = vehicle.zones || {}

  let currentBase = baseImageBuffer
  const appliedZoneIds = []

  for (const { zoneId, assetBuffers } of zoneInputs) {
    const zone = zones[zoneId]
    if (!zone) {
      throw new Error(`Unknown zone "${zoneId}" for vehicle "${vehicleSlug}". Valid ids: ${Object.keys(zones).join(', ')}`)
    }
    if (zone.compositingMode !== 'sharp') {
      throw new Error(`Zone "${zoneId}" is compositingMode "${zone.compositingMode}", not "sharp" — route it through the generative fallback instead`)
    }
    if (!Array.isArray(zone.visibleInAngles) || !zone.visibleInAngles.includes(angle)) {
      throw new Error(`Zone "${zoneId}" is not visible in angle "${angle}"`)
    }
    const cornerPoints = zone.cornerPoints && zone.cornerPoints[angle]
    if (!Array.isArray(cornerPoints) || cornerPoints.length !== 4) {
      throw new Error(`Zone "${zoneId}" has no calibrated cornerPoints for angle "${angle}"`)
    }

    const { width, height } = boundingSize(cornerPoints)
    const combinedAsset = await combineZoneAssets({ shape: zone.shape, width, height, assetBuffers })
    currentBase = await compositeZoneOntoBase({ baseImageBuffer: currentBase, logoImageBuffer: combinedAsset, cornerPoints })
    appliedZoneIds.push(zoneId)
  }

  return { buffer: currentBase, appliedZoneIds }
}

module.exports = { renderWrapZones, boundingSize }
