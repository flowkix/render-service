'use strict'

// Structured English section prompts — proven format for Gemini image editing
// (unstructured or Spanish prompts fail; see SNACKET/docs/stage-a-ev-prompt-reference.md).

function activeCorrections(correctionsConfig, stage) {
  return correctionsConfig.corrections.filter(c => c.active && (c.appliesTo === stage || c.appliesTo === 'both'))
}

function correctionNotesBlock(corrections) {
  if (!corrections.length) return ''
  return ['', 'CORRECTION NOTES:', ...corrections.map(c => `- ${c.note}`)].join('\n')
}

function interpolate(template, vars) {
  const out = template.replace(/\{\{(\w+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m
  )
  const unresolved = out.match(/\{\{\w+\}\}/g)
  if (unresolved) throw new Error(`Unresolved placeholders: ${[...new Set(unresolved)].join(', ')}`)
  return out
}

/**
 * Stage 1 — branding pass prompt.
 * IMAGE A = raw EV reference (white background), IMAGE B = client logo.
 */
function buildBrandingPrompt({ companyName, zoneIds, zonesConfig, correctionsConfig }) {
  const selectedZones = zoneIds.selected.map(id => ({ id, ...zonesConfig.zones[id] }))
  const unselectedZones = zoneIds.unselected.map(id => ({ id, ...zonesConfig.zones[id] }))

  const lines = [
    `IMAGE A = ${zonesConfig.referenceDescription}. IMAGE B = the ${companyName} logo — use IMAGE B EXACTLY, unchanged.`,
    '',
    `TASK — Replace the SNACKET branding on the EV with ${companyName} branding, ONLY in the zones listed below. This is a product retouching job: everything else in IMAGE A stays pixel-identical, including the plain white studio background.`,
    '',
    'ZONES TO REBRAND:',
  ]

  selectedZones.forEach((z, i) => {
    const fragment = z.fragment.replace(/\{\{companyName\}\}/g, companyName)
    lines.push(`${i + 1}. ${z.label.toUpperCase()}: ${fragment}`, '')
  })

  if (unselectedZones.length) {
    lines.push(
      'ZONES TO LEAVE UNTOUCHED:',
      `The following areas must remain EXACTLY as in IMAGE A, INCLUDING their original SNACKET branding — do not clean, replace or modify them: ${unselectedZones.map(z => z.label).join('; ')}.`,
      ''
    )
  }

  lines.push(
    'STRICT RULES:',
    '- The EV vehicle must remain 100% identical: same color, same structure, same hardware, same open gull-wing doors, same camera angle.',
    '- Use the IMAGE B logo EXACTLY: no color modifications, no redrawing, no added text.',
    correctionNotesBlock(activeCorrections(correctionsConfig, 'branding'))
  )

  return lines.filter(l => l !== null).join('\n').trim()
}

const SCENE_DEFAULTS = {
  uniform: 'formal_chic',
  brand_ambassador: 'female',
  operator_gender: 'male',
  photo_style: 'commercial_hyperrealistic',
  aspect_ratio: '16:9',
}

function buildBarTablesLine(tableCount) {
  if (tableCount === 0) return 'No bar tables in this scene.'
  const stools = tableCount * 2
  return `${tableCount} white high bar-height cocktail table${tableCount === 1 ? '' : 's'}, each with 2 white tufted-leather backless bar stools (chrome pedestal base, square tufted seat cushion, chrome ring footrest) — ${stools} stools total.`
}

function buildFixedInfrastructureBlock(tableCount, ledPosterContent) {
  return [
    'FIXED BRAND-ACTIVATION INFRASTRUCTURE (always present, regardless of venue or theme):',
    `- LED FLOOR POSTERS: 2 free-standing LED posters on the floor, 26 inches wide by 88 inches tall, one on each side of the EV, flanking it symmetrically. Content displayed: ${ledPosterContent}.`,
    '- BALLOON ARCH: over the EV, colors exactly matching the client logo artwork (IMAGE B) — no interpretation, exact color match.',
    `- BAR TABLES: ${buildBarTablesLine(tableCount)}`,
    "- STEP-AND-REPEAT BACKDROP: a large printed backdrop panel entirely covered by the client's logo artwork graphic repeated prominently (repeat the graphic, never any text label). A red carpet is rolled out directly in front of the backdrop ONLY — it does not extend elsewhere in the scene.",
    "- SECOND CARPET: a second carpet, same material and color as the step-and-repeat's red carpet, placed in front of the EV — in the area where the EV Operator, Brand Ambassador, and guests are positioned.",
    '- FLOOR LIGHTING: 4 Chauvet Freedom Par Q9 Wireless, Battery-Operated LED fixtures. All 4 sit directly on the floor — never mounted on a tripod or stand — each projecting its colored light upward from the floor. Exact placement: 2 fixtures at the step-and-repeat backdrop (one at each end), and 2 fixtures at the EV (one at each front corner of the vehicle).',
    '- PHOTOGRAPHER: a professional photographer (holding a DSLR with telephoto lens) actively photographing guests, either near the EV or at the step-and-repeat.',
  ].join('\n')
}

/**
 * Stage 2 — scene pass prompt.
 * IMAGE A = branded EV (stage-1 output, approved), IMAGE B = client logo (color/artwork reference).
 *
 * v2: no more presetId/named presets — every scene has the same fixed infrastructure
 * (see buildFixedInfrastructureBlock); theme and venue are free-text per call; tableCount
 * and ledPosterContent are the only structured overrides (never parsed out of free text).
 */
function buildScenePrompt({
  theme,
  venue,
  companyName,
  tableCount,
  ledPosterContent,
  params = {},
  presetsConfig,
  correctionsConfig,
}) {
  if (!theme || !String(theme).trim()) throw new Error('theme is required')
  if (!venue || !String(venue).trim()) throw new Error('venue is required')

  const resolvedTableCount = Number.isInteger(tableCount) ? tableCount : 2
  const resolvedLedContent = ledPosterContent && String(ledPosterContent).trim()
    ? String(ledPosterContent).trim()
    : `the ${companyName} logo`

  const opts = presetsConfig.param_options
  const merged = { ...SCENE_DEFAULTS, ...params }

  const resolveOption = (group, key) => {
    if (!Object.prototype.hasOwnProperty.call(opts[group], key)) {
      throw new Error(`Unknown ${group} "${key}". Valid: ${Object.keys(opts[group]).join(', ')}`)
    }
    return opts[group][key]
  }

  const uniformText = resolveOption('uniform', merged.uniform)
  const baBlock = resolveOption('brand_ambassador', merged.brand_ambassador)
    .replace(/\{\{uniform\}\}/g, uniformText)

  const vars = {
    companyName,
    GLOBAL_RULES: presetsConfig.global_rules_text.replace(/\{\{companyName\}\}/g, companyName),
    venue: String(venue).trim(),
    theme: String(theme).trim(),
    uniform: uniformText,
    operator_gender: resolveOption('operator_gender', merged.operator_gender),
    brand_ambassador_block: baBlock,
    photo_style: resolveOption('photo_style', merged.photo_style),
    FIXED_INFRASTRUCTURE: buildFixedInfrastructureBlock(resolvedTableCount, resolvedLedContent),
    notes_block: merged.notes ? `NOTES: ${merged.notes}` : '',
  }

  const body = interpolate(presetsConfig.template, vars)
  const notes = correctionNotesBlock(activeCorrections(correctionsConfig, 'scene'))
  const aspectRatio = resolveOption('aspect_ratio', merged.aspect_ratio)

  return { prompt: `${body}\n${notes}`.trim(), aspectRatio }
}

const SIMPLE_SCENE_DEFAULTS = {
  uniform: 'formal_chic',
  brand_ambassador: 'female',
  operator_gender: 'male',
  photo_style: 'commercial_hyperrealistic',
  aspect_ratio: '16:9',
}

/**
 * Stage 2 (simple variant) prompt — "Object with Logo in Simple Scene Generator".
 * No fixed brand-activation infrastructure (contrast with buildScenePrompt above).
 * Reads `presetsConfig.param_options` (the PRODUCTION param table) read-only, for staff
 * uniform/ambassador/photo-style text — deliberate: staff must look identical to the
 * staged-scene capability. `simplePresetsConfig`/`simpleCorrectionsConfig` are this
 * capability's own, independently maintained template + corrections.
 */
function buildSimpleScenePrompt({
  theme,
  venue,
  companyName,
  params = {},
  presetsConfig,
  simplePresetsConfig,
  simpleCorrectionsConfig,
}) {
  if (!theme || !String(theme).trim()) throw new Error('theme is required')
  if (!venue || !String(venue).trim()) throw new Error('venue is required')

  const opts = presetsConfig.param_options
  const merged = { ...SIMPLE_SCENE_DEFAULTS, ...params }

  const resolveOption = (group, key) => {
    if (!Object.prototype.hasOwnProperty.call(opts[group], key)) {
      throw new Error(`Unknown ${group} "${key}". Valid: ${Object.keys(opts[group]).join(', ')}`)
    }
    return opts[group][key]
  }

  const uniformText = resolveOption('uniform', merged.uniform)
  const baBlock = resolveOption('brand_ambassador', merged.brand_ambassador)
    .replace(/\{\{uniform\}\}/g, uniformText)

  const vars = {
    companyName,
    GLOBAL_RULES: simplePresetsConfig.global_rules_text.replace(/\{\{companyName\}\}/g, companyName),
    venue: String(venue).trim(),
    theme: String(theme).trim(),
    uniform: uniformText,
    operator_gender: resolveOption('operator_gender', merged.operator_gender),
    brand_ambassador_block: baBlock,
    photo_style: resolveOption('photo_style', merged.photo_style),
    notes_block: merged.notes ? `NOTES: ${merged.notes}` : '',
  }

  const body = interpolate(simplePresetsConfig.template, vars)
  const notes = correctionNotesBlock(activeCorrections(simpleCorrectionsConfig, 'scene'))
  const aspectRatio = resolveOption('aspect_ratio', merged.aspect_ratio)

  return { prompt: `${body}\n${notes}`.trim(), aspectRatio }
}

/**
 * Stage 2 (simple variant) — EDIT-MODE prompt, used by the "Regenerate" control on
 * Stage A's deck-review page (hub/.../stage-a/review/[deck_id]) instead of
 * buildSimpleScenePrompt above. IMAGE A = the CURRENT scene photo (primary
 * reference — refine it, don't reinvent it). IMAGE B = the engine's fixed, raw
 * (unbranded) SNACKET EV reference photo — the SAME source file the branding stage
 * itself starts from, never AI-regenerated — used ONLY as a structure/geometry
 * anchor. IMAGE C = client logo, optional, for branding fidelity.
 *
 * This exists because create-mode (buildSimpleScenePrompt) asks Gemini to invent
 * a whole scene around a reference image, which occasionally drifts on vehicle
 * geometry ("AI hallucinated a different EV" — 2026-08-28). Edit mode anchors on
 * the actual previous output and asks for a narrow, scoped change (or a
 * quality-only refinement when editInstruction is empty) — same technique already
 * proven in hub's Stage B `ai-regen` route (see hub/src/app/api/proposals/
 * [review_token]/ai-regen/route.ts).
 *
 * 2026-09-01 (bug fix): IMAGE B used to be a freshly Gemini-regenerated "branded EV"
 * (index.js's own branding-stage output for this call) instead of the fixed raw
 * reference. That made the anchor itself unreliable — a bad branding-stage run
 * silently corrupted the "ground truth" edit mode was told to correct toward.
 * Confirmed live: an explicit correction instruction to fix the vehicle back to
 * SNACKET's real design produced a DIFFERENT wrong vehicle instead, because that
 * call's branding-stage output had drifted too. The raw reference never changes,
 * so it can't drift — same reasoning as Stage B's ai-regen route, which anchors on
 * a fixed reference file for exactly this reason.
 */
function buildSimpleSceneEditPrompt({ editInstruction, simpleCorrectionsConfig }) {
  const instructionBlock = editInstruction && String(editInstruction).trim()
    ? `Apply this change: "${String(editInstruction).trim()}"\n\nOtherwise change nothing else — same people, same backdrop, same lighting, same composition.`
    : 'No specific change requested — produce a refined, higher-quality version of IMAGE A: same scene, same people, same composition, same backdrop. Only improve sharpness, lighting quality, and photorealistic rendering depth.'

  const body = [
    'IMAGE A = the CURRENT scene photo (primary reference) — your output must look like a refined version of THIS exact image, not a new scene.',
    'IMAGE B = the OFFICIAL RAW SNACKET EV REFERENCE (plain/unbranded) — use this ONLY to verify and correct the vehicle\'s physical STRUCTURE in IMAGE A: overall body shape, roof (flat and rectangular, never domed/curved/angled), gull-wing door geometry, wheels, cab, and hardware. If the vehicle in IMAGE A has drifted from this structure in any way, correct it to match IMAGE B\'s structure as part of this edit.',
    'IMPORTANT — branding is NOT part of that correction: IMAGE B shows SNACKET\'s own default markings, not the client\'s. The client\'s branding/logos already correctly shown in IMAGE A (or provided fresh via IMAGE C, if present) must be preserved exactly — never replace them with anything from IMAGE B, and never leave the vehicle unbranded.',
    '',
    'TASK:',
    instructionBlock,
    '',
    'STRICT RULES:',
    '- Do not redesign, recreate, or "improve" anything beyond what is explicitly requested above and the structure correction described for IMAGE B.',
    '- Preserve the photorealistic commercial quality and aspect ratio of IMAGE A.',
  ].join('\n')

  const notes = correctionNotesBlock(activeCorrections(simpleCorrectionsConfig, 'scene'))
  return { prompt: `${body}\n${notes}`.trim() }
}

const DECOR_REFERENCE_DEFAULTS = {
  aspect_ratio: '4:3',
}

/**
 * Single-stage prompt — "Object with Reference Décor Generator". No branding/logo-swap
 * pass: IMAGE A is already a real, finished object reference photo (e.g. a cataloged
 * SNACKET Product Reference photo), IMAGE B is a décor/design reference photo. Unlike
 * buildScenePrompt/buildSimpleScenePrompt, there is no companyName/theme/venue — only
 * a free-text placementInstructions (required) and an optional scaleInstruction.
 */
function buildDecorReferencePrompt({
  objectLabel,
  placementInstructions,
  scaleInstruction,
  params = {},
  decorPresetsConfig,
  decorCorrectionsConfig,
}) {
  if (!objectLabel || !String(objectLabel).trim()) throw new Error('objectLabel is required')
  if (!placementInstructions || !String(placementInstructions).trim()) throw new Error('placementInstructions is required')

  const merged = { ...DECOR_REFERENCE_DEFAULTS, ...params }

  const vars = {
    objectLabel: String(objectLabel).trim(),
    GLOBAL_RULES: decorPresetsConfig.global_rules_text,
    placementInstructions: String(placementInstructions).trim(),
    scale_block: scaleInstruction && String(scaleInstruction).trim()
      ? `SCALE — IMPORTANT: ${String(scaleInstruction).trim()}.`
      : '',
    notes_block: merged.notes ? `NOTES: ${merged.notes}` : '',
  }

  const body = interpolate(decorPresetsConfig.template, vars)
  const notes = correctionNotesBlock(activeCorrections(decorCorrectionsConfig, 'decor'))
  const aspectRatio = merged.aspect_ratio_override || merged.aspect_ratio

  return { prompt: `${body}\n${notes}`.trim(), aspectRatio }
}

module.exports = { buildBrandingPrompt, buildScenePrompt, buildSimpleScenePrompt, buildSimpleSceneEditPrompt, buildDecorReferencePrompt, activeCorrections }
