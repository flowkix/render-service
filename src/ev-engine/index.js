'use strict'
const path = require('path')
const fs = require('fs')
const { loadZonesConfig } = require('./zones')
const { runBrandingStage } = require('./pipeline/branding-stage')
const { runSceneStage } = require('./pipeline/scene-stage')
const { BrandedEvCache } = require('./pipeline/cache')

function loadEngineConfig() {
  const cfgDir = path.join(__dirname, 'config')
  const engineConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, 'engine.config.json'), 'utf8'))
  const zonesConfig = loadZonesConfig(engineConfig)
  const presetsConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, engineConfig.promptsVersion), 'utf8'))
  const correctionsConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, engineConfig.correctionsVersion), 'utf8'))
  return { engineConfig, zonesConfig, presetsConfig, correctionsConfig }
}

/**
 * Public engine API. All functions accept an optional preloaded `configs`
 * (from loadEngineConfig()) so the bench can snapshot one config per run.
 */
async function runBranding(opts, configs = loadEngineConfig()) {
  return runBrandingStage({ ...opts, ...configs })
}

async function runScene(opts, configs = loadEngineConfig()) {
  return runSceneStage({ ...opts, ...configs })
}

async function runFull(
  { companyName, logoSource, zones = 'all', presetId, params = {}, brandingOverride, sceneOverride, cache = null },
  configs = loadEngineConfig()
) {
  const branding = await runBrandingStage({
    companyName, logoSource, zones,
    providerOverride: brandingOverride, cache,
    ...configs,
  })
  const scene = await runSceneStage({
    companyName, brandedEvBuffer: branding.buffer, logoSource, presetId, params,
    providerOverride: sceneOverride,
    ...configs,
  })
  return { branding, scene }
}

module.exports = { loadEngineConfig, runBranding, runScene, runFull, BrandedEvCache }
