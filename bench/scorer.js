'use strict'
// Auto-QA scorer: vision LLM applies the rubric to each generated image.
// Advisory only — John's eyes on the contact sheet are the final judge.
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const sharp = require('sharp')
const { fetchBuffer, sniffMime } = require('../src/ev-engine/assets')

// VLM scorers systematically miscount the three tap handles at full-image scale
// (validated 2026-07-20: two rubric rewordings failed; a native-res crop shows all
// three taps present while the scorer reports "center tap missing"). For branding
// cases we hand the scorer a zoomed crop of the tap cluster as an extra image.
const TAP_REGION = { left: 0.30, top: 0.32, width: 0.35, height: 0.38 }

async function cropTapRegion(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata()
  return sharp(imageBuffer)
    .extract({
      left: Math.round(meta.width * TAP_REGION.left),
      top: Math.round(meta.height * TAP_REGION.top),
      width: Math.round(meta.width * TAP_REGION.width),
      height: Math.round(meta.height * TAP_REGION.height),
    })
    .png()
    .toBuffer()
}

const HARD_GATES = {
  branding: ['ev_fidelity', 'faucets_present'],
  scene: ['ev_fidelity', 'staff_outside_ev'],
}

function rubricFor(record) {
  if (record.stage === 'branding') {
    const checks = [
      { id: 'ev_fidelity', q: 'Is the vehicle structurally identical to the reference EV (IMAGE 3): same micro-truck body, flat roof, raised gull-wing doors, wheels, cab — not a different vehicle?' },
      { id: 'faucets_present', q: 'Use IMAGE 4 (zoomed crop of the tap area of IMAGE 1) for this check. In IMAGE 3 exactly three faucet taps (dark wood-grip handles on chrome faucet bodies) are mounted in front of the center disc. Are all three taps present in IMAGE 4? A handle may overlap the disc artwork behind it — inspect each position before declaring one missing. Judge handle material against IMAGE 3, not against an idealized chrome tap.' },
      { id: 'logo_present', q: 'Does the client logo (IMAGE 2) appear on the EV in the rebranded zones?' },
      { id: 'logo_legible', q: 'Is the client logo crisp and legible everywhere it appears (not a smudge or distorted)?' },
      { id: 'logo_colors_unaltered', q: 'Are the client logo colors faithful to IMAGE 2 (no recoloring or reinterpretation)?' },
      { id: 'no_leftover_snacket', q: 'Are the rebranded zones fully free of SNACKET text/icons (no remnants mixed with the new logo)?' },
      { id: 'background_neutral', q: 'Is the background still a plain white/neutral studio background with no scene, people or environment added?' },
    ]
    if (record.zoneSetName && record.zoneSetName !== 'all') {
      checks.push({ id: 'unselected_zones_untouched', q: 'Do the NON-rebranded areas still show the original SNACKET branding untouched (this was a partial rebrand)?' })
    }
    return checks
  }
  const checks = [
    { id: 'ev_fidelity', q: 'Is the vehicle structurally identical to the branded EV (IMAGE 3): same micro-truck body, raised gull-wing doors, wheels, cab, and same client branding — not a different vehicle?' },
    { id: 'staff_outside_ev', q: 'Are ALL staff members (EV Operator, Brand Ambassador) standing on the ground OUTSIDE the vehicle (nobody inside the EV, behind a service counter, or framed within the service opening)?' },
    { id: 'staff_guests_present', q: 'Are event guests/attendees visible somewhere in the scene near the EV activation area (staff are not shown completely isolated with zero guests anywhere in the frame)? Pose and the specific form of interaction between staff and guests do NOT matter for this check — any pose is acceptable.' },
    { id: 'led_posters_present', q: 'Are there 2 free-standing LED floor posters, one on each side of the EV?' },
    { id: 'balloon_arch_present', q: 'Is there a balloon arch over or near the EV?' },
    { id: 'balloon_colors_match_logo', q: 'Do the balloon arch colors match the client logo colors (IMAGE 2)?' },
    { id: 'backdrop_with_logo', q: 'Is there a printed step-and-repeat backdrop displaying the client logo?' },
    { id: 'red_carpet_at_backdrop', q: 'Is there a red carpet in front of the step-and-repeat backdrop?' },
    { id: 'chauvet_fixtures_floor_mounted', q: 'Are 4 LED par light fixtures visible sitting directly on the floor (not on tripods/stands) projecting colored light upward, roughly 2 near the backdrop and 2 near the EV?' },
    { id: 'bar_tables_present', q: 'Are white high bar-height cocktail tables with tufted-leather bar stools visible in the scene?' },
    { id: 'ev_front_carpet_present', q: 'Is there a carpet (same material/color as the step-and-repeat carpet) placed in front of the EV, separate from the backdrop carpet?' },
    { id: 'photographer_present', q: 'Is a professional photographer visible photographing guests near the EV or at the step-and-repeat?' },
    { id: 'no_watermarks', q: 'Is the image free of text overlays, borders and watermarks?' },
  ]
  return checks
}

async function scoreImage({ apiKey, model, imageBuffer, logoBuffer, refBuffer, record }) {
  const checks = rubricFor(record)
  const isBranding = record.stage === 'branding'
  const prompt = [
    `You are a strict visual QA inspector for AI-generated brand-activation imagery.`,
    `IMAGE 1 = the generated image under review. IMAGE 2 = the client logo (ground truth). IMAGE 3 = the reference vehicle (ground truth).` +
      (isBranding ? ` IMAGE 4 = a zoomed crop of the faucet-tap area of IMAGE 1 (use it for the "faucets_present" check).` : ''),
    `Answer every check strictly. When uncertain, answer pass=false and explain.`,
    ``,
    `CHECKS:`,
    ...checks.map(c => `- "${c.id}": ${c.q}`),
    ``,
    `Also rate "photorealism" from 1 (obviously fake) to 5 (indistinguishable from a photo).`,
    ``,
    `Respond ONLY with JSON: {"checks":{"<id>":{"pass":true|false,"note":"<short reason>"}},"photorealism":<1-5>}`,
  ].join('\n')

  const parts = [
    { text: prompt },
    { inlineData: { mimeType: sniffMime(imageBuffer), data: imageBuffer.toString('base64') } },
    { inlineData: { mimeType: sniffMime(logoBuffer), data: logoBuffer.toString('base64') } },
    { inlineData: { mimeType: sniffMime(refBuffer), data: refBuffer.toString('base64') } },
  ]
  if (isBranding) {
    const tapCrop = await cropTapRegion(imageBuffer)
    parts.push({ inlineData: { mimeType: 'image/png', data: tapCrop.toString('base64') } })
  }

  const models = [model.primary, ...model.fallbacks]
  let resp = null
  let lastErr = null
  for (const m of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        resp = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
          { contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } },
          { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
        )
        break
      } catch (e) {
        lastErr = e
        const status = e.response?.status
        if (status === 503 || status === 429) await new Promise(r => setTimeout(r, 3000 * attempt))
        else break // non-retryable for this model — try next model
      }
    }
    if (resp) break
  }
  if (!resp) throw lastErr || new Error('scorer: all models failed')
  const text = resp.data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text
  if (!text) throw new Error('scorer: no text in response')
  // Claude/Gemini can wrap JSON in markdown fences despite responseMimeType — strip defensively
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  const parsed = JSON.parse(clean)

  const gateIds = HARD_GATES[record.stage]
  const applicable = checks.map(c => c.id)
  const results = {}
  for (const id of applicable) {
    results[id] = parsed.checks?.[id] ?? { pass: false, note: 'scorer omitted this check' }
  }
  const hardPass = gateIds.every(id => results[id]?.pass)
  const soft = applicable.filter(id => !gateIds.includes(id))
  const softPassRate = soft.length ? soft.filter(id => results[id]?.pass).length / soft.length : 1
  return {
    checks: results,
    photorealism: parsed.photorealism ?? null,
    hardPass,
    softPassRate: +softPassRate.toFixed(2),
    verdict: hardPass && softPassRate >= 0.9 ? 'pass' : 'fail',
  }
}

async function scoreRun(runDir, configs) {
  const runFile = path.join(runDir, 'run.json')
  const run = JSON.parse(fs.readFileSync(runFile, 'utf8'))
  const qaDir = path.join(runDir, 'qa')
  fs.mkdirSync(qaDir, { recursive: true })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY env var not set (scorer)')
  const model = {
    primary: configs.engineConfig.scorer.model,
    fallbacks: configs.engineConfig.scorer.fallbackModels || [],
  }
  const refBuffer = await fetchBuffer(configs.zonesConfig.referenceImage)
  const logoBuffers = new Map()

  let scored = 0
  for (const record of run.cases) {
    if (record.error || !record.imagePath) continue
    const qaFile = path.join(qaDir, `${record.caseId}.json`)
    if (fs.existsSync(qaFile)) {
      const prev = JSON.parse(fs.readFileSync(qaFile, 'utf8'))
      if (!prev.error) { scored++; continue } // valid score cached; errored ones re-score
    }
    try {
      if (!logoBuffers.has(record.logoId)) {
        const { logoById } = require('./matrix')
        logoBuffers.set(record.logoId, await fetchBuffer(logoById(record.logoId).absPath))
      }
      const imageBuffer = fs.readFileSync(path.join(runDir, record.imagePath))
      // Scene cases compare against the branded EV (stage-1 output), not the raw SNACKET reference
      let caseRef = refBuffer
      if (record.stage === 'scene' && record.brandedCacheKey) {
        const brandedFile = path.join(runDir, 'branded-cache', `${record.brandedCacheKey}.png`)
        if (fs.existsSync(brandedFile)) caseRef = fs.readFileSync(brandedFile)
      }
      const qa = await scoreImage({ apiKey, model, imageBuffer, logoBuffer: logoBuffers.get(record.logoId), refBuffer: caseRef, record })
      fs.writeFileSync(qaFile, JSON.stringify(qa, null, 2))
      scored++
      console.log(`  qa ${record.caseId}: ${qa.verdict} (soft ${(qa.softPassRate * 100).toFixed(0)}%, realism ${qa.photorealism})`)
    } catch (e) {
      fs.writeFileSync(qaFile, JSON.stringify({ error: e.message }, null, 2))
      console.log(`  qa ${record.caseId}: SCORER ERROR — ${e.message.slice(0, 150)}`)
    }
  }
  console.log(`scored ${scored}/${run.cases.filter(c => !c.error).length}`)
}

module.exports = { scoreRun, rubricFor, HARD_GATES }
