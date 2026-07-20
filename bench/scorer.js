'use strict'
// Auto-QA scorer: vision LLM applies the rubric to each generated image.
// Advisory only — John's eyes on the contact sheet are the final judge.
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const { fetchBuffer, sniffMime } = require('../src/ev-engine/assets')

const HARD_GATES = {
  branding: ['ev_fidelity', 'faucets_present'],
  scene: ['ev_fidelity', 'staff_outside_ev'],
}

function rubricFor(record) {
  if (record.stage === 'branding') {
    const checks = [
      { id: 'ev_fidelity', q: 'Is the vehicle structurally identical to the reference EV (IMAGE 3): same micro-truck body, flat roof, raised gull-wing doors, wheels, cab — not a different vehicle?' },
      { id: 'faucets_present', q: 'Are the three chrome faucet tap handles clearly visible in front of the center disc?' },
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
    { id: 'staff_outside_ev', q: 'Are ALL staff members standing on the ground OUTSIDE the vehicle (nobody inside the EV, behind the counter, or framed within the service opening)?' },
    { id: 'flyer_interaction', q: 'Is at least one guest receiving a printed flyer from a staff member?' },
    { id: 'beverage_pastry_interaction', q: 'Is at least one guest at the service window receiving a beverage cup and a pastry from the operator?' },
    { id: 'balloon_arch_present', q: 'Is there a balloon arch over or near the EV?' },
    { id: 'balloon_colors_match_logo', q: 'Do the balloon arch colors match the client logo colors (IMAGE 2)?' },
    { id: 'no_watermarks', q: 'Is the image free of text overlays, borders and watermarks?' },
  ]
  if (record.presetId === 'P2' || record.presetId === 'P3') {
    checks.push(
      { id: 'backdrop_with_logo', q: 'Is there a printed step-and-repeat backdrop displaying the client logo?' },
      { id: 'red_carpet', q: 'Is there a red carpet in front of the backdrop?' },
      { id: 'chauvet_fixtures', q: 'Are LED par light fixtures visible on the floor projecting colored light onto the backdrop?' },
      { id: 'photographer_present', q: 'Is a professional photographer photographing posing guests?' }
    )
  }
  if (record.presetId === 'P3') {
    checks.push({ id: 'vip_tables_stools', q: 'Is there a VIP area with cocktail tables (white covers) and white tufted bar stools with chrome bases?' })
  }
  return checks
}

async function scoreImage({ apiKey, model, imageBuffer, logoBuffer, refBuffer, record }) {
  const checks = rubricFor(record)
  const prompt = [
    `You are a strict visual QA inspector for AI-generated brand-activation imagery.`,
    `IMAGE 1 = the generated image under review. IMAGE 2 = the client logo (ground truth). IMAGE 3 = the reference vehicle (ground truth).`,
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
