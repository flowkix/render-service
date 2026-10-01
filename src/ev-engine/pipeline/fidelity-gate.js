'use strict'
const axios = require('axios')
const { sniffMime } = require('../assets')
const { evStructureQuestion, evStructureDiscriminators } = require('../fidelity-rubric')
const { runIsolatedUsage, replayUsage } = require('../../ai-credits/usage-recorder')

// EV fidelity gate — the runtime mechanism that stops a hallucinated vehicle from shipping.
//
// Why this exists (2026-09-30): four documented incidents (08-10, 08-17, 09-01, 09-24) of
// Gemini redrawing SNACKET's EV as a generic van/box truck were each "fixed" with prompt
// wording or an extra reference image, and each came back. Generation is probabilistic and
// the Gemini image API has no seed/temperature/mask knobs, so stability cannot come from the
// prompt alone — it has to come from VERIFYING the output and regenerating when it fails.
// Same pattern HUB's media pipeline already runs in production (hub/src/lib/media-pipeline/
// generation-qa.ts + generate-image.ts retry loop). Industry name: rejection sampling with a
// VLM judge.
//
// Where the drift happens (measured 2026-10-01, bench simpleSceneFavicon on the pre-fix
// code): the BRANDING stage itself redrew the EV as a wood-grain box truck (1 of 2 runs with
// a 128px favicon logo — the real Stage A input class), and the scene stage then faithfully
// reproduced that wrong vehicle. The judge rejects the drifted branded EV every time (clean
// white-background comparison) but can miss the same vehicle once it is embedded in a busy
// scene. Hence TWO gated steps: branding first (catch it at the source, cheap retry), then
// scene (catch what the scene pass itself redraws).
//
// Contract:
//   judgeEvFidelity() — asks the scorer model (engine.config.json `scorer`) one structure-
//     only question against the raw reference photo. Fails OPEN on judge infrastructure
//     errors (no key, network, unparseable) so a judge outage can never block generation.
//   gatedStep() — generate → judge → regenerate with a corrective prefix, up to maxAttempts.
//     Every attempt runs in an isolated usage recorder; the step returns the DELIVERED
//     attempt's paid stages for the caller to replay (John's decision: QA retries are not
//     billed to the client). If nothing passes, the best-scoring attempt is returned with
//     qa.passed=false (never a hard failure — John's decision: deliver and mark).

const JUDGE_TIMEOUT_MS = 90000
const JUDGE_MAX_RETRIES = 2

// Prepended to the generation prompt on every retry of a step.
const CORRECTIVE_PREFIX = {
  branding:
    'CRITICAL CORRECTION — a previous attempt REDREW the vehicle (wood-grain or brown body, different cab, open flatbed side, ' +
    'missing coffee-bean skirt) instead of only replacing the branding. This is a product RETOUCHING job: the vehicle in your ' +
    'output must be pixel-identical to IMAGE A in every structural respect — same white body panels, same cab, same flat roof, ' +
    'same raised gull-wing doors, same wheels, same coffee-bean pattern skirt along the base. Change ONLY the listed branding zones.',
  scene:
    'CRITICAL CORRECTION — a previous attempt rendered a DIFFERENT vehicle (generic van / box truck / wood-grain body / wrong cab ' +
    'or roof / missing coffee-bean skirt) instead of the real SNACKET EV. The vehicle in your output MUST be structurally identical ' +
    'to the SNACKET EV reference image provided: compact narrow-body micro-truck with white body panels, small cab with flat ' +
    'rectangular roof, boxy service body with two raised gull-wing doors, round center disc, small wheels, coffee-bean pattern ' +
    'skirt along the base only. Do NOT invent, resize, or substitute the vehicle.',
}

function parseVerdict(text) {
  const clean = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  const parsed = JSON.parse(clean)
  if (typeof parsed.pass !== 'boolean') throw new Error('judge response has no boolean "pass"')
  const score = Number.isFinite(parsed.structure_match) ? Math.max(1, Math.min(5, Number(parsed.structure_match))) : null
  return { pass: parsed.pass, score, reason: String(parsed.reason || '').slice(0, 300) }
}

async function judgeEvFidelity({
  imageBuffer,
  rawRefBuffer,
  engineConfig,
  apiKey = process.env.GEMINI_API_KEY,
  http = axios,
  label = 'ev',
}) {
  const failOpen = reason => {
    console.error(`[fidelity-gate] ${label}: judge unavailable (fail-open) — ${reason}`)
    return { pass: true, judged: false, score: null, reason: `judge unavailable: ${reason}` }
  }
  if (!apiKey) return failOpen('GEMINI_API_KEY not set')
  if (!imageBuffer || !rawRefBuffer) return failOpen('missing image or reference buffer')

  const prompt = [
    'You are a strict visual QA inspector for AI-generated brand-activation imagery of a specific physical vehicle.',
    'IMAGE 1 = the generated image under review. IMAGE 2 = the official reference photo of the real vehicle (ground truth).',
    '',
    `CHECK "ev_structure": ${evStructureQuestion('IMAGE 2')}`,
    evStructureDiscriminators(),
    '',
    'Also rate "structure_match" from 1 (clearly a different vehicle) to 5 (unmistakably the same vehicle).',
    'When uncertain, answer pass=false and explain.',
    'Respond ONLY with JSON: {"pass":true|false,"structure_match":<1-5>,"reason":"<one short sentence>"}',
  ].join('\n')

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: sniffMime(imageBuffer), data: imageBuffer.toString('base64') } },
        { inlineData: { mimeType: sniffMime(rawRefBuffer), data: rawRefBuffer.toString('base64') } },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  }

  const models = [engineConfig.scorer.model, ...(engineConfig.scorer.fallbackModels || [])]
  let lastErr = null
  for (const model of models) {
    for (let attempt = 1; attempt <= JUDGE_MAX_RETRIES; attempt++) {
      try {
        const resp = await http.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          body,
          { headers: { 'Content-Type': 'application/json' }, timeout: JUDGE_TIMEOUT_MS }
        )
        const text = resp.data?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text
        if (!text) throw new Error('no text in judge response')
        const verdict = parseVerdict(text)
        return { ...verdict, judged: true, model }
      } catch (e) {
        lastErr = e
        const status = e.response?.status
        if (status === 503 || status === 429 || e.code === 'ECONNRESET') { await new Promise(r => setTimeout(r, 2000 * attempt)); continue }
        break // non-retryable for this model — try the next one
      }
    }
  }
  return failOpen(lastErr ? lastErr.message : 'all judge models failed')
}

/**
 * One gated pipeline step: generate → judge → retry with a corrective prefix.
 *
 * @param {object} p
 * @param {{enabled?:boolean, maxAttempts?:number}} p.gateConfig — engine.config.json `fidelityGate`
 * @param {'branding'|'scene'} p.kind — picks the corrective prefix
 * @param {(attempt:number, ctx:{correctivePrefix:string}) => Promise<{buffer:Buffer}>} p.generate
 * @param {(buffer:Buffer) => Promise<{pass:boolean, judged:boolean, score:number|null, reason:string}>} p.judge
 * @param {string} p.label — for logs only, never user text
 * @returns {{ result, stages, qa }} — `stages` = the delivered attempt's paid usage, NOT yet
 *   replayed into the request recorder (the caller replays once it knows what it ships).
 *   `qa` = { passed, judged, attempts, reason, score }.
 */
async function gatedStep({ gateConfig, kind, generate, judge, label = kind }) {
  const maxAttempts = Math.max(1, Number(gateConfig?.maxAttempts) || 1)
  const prefix = CORRECTIVE_PREFIX[kind] || ''
  const attempts = []
  for (let n = 1; n <= maxAttempts; n++) {
    const ctx = { correctivePrefix: n > 1 ? prefix : '' }
    const { result, stages } = await runIsolatedUsage(() => generate(n, ctx))
    const verdict = await judge(result.buffer)
    attempts.push({ result, stages, verdict, n })
    const tag = verdict.judged ? (verdict.pass ? 'PASS' : 'FAIL') : 'UNJUDGED'
    console.log(`[fidelity-gate] ${label}: attempt ${n}/${maxAttempts} ${tag}${verdict.score != null ? ` score=${verdict.score}` : ''} — ${verdict.reason}`)
    if (verdict.pass) {
      return { result, stages, qa: { passed: verdict.judged, judged: verdict.judged, attempts: n, reason: verdict.reason, score: verdict.score } }
    }
  }
  // Nothing passed: ship the best-scoring attempt, flagged. Ties/no scores → the last one.
  const best = attempts.reduce((b, a) => ((a.verdict.score ?? -1) > (b.verdict.score ?? -1) ? a : b), attempts[attempts.length - 1])
  console.error(`[fidelity-gate] ${label}: all ${maxAttempts} attempts failed — delivering attempt ${best.n} flagged (score=${best.verdict.score})`)
  return { result: best.result, stages: best.stages, qa: { passed: false, judged: true, attempts: maxAttempts, reason: best.verdict.reason, score: best.verdict.score } }
}

// Folds the per-step verdicts of one request into the single `qa` object the routes return.
// `passed` is true only if every judged, still-relevant step passed; `attempts` counts every
// generation made. A step marked `superseded: true` (e.g. a rejected edit-mode refinement
// that was replaced by a create-mode regeneration) keeps its attempt count and shows up in
// `steps` for the logs, but no longer decides the verdict — the image it judged did not ship.
function combineQa(steps) {
  const present = Object.entries(steps).filter(([, q]) => q)
  if (!present.length) return undefined
  const live = present.filter(([, q]) => !q.superseded)
  const judged = live.some(([, q]) => q.judged)
  const failed = live.find(([, q]) => q.judged && !q.passed)
  const last = (live[live.length - 1] || present[present.length - 1])[1]
  return {
    passed: judged && !failed,
    judged,
    attempts: present.reduce((s, [, q]) => s + (q.attempts || 0), 0),
    reason: failed ? `${failed[0]}: ${failed[1].reason}` : last.reason,
    score: failed ? failed[1].score : last.score,
    steps: Object.fromEntries(present),
  }
}

function deliverUsage(...stageLists) {
  for (const stages of stageLists) if (stages && stages.length) replayUsage(stages)
}

module.exports = { judgeEvFidelity, gatedStep, combineQa, deliverUsage, parseVerdict, CORRECTIVE_PREFIX }
