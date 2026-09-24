'use strict'
const { fetchBuffer, sniffMime } = require('../assets')
const { buildSimpleScenePrompt, buildSimpleSceneEditPrompt } = require('../prompt-builder')
const { getProvider } = require('../providers')

const EDIT_MODE_ASPECT_RATIO = '16:9' // matches SIMPLE_SCENE_DEFAULTS.aspect_ratio — the
// scene being edited was already generated at this ratio; edit mode has no theme/venue-
// driven param_options resolution of its own (see buildSimpleSceneEditPrompt).

/**
 * Stage 2 (simple variant) — scene pass for "Object with Logo in Simple Scene Generator".
 * Same image-role pattern as pipeline/scene-stage.js (branded EV primary, logo reference),
 * but the prompt has no fixed brand-activation infrastructure. Reuses the existing `scene`
 * stage's provider/model config (engineConfig.stages.scene) — same generation task shape,
 * no separate stage config needed.
 *
 * `currentSceneBuffer` (optional) switches this into EDIT MODE — used by Stage A's deck-
 * review "Regenerate" control (2026-08-28) to refine the existing scene instead of
 * generating a brand-new one from scratch, which is what was causing occasional EV-vehicle
 * hallucination. When present, `theme`/`venue` are still accepted (callers may keep sending
 * the deck's original brief) but are unused — see buildSimpleSceneEditPrompt. `brandedEvBuffer`
 * is create-mode-only; edit mode instead takes `rawEvReferenceUrl` (2026-09-01 bug fix — see
 * index.js's runSimpleFull for why a freshly-regenerated branded EV was the wrong anchor).
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
  currentSceneBuffer,
  editInstruction,
  rawEvReferenceUrl,
}) {
  const stageCfg = engineConfig.stages.scene
  const providerName = providerOverride?.provider || stageCfg.provider
  const model = providerOverride?.model || stageCfg.model

  const logoBuffer = await fetchBuffer(logoSource)
  const isEditMode = !!currentSceneBuffer
  // 2026-09-24: rawEvReferenceUrl is now also supplied in create mode (see index.js) — same
  // fixed, never-regenerated ground-truth photo edit mode already anchors on, added here to
  // close the gap root-caused 2026-08-17: create mode's only vehicle reference used to be
  // brandedEvBuffer (stage 1's own regenerated output), which can drift before scene-stage
  // even runs.
  const rawEvReferenceBuffer = rawEvReferenceUrl ? await fetchBuffer(rawEvReferenceUrl) : null

  const { prompt, aspectRatio } = isEditMode
    ? { ...buildSimpleSceneEditPrompt({ editInstruction, simpleCorrectionsConfig }), aspectRatio: EDIT_MODE_ASPECT_RATIO }
    : buildSimpleScenePrompt({
        theme,
        venue,
        params,
        companyName,
        presetsConfig,
        simplePresetsConfig,
        simpleCorrectionsConfig,
        includeRawReference: !!rawEvReferenceBuffer,
      })

  const images = isEditMode
    ? [
        { buffer: currentSceneBuffer, mimeType: sniffMime(currentSceneBuffer), role: 'primary' },
        { buffer: rawEvReferenceBuffer, mimeType: sniffMime(rawEvReferenceBuffer, rawEvReferenceUrl), role: 'ref' },
        { buffer: logoBuffer, mimeType: sniffMime(logoBuffer, String(logoSource)), role: 'ref' },
      ]
    : [
        { buffer: brandedEvBuffer, mimeType: sniffMime(brandedEvBuffer), role: 'primary' },
        ...(rawEvReferenceBuffer ? [{ buffer: rawEvReferenceBuffer, mimeType: sniffMime(rawEvReferenceBuffer, rawEvReferenceUrl), role: 'ref' }] : []),
        { buffer: logoBuffer, mimeType: sniffMime(logoBuffer, String(logoSource)), role: 'ref' },
      ]

  const provider = getProvider(providerName)
  const { buffer, meta } = await provider.generate({
    images,
    prompt,
    opts: {
      model,
      aspectRatio: params.aspect_ratio_override || aspectRatio,
      resolution: stageCfg.resolution,
      timeoutMs: engineConfig.limits.timeoutMs,
      label: isEditMode ? `simple-scene-edit:${companyName}` : `simple-scene:${venue}:${companyName}`,
    },
  })

  return { buffer, meta: { ...meta, prompt, theme, venue, editMode: isEditMode } }
}

module.exports = { runSimpleSceneStage }
