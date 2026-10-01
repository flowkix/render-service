'use strict'
const { fetchBuffer, sniffMime } = require('../assets')
const { buildScenePrompt } = require('../prompt-builder')
const { getProvider } = require('../providers')

/**
 * Stage 2 — scene pass.
 * IMAGE A = branded EV (stage-1 output, approved) — primary, per the proven
 * "approved image goes first" rule. IMAGE B = client logo (balloon/backdrop/cup colors).
 *
 * v2: theme/venue (free text) replace presetId; tableCount/ledPosterContent are the
 * only structured overrides of the always-on fixed infrastructure.
 */
async function runSceneStage({
  companyName,
  brandedEvBuffer,
  logoSource,
  theme,
  venue,
  tableCount,
  ledPosterContent,
  params = {},
  engineConfig,
  presetsConfig,
  correctionsConfig,
  providerOverride,
  // 2026-09-30: set by the fidelity gate on retries (pipeline/fidelity-gate.js) — prepended
  // verbatim to the prompt. Empty/undefined = byte-identical prompt to before the gate existed.
  correctivePrefix = '',
}) {
  const stageCfg = engineConfig.stages.scene
  const providerName = providerOverride?.provider || stageCfg.provider
  const model = providerOverride?.model || stageCfg.model

  const logoBuffer = await fetchBuffer(logoSource)
  const { prompt: basePrompt, aspectRatio } = buildScenePrompt({
    theme,
    venue,
    tableCount,
    ledPosterContent,
    params,
    companyName,
    presetsConfig,
    correctionsConfig,
  })
  const prompt = correctivePrefix ? `${correctivePrefix}\n\n${basePrompt}` : basePrompt

  const provider = getProvider(providerName)
  const { buffer, meta } = await provider.generate({
    images: [
      { buffer: brandedEvBuffer, mimeType: sniffMime(brandedEvBuffer), role: 'primary' },
      { buffer: logoBuffer, mimeType: sniffMime(logoBuffer, String(logoSource)), role: 'ref' },
    ],
    prompt,
    opts: {
      model,
      aspectRatio: params.aspect_ratio_override || aspectRatio,
      resolution: stageCfg.resolution,
      timeoutMs: engineConfig.limits.timeoutMs,
      label: `scene:${venue}:${companyName}`,
    },
  })

  return { buffer, meta: { ...meta, prompt, theme, venue } }
}

module.exports = { runSceneStage }
