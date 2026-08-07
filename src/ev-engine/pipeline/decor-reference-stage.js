'use strict'
const { sniffMime } = require('../assets')
const { buildDecorReferencePrompt } = require('../prompt-builder')
const { getProvider } = require('../providers')

/**
 * Single-stage generator — "Object with Reference Décor Generator". No branding pass:
 * objectBuffer is already a real, finished reference photo (not a white-background
 * template needing a logo swap like capabilities #1-#3's IMAGE A).
 *
 * objectBuffer/decorBuffer MUST already be resolved Buffers — this function does not
 * fetch from a URL or file path. See server.js's /generate-ev-decor-reference route for
 * the SSRF-safe resolution (fetchPublicUrlBuffer / data: URL), same pattern as every
 * other route in this file.
 */
async function runDecorReferenceStage({
  objectBuffer,
  objectSourceHint = '',
  decorBuffer,
  decorSourceHint = '',
  objectLabel,
  placementInstructions,
  scaleInstruction,
  params = {},
  engineConfig,
  decorPresetsConfig,
  decorCorrectionsConfig,
  providerOverride,
}) {
  if (!Buffer.isBuffer(objectBuffer)) {
    throw new Error('objectBuffer must be a Buffer — resolve object_source to a buffer before calling this stage')
  }
  if (!Buffer.isBuffer(decorBuffer)) {
    throw new Error('decorBuffer must be a Buffer — resolve decor_source to a buffer before calling this stage')
  }

  const stageCfg = engineConfig.stages.decorReference
  const providerName = providerOverride?.provider || stageCfg.provider
  const model = providerOverride?.model || stageCfg.model

  const { prompt, aspectRatio } = buildDecorReferencePrompt({
    objectLabel,
    placementInstructions,
    scaleInstruction,
    params,
    decorPresetsConfig,
    decorCorrectionsConfig,
  })

  const provider = getProvider(providerName)
  const { buffer, meta } = await provider.generate({
    images: [
      { buffer: objectBuffer, mimeType: sniffMime(objectBuffer, objectSourceHint), role: 'primary' },
      { buffer: decorBuffer, mimeType: sniffMime(decorBuffer, decorSourceHint), role: 'ref' },
    ],
    prompt,
    opts: {
      model,
      aspectRatio: params.aspect_ratio_override || aspectRatio,
      resolution: stageCfg.resolution,
      timeoutMs: engineConfig.limits.timeoutMs,
      label: `decor-reference:${objectLabel}`,
    },
  })

  return { buffer, meta: { ...meta, prompt, objectLabel, placementInstructions } }
}

module.exports = { runDecorReferenceStage }
