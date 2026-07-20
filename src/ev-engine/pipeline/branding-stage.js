'use strict'
const { fetchBuffer, sniffMime } = require('../assets')
const { resolveZones } = require('../zones')
const { buildBrandingPrompt } = require('../prompt-builder')
const { getProvider } = require('../providers')
const { brandingCacheKey } = require('./cache')

/**
 * Stage 1 — branding pass.
 * IMAGE A = raw EV reference (plain white background), IMAGE B = client logo.
 * Output: branded EV on the same neutral background — the per-client artifact John approves.
 */
async function runBrandingStage({
  companyName,
  logoSource,           // URL | local path | Buffer
  zones = 'all',
  engineConfig,
  zonesConfig,
  correctionsConfig,
  providerOverride,     // { provider, model } — bench challengers
  cache = null,         // BrandedEvCache | null
}) {
  const stageCfg = engineConfig.stages.branding
  const providerName = providerOverride?.provider || stageCfg.provider
  const model = providerOverride?.model || stageCfg.model

  const [evBuffer, logoBuffer] = await Promise.all([
    fetchBuffer(zonesConfig.referenceImage),
    fetchBuffer(logoSource),
  ])

  const zoneIds = resolveZones(zones, zonesConfig)
  const cacheKey = brandingCacheKey({
    logoBuffer,
    zoneIds,
    configVersion: engineConfig.configVersion,
    provider: providerName,
    model,
  })

  if (cache) {
    const cached = await cache.get(cacheKey)
    if (cached) {
      return { buffer: cached, cacheKey, cached: true, meta: { provider: providerName, model, fromCache: true } }
    }
  }

  const prompt = buildBrandingPrompt({ companyName, zoneIds, zonesConfig, correctionsConfig })
  const provider = getProvider(providerName)
  const { buffer, meta } = await provider.generate({
    images: [
      { buffer: evBuffer, mimeType: sniffMime(evBuffer, zonesConfig.referenceImage), role: 'primary' },
      { buffer: logoBuffer, mimeType: sniffMime(logoBuffer, String(logoSource)), role: 'ref' },
    ],
    prompt,
    opts: {
      model,
      aspectRatio: stageCfg.aspectRatio,
      resolution: stageCfg.resolution,
      timeoutMs: engineConfig.limits.timeoutMs,
      label: `branding:${companyName}`,
    },
  })

  if (cache) await cache.set(cacheKey, buffer)
  return { buffer, cacheKey, cached: false, meta: { ...meta, prompt, zones: zoneIds.selected } }
}

module.exports = { runBrandingStage }
