'use strict'
const path = require('path')
const fs = require('fs')
const { loadZonesConfig, resolveZonesFileName } = require('./zones')
const { fetchBuffer } = require('./assets')
const { runBrandingStage } = require('./pipeline/branding-stage')
const { runSceneStage } = require('./pipeline/scene-stage')
const { runSimpleSceneStage } = require('./pipeline/simple-scene-stage')
const { runDecorReferenceStage } = require('./pipeline/decor-reference-stage')
const { BrandedEvCache } = require('./pipeline/cache')
// Required as a module object (not destructured) so tests can mock judgeEvFidelity.
const fidelityGate = require('./pipeline/fidelity-gate')

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

// ---------------------------------------------------------------------------------------
// EV fidelity gate wiring (2026-09-30 / 10-01) — see pipeline/fidelity-gate.js for the why.
//
// Both full pipelines run as TWO gated steps:
//   1. branding — judged against the raw EV reference on its white background (where the
//      judge is most reliable) and regenerated on failure. Measured 2026-10-01: with a 128px
//      favicon logo (the real Stage A input class) gemini-3-pro-image redrew the EV as a
//      wood-grain box truck in the branding pass itself; everything downstream then faithfully
//      reproduced that wrong vehicle. Catching it here is the cheap fix ($0.13 per retry).
//   2. scene — judged again (the scene pass can redraw the vehicle on its own); a retry
//      regenerates ONLY the scene, reusing the branded EV that already passed step 1.
// `fidelityGate` defaults to engine.config.json's block so every live route is gated by
// config; the bench and tests pass their own ({enabled:false} keeps the exact pre-gate
// single-shot behavior, byte-identical prompts, no judge calls).
// ---------------------------------------------------------------------------------------

// Judge bound to the engine's own fixed raw EV reference — the single ground truth every
// stage already starts from. Fetched once per gated request, not once per attempt.
async function makeJudge(configs, label) {
  const rawRefBuffer = await fetchBuffer(configs.zonesConfig.referenceImage)
  return buffer => fidelityGate.judgeEvFidelity({ imageBuffer: buffer, rawRefBuffer, engineConfig: configs.engineConfig, label })
}

async function gatedBranding({ companyName, logoSource, zones, brandingOverride, cache, gateConfig, judge, label }, configs) {
  return fidelityGate.gatedStep({
    gateConfig,
    kind: 'branding',
    label: `${label}/branding`,
    judge,
    generate: (_n, { correctivePrefix }) => runBrandingStage({
      companyName, logoSource, zones,
      providerOverride: brandingOverride, cache, correctivePrefix,
      ...configs,
    }),
  })
}

async function runFull(
  {
    companyName, logoSource, zones = 'all', theme, venue, tableCount, ledPosterContent, params = {},
    brandingOverride, sceneOverride, cache = null, vehicle, fidelityGate: gateConfig,
  },
  configs = loadEngineConfig(vehicle)
) {
  gateConfig = gateConfig || configs.engineConfig.fidelityGate
  const sceneArgs = (brandedEvBuffer, correctivePrefix = '') => ({
    companyName, brandedEvBuffer, logoSource, theme, venue, tableCount, ledPosterContent, params,
    providerOverride: sceneOverride, correctivePrefix,
    ...configs,
  })

  if (gateConfig?.enabled === false) {
    const branding = await runBrandingStage({ companyName, logoSource, zones, providerOverride: brandingOverride, cache, ...configs })
    const scene = await runSceneStage(sceneArgs(branding.buffer))
    return { branding, scene }
  }

  const label = `scene:${companyName}`
  const judge = await makeJudge(configs, label)
  const b = await gatedBranding({ companyName, logoSource, zones, brandingOverride, cache, gateConfig, judge, label }, configs)
  const s = await fidelityGate.gatedStep({
    gateConfig, kind: 'scene', label: `${label}/scene`, judge,
    generate: (_n, { correctivePrefix }) => runSceneStage(sceneArgs(b.result.buffer, correctivePrefix)),
  })
  fidelityGate.deliverUsage(b.stages, s.stages)
  return { branding: b.result, scene: s.result, qa: fidelityGate.combineQa({ branding: b.qa, scene: s.qa }) }
}

async function runSimpleFull(
  {
    companyName, logoSource, zones = 'all', theme, venue, params = {},
    brandingOverride, sceneOverride, cache = null, vehicle,
    // 2026-08-28 — optional edit-mode passthrough (see runSimpleSceneStage).
    currentSceneBuffer, editInstruction,
    // 2026-09-24 — Business Card Capture bug fix (see runSimpleAttempt's skipBranding branch).
    skipBranding = false,
    // 2026-09-30 — see the gate notes above. Defaults to engine.config.json's fidelityGate block.
    fidelityGate: gateConfig,
  },
  configs = loadEngineConfig(vehicle)
) {
  gateConfig = gateConfig || configs.engineConfig.fidelityGate
  const base = { companyName, logoSource, zones, theme, venue, params, brandingOverride, sceneOverride, cache, editInstruction, skipBranding }

  if (gateConfig?.enabled === false) {
    return runSimpleAttempt({ ...base, currentSceneBuffer }, configs)
  }

  const label = `simple-scene:${companyName}`
  const judge = await makeJudge(configs, label)

  // Edit mode gets ONE judged refinement. If the judge rejects it, the request falls through
  // to a full create-mode regeneration from the raw reference: refining a scene whose vehicle
  // is already wrong does not converge — confirmed live 2026-09-30 (Uwharrie Bank regen came
  // back as the same wrong truck). The rejected edit attempt is not billed.
  if (currentSceneBuffer) {
    const e = await fidelityGate.gatedStep({
      gateConfig: { ...gateConfig, maxAttempts: 1 }, kind: 'scene', label: `${label}/edit`, judge,
      generate: async () => {
        const { scene } = await runSimpleAttempt({ ...base, currentSceneBuffer }, configs)
        return scene
      },
    })
    if (e.qa.passed || !e.qa.judged) {
      fidelityGate.deliverUsage(e.stages)
      return { branding: null, scene: e.result, qa: fidelityGate.combineQa({ edit: e.qa }) }
    }
    console.warn(`[fidelity-gate] ${label}: edit-mode refinement rejected (${e.qa.reason}) — regenerating in create mode from the raw reference`)
    const created = await gatedCreate({ ...base, gateConfig, judge, label }, configs)
    return { ...created, qa: fidelityGate.combineQa({ edit: { ...e.qa, superseded: true }, ...created.qa.steps }) }
  }

  return gatedCreate({ ...base, gateConfig, judge, label }, configs)
}

// Create mode, two gated steps. skipBranding (Business Card Capture) has no branding pass to
// gate — the raw reference IS the branded EV — so only the scene step is judged.
async function gatedCreate(
  { companyName, logoSource, zones, theme, venue, params, brandingOverride, sceneOverride, cache, skipBranding, gateConfig, judge, label },
  configs
) {
  let branding, brandingQa, brandingStages
  if (skipBranding) {
    const rawBuffer = await fetchBuffer(configs.zonesConfig.referenceImage)
    branding = { buffer: rawBuffer, cached: false, meta: { provider: 'none', skipped: true } }
    brandingQa = undefined
    brandingStages = []
  } else {
    const b = await gatedBranding({ companyName, logoSource, zones, brandingOverride, cache, gateConfig, judge, label }, configs)
    branding = b.result
    brandingQa = b.qa
    brandingStages = b.stages
  }
  const s = await fidelityGate.gatedStep({
    gateConfig, kind: 'scene', label: `${label}/scene`, judge,
    generate: (_n, { correctivePrefix }) => runSimpleSceneStage({
      companyName: skipBranding ? 'SNACKET' : companyName,
      brandedEvBuffer: branding.buffer, logoSource, theme, venue, params,
      rawEvReferenceUrl: skipBranding ? undefined : configs.zonesConfig.referenceImage,
      providerOverride: sceneOverride, correctivePrefix,
      ...configs,
    }),
  })
  fidelityGate.deliverUsage(brandingStages, s.stages)
  return { branding, scene: s.result, qa: fidelityGate.combineQa({ branding: brandingQa, scene: s.qa }) }
}

// One ungated attempt of the simple pipeline — the exact pre-gate behavior (used when the
// gate is disabled, and for the single judged edit-mode refinement above).
async function runSimpleAttempt(
  {
    companyName, logoSource, zones, theme, venue, params, brandingOverride, sceneOverride, cache,
    currentSceneBuffer, editInstruction, skipBranding,
  },
  configs
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

  // 2026-09-24 (bug fix, Business Card Capture): that caller has no real client logo — it
  // passes SNACKET's OWN logo as logoSource while the branding prompt is told "replace
  // SNACKET's branding with {{companyName}}'s branding, using this logo exactly." That's a
  // direct contradiction (the logo it must reproduce "exactly" IS SNACKET's own), and it
  // produced a garbled hybrid mark on the EV in production: a mangled mashup of SNACKET's
  // plug icon, an attempted "{{companyName}}" text overlay, and a corrupted tagline.
  // Reported live 2026-09-24 (screenshot of a real business-card-deck). Since there's no
  // real client logo to apply, skip the fake-rebrand pass entirely — reproduce the vehicle
  // exactly as it really is (SNACKET's own real branding), no fabricated company name
  // anywhere on it. `companyName` passed to the scene prompt becomes 'SNACKET' in this
  // branch specifically so every "branded for {{companyName}}" sentence in the template
  // stays literally true — the real prospect's company name is unaffected everywhere else
  // (the deck, the emails) and never touches this generation.
  let branding
  if (skipBranding) {
    const rawBuffer = await fetchBuffer(configs.zonesConfig.referenceImage)
    branding = { buffer: rawBuffer, cached: false, meta: { provider: 'none', skipped: true } }
  } else {
    branding = await runBrandingStage({
      companyName, logoSource, zones,
      providerOverride: brandingOverride, cache,
      ...configs,
    })
  }
  const scene = await runSimpleSceneStage({
    companyName: skipBranding ? 'SNACKET' : companyName,
    brandedEvBuffer: branding.buffer, logoSource, theme, venue, params,
    // 2026-09-24 (bug fix): create mode used to give scene-stage NO independent vehicle
    // reference — only brandedEvBuffer, itself a regenerated derivative of this same file
    // that can already have drifted. Root-caused 2026-08-17 (real Stage A EV came out
    // shaped like a generic van). Same fixed ground truth edit mode already anchors on.
    // Not needed when skipBranding — brandedEvBuffer already IS the raw reference file.
    rawEvReferenceUrl: skipBranding ? undefined : configs.zonesConfig.referenceImage,
    providerOverride: sceneOverride,
    ...configs,
  })
  return { branding, scene }
}

module.exports = { loadEngineConfig, runBranding, runScene, runSimpleScene, runDecorReference, runFull, runSimpleFull, BrandedEvCache }
