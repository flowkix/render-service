'use strict'
const { fetchBuffer, sniffMime } = require('../assets')
const { buildScenePrompt } = require('../prompt-builder')
const { getProvider } = require('../providers')

/**
 * Stage 2 — scene pass.
 * IMAGE A = branded EV (stage-1 output, approved) — primary, per the proven
 * "approved image goes first" rule. IMAGE B = client logo (balloon/backdrop/cup colors).
 */
async function runSceneStage({
  companyName,
  brandedEvBuffer,
  logoSource,
  presetId,
  params = {},
  engineConfig,
  presetsConfig,
  correctionsConfig,
  providerOverride,
}) {
  const stageCfg = engineConfig.stages.scene
  const providerName = providerOverride?.provider || stageCfg.provider
  const model = providerOverride?.model || stageCfg.model

  const logoBuffer = await fetchBuffer(logoSource)
  const { prompt, aspectRatio } = buildScenePrompt({
    presetId,
    params,
    companyName,
    presetsConfig,
    correctionsConfig,
  })

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
      label: `scene:${presetId}:${companyName}`,
    },
  })

  return { buffer, meta: { ...meta, prompt, presetId } }
}

module.exports = { runSceneStage }
