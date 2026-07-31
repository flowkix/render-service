'use strict'
const path = require('path')
const fs = require('fs')
const { loadZonesConfig, resolveZonesFileName } = require('./zones')
const { runBrandingStage } = require('./pipeline/branding-stage')
const { runSceneStage } = require('./pipeline/scene-stage')
const { runSimpleSceneStage } = require('./pipeline/simple-scene-stage')
const { BrandedEvCache } = require('./pipeline/cache')

// `vehicle` is optional — every pre-existing caller omits it and keeps getting the
// original NitroCafé zones config via engineConfig.zonesVersion, unchanged.
function loadEngineConfig(vehicle) {
  const cfgDir = path.join(__dirname, 'config')
  const engineConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, 'engine.config.json'), 'utf8'))
  const zonesConfig = loadZonesConfig(resolveZonesFileName(engineConfig, vehicle))
  const presetsConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, engineConfig.promptsVersion), 'utf8'))
  const correctionsConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, engineConfig.correctionsVersion), 'utf8'))
  const simplePresetsConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, engineConfig.simplePromptsVersion), 'utf8'))
  const simpleCorrectionsConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, engineConfig.simpleCorrectionsVersion), 'utf8'))
  return { engineConfig, zonesConfig, presetsConfig, correctionsConfig, simplePresetsConfig, simpleCorrectionsConfig }
}

/**
 * Public engine API. All functions accept an optional preloaded `configs`
 * (from loadEngineConfig()) so the bench can snapshot one config per run.
 *
 * `vehicle` (opts.vehicle) is optional everywhere it appears below — omitting it
 * preserves the exact pre-existing NitroCafé-only behavior for every current caller
 * (CLT Alliance, Stage A, pitch-elevator, bench). Passing e.g. vehicle:'mixobar'
 * opts into the additive per-vehicle zones config instead.
 */
async function runBranding(opts, configs = loadEngineConfig(opts.vehicle)) {
  return runBrandingStage({ ...opts, ...configs })
}

async function runScene(opts, configs = loadEngineConfig()) {
  return runSceneStage({ ...opts, ...configs })
}

async function runSimpleScene(opts, configs = loadEngineConfig()) {
  return runSimpleSceneStage({ ...opts, ...configs })
}

async function runFull(
  { companyName, logoSource, zones = 'all', theme, venue, tableCount, ledPosterContent, params = {}, brandingOverride, sceneOverride, cache = null, vehicle },
  configs = loadEngineConfig(vehicle)
) {
  const branding = await runBrandingStage({
    companyName, logoSource, zones,
    providerOverride: brandingOverride, cache,
    ...configs,
  })
  const scene = await runSceneStage({
    companyName, brandedEvBuffer: branding.buffer, logoSource, theme, venue, tableCount, ledPosterContent, params,
    providerOverride: sceneOverride,
    ...configs,
  })
  return { branding, scene }
}

async function runSimpleFull(
  { companyName, logoSource, zones = 'all', theme, venue, params = {}, brandingOverride, sceneOverride, cache = null, vehicle },
  configs = loadEngineConfig(vehicle)
) {
  const branding = await runBrandingStage({
    companyName, logoSource, zones,
    providerOverride: brandingOverride, cache,
    ...configs,
  })
  const scene = await runSimpleSceneStage({
    companyName, brandedEvBuffer: branding.buffer, logoSource, theme, venue, params,
    providerOverride: sceneOverride,
    ...configs,
  })
  return { branding, scene }
}

module.exports = { loadEngineConfig, runBranding, runScene, runSimpleScene, runFull, runSimpleFull, BrandedEvCache }
