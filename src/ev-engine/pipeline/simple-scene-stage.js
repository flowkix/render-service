'use strict'
const { fetchBuffer, sniffMime } = require('../assets')
const { buildSimpleScenePrompt } = require('../prompt-builder')
const { getProvider } = require('../providers')

/**
 * Stage 2 (simple variant) — scene pass for "Object with Logo in Simple Scene Generator".
 * Same image-role pattern as pipeline/scene-stage.js (branded EV primary, logo reference),
 * but the prompt has no fixed brand-activation infrastructure. Reuses the existing `scene`
 * stage's provider/model config (engineConfig.stages.scene) — same generation task shape,
 * no separate stage config needed.
 */
async function runSimpleSceneStage({
  companyName,
  brandedEvBuffer,
  logoSource,
  theme,
  venue,
  params = {},
  engineConfig,
  presetsConfig,
  simplePresetsConfig,
  simpleCorrectionsConfig,
  providerOverride,
}) {
  const stageCfg = engineConfig.stages.scene
  const providerName = providerOverride?.provider || stageCfg.provider
  const model = providerOverride?.model || stageCfg.model

  const logoBuffer = await fetchBuffer(logoSource)
  const { prompt, aspectRatio } = buildSimpleScenePrompt({
    theme,
    venue,
    params,
    companyName,
    presetsConfig,
    simplePresetsConfig,
    simpleCorrectionsConfig,
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
      label: `simple-scene:${venue}:${companyName}`,
    },
  })

  return { buffer, meta: { ...meta, prompt, theme, venue } }
}

module.exports = { runSimpleSceneStage }
