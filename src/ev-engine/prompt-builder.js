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

module.exports = { buildBrandingPrompt, buildScenePrompt, activeCorrections }
