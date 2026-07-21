'use strict'

// Structured English section prompts — proven format for Gemini image editing
// (unstructured or Spanish prompts fail; see SNACKET/docs/stage-a-ev-prompt-reference.md).

function activeCorrections(correctionsConfig, stage, presetId = null) {
  return correctionsConfig.corrections.filter(c => {
    if (!c.active) return false
    if (c.appliesTo !== stage && c.appliesTo !== 'both') return false
    if (c.presets && presetId && !c.presets.includes(presetId)) return false
    return true
  })
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

/**
 * Stage 2 — scene pass prompt.
 * IMAGE A = branded EV (stage-1 output, approved), IMAGE B = client logo (color/artwork ref).
 */
function buildScenePrompt({ presetId, params = {}, companyName, presetsConfig, correctionsConfig }) {
  const preset = presetsConfig.presets[presetId]
  if (!preset) {
    throw new Error(`Unknown preset "${presetId}". Valid: ${Object.keys(presetsConfig.presets).join(', ')}`)
  }
  const opts = presetsConfig.param_options
  const merged = { ...preset.defaults, ...params }

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
    scene: resolveOption('scene', merged.scene),
    lighting: resolveOption('lighting', merged.lighting),
    uniform: uniformText,
    operator_gender: resolveOption('operator_gender', merged.operator_gender),
    brand_ambassador_block: baBlock,
    photo_style: resolveOption('photo_style', merged.photo_style),
    crowd_size: preset.crowd_size,
    composition: preset.composition,
    photographer_detail: preset.photographer_detail || '',
    chauvet_lighting_detail: preset.chauvet_lighting_detail || '',
    vip_area_detail: preset.vip_area_detail || '',
    notes_block: merged.notes ? `NOTES: ${merged.notes}` : '',
  }

  const body = interpolate(preset.template, vars)
  const notes = correctionNotesBlock(activeCorrections(correctionsConfig, 'scene', presetId))
  const aspectRatio = resolveOption('aspect_ratio', merged.aspect_ratio)

  return { prompt: `${body}\n${notes}`.trim(), aspectRatio }
}

module.exports = { buildBrandingPrompt, buildScenePrompt, activeCorrections }
