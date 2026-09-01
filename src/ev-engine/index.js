'use strict'
const path = require('path')
const fs = require('fs')
const { loadZonesConfig, resolveZonesFileName } = require('./zones')
const { runBrandingStage } = require('./pipeline/branding-stage')
const { runSceneStage } = require('./pipeline/scene-stage')
const { runSimpleSceneStage } = require('./pipeline/simple-scene-stage')
const { runDecorReferenceStage } = require('./pipeline/decor-reference-stage')
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
  const decorPresetsConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, engineConfig.decorPromptsVersion), 'utf8'))
  const decorCorrectionsConfig = JSON.parse(fs.readFileSync(path.join(cfgDir, engineConfig.decorCorrectionsVersion), 'utf8'))
  return {
    engineConfig, zonesConfig, presetsConfig, correctionsConfig,
    simplePresetsConfig, simpleCorrectionsConfig,
    decorPresetsConfig, decorCorrectionsConfig,
  }
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

async function runDecorReference(opts, configs = loadEngineConfig()) {
  return runDecorReferenceStage({ ...opts, ...configs })
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
  {
    companyName, logoSource, zones = 'all', theme, venue, params = {},
    brandingOverride, sceneOverride, cache = null, vehicle,
    // 2026-08-28 — optional edit-mode passthrough (see runSimpleSceneStage).
    currentSceneBuffer, editInstruction,
  },
  configs = loadEngineConfig(vehicle)
) {
  const isEditMode = !!currentSceneBuffer

  // 2026-09-01 (bug fix): edit mode used to still run the full branding stage and use
  // ITS OWN output (a freshly Gemini-regenerated "branded EV") as the vehicle-geometry
  // anchor. That's an unreliable anchor — the branding stage is itself an AI generation
  // step that can drift (wrong roof, wrong proportions, etc., the exact class of bug
  // this whole edit-mode feature exists to fix), so a bad branding-stage run silently
  // corrupted the "ground truth" edit mode was told to correct TOWARD. Confirmed live:
  // a user gave an explicit correction instruction ("make sure the EV matches the real
  // SNACKET reference") and regenerate produced a DIFFERENT wrong vehicle instead of the
  // real one — the branding-stage run for that call had drifted too.
  //
  // Fix: skip branding stage entirely in edit mode (saves a full Gemini call — it isn't
  // needed here anyway, IMAGE A already carries whatever branding was previously
  // applied) and instead pass the engine's own fixed, never-regenerated raw EV reference
  // photo (zonesConfig.referenceImage — the actual source-of-truth photo, same file the
  // branding stage itself starts from) straight through as the geometry anchor. This
  // matches Stage B's proven ai-regen pattern (hub/src/app/api/proposals/[review_token]/
  // ai-regen/route.ts), which anchors on the same kind of fixed raw reference, not a
  // regenerated derivative.
  if (isEditMode) {
    const scene = await runSimpleSceneStage({
      companyName, logoSource, theme, venue, params,
      currentSceneBuffer, editInstruction,
      rawEvReferenceUrl: configs.zonesConfig.referenceImage,
      providerOverride: sceneOverride,
      ...configs,
    })
    return { branding: null, scene }
  }

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

module.exports = { loadEngineConfig, runBranding, runScene, runSimpleScene, runDecorReference, runFull, runSimpleFull, BrandedEvCache }
