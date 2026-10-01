'use strict'
const axios = require('axios')
const { sniffMime } = require('../assets')
const { evStructureQuestion } = require('../fidelity-rubric')
const { runIsolatedUsage, replayUsage } = require('../../ai-credits/usage-recorder')

// EV fidelity gate — the runtime mechanism that stops a hallucinated vehicle from shipping.
//
// Why this exists (2026-09-30): four documented incidents (08-10, 08-17, 09-01, 09-24) of
// Gemini redrawing SNACKET's EV as a generic van/box truck were each "fixed" with prompt
// wording or an extra reference image, and each came back. Generation is probabilistic and
// the Gemini image API has no seed/temperature/mask knobs, so stability cannot come from the
// prompt alone — it has to come from VERIFYING the output and regenerating when it fails.
// Same pattern HUB's media pipeline already runs in production (hub/src/lib/media-pipeline/
// generation-qa.ts + generate-image.ts retry loop), which caught the one structural
// distortion in a 43-image audit. Industry name: rejection sampling with a VLM judge.
//
// Contract:
//   judgeEvFidelity() — asks the scorer model (engine.config.json `scorer`) one structure-
//     only question against the raw reference photo. Fails OPEN on judge infrastructure
//     errors (no key, network, unparseable) so a judge outage can never block generation.
//   withFidelityGate() — generate → judge → regenerate with a corrective prefix, up to
//     maxAttempts. Every attempt runs in an isolated usage recorder; only the DELIVERED
//     attempt's paid stages are replayed into the request's recorder (John's decision:
//     QA retries are not billed to the client). If nothing passes, the best-scoring attempt
//     ships with qa.passed=false so the caller can flag it (never a hard failure — John's
//     decision: deliver and mark).

const JUDGE_TIMEOUT_MS = 90000
const JUDGE_MAX_RETRIES = 2

// Prepended to the scene prompt on every retry. Same wording family as HUB's
// QA_CORRECTIONS.structure_mismatch (generate-image.ts), tuned for this engine's vocabulary.
const CORRECTIVE_PREFIX =
  'CRITICAL CORRECTION — a previous attempt rendered a DIFFERENT vehicle (generic van / box truck / wrong cab or roof / ' +
  'missing coffee-bean skirt) instead of the real SNACKET EV. The vehicle in your output MUST be structurally identical to ' +
  'the SNACKET EV reference image provided: compact narrow-body micro-truck, small cab with flat rectangular roof, boxy service ' +
  'body with two raised gull-wing doors, round center disc, small wheels, coffee-bean pattern skirt along the base. Do NOT ' +
  'invent, resize, or substitute the vehicle.'

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
        if (status === 503 || status === 429) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue }
        break // non-retryable for this model — try the next one
      }
    }
  }
  return failOpen(lastErr ? lastErr.message : 'all judge models failed')
}

/**
 * Generate-judge-retry loop.
 *
 * @param {object} p
 * @param {{enabled?:boolean, maxAttempts?:number}} p.gateConfig — engine.config.json `fidelityGate`
 * @param {(attempt:number, ctx:{correctivePrefix:string, forceCreate:boolean}) => Promise<object>} p.generate
 *        Runs one full attempt and resolves to the pipeline result; must expose the image to judge
 *        at `result.scene.buffer`. `forceCreate` is true on every retry (an edit-mode refinement
 *        of a wrong vehicle does not converge — confirmed live 2026-09-30 — so retries start over).
 * @param {(buffer:Buffer) => Promise<{pass:boolean, judged:boolean, score:number|null, reason:string}>} p.judge
 * @param {string} p.label — for logs only, never user text
 * @returns the delivered attempt's result with `qa` attached
 */
async function withFidelityGate({ gateConfig, generate, judge, label = 'ev' }) {
  const enabled = gateConfig?.enabled !== false
  const maxAttempts = Math.max(1, Number(gateConfig?.maxAttempts) || 1)

  if (!enabled) {
    return generate(1, { correctivePrefix: '', forceCreate: false })
  }

  const attempts = []
  for (let n = 1; n <= maxAttempts; n++) {
    const ctx = { correctivePrefix: n > 1 ? CORRECTIVE_PREFIX : '', forceCreate: n > 1 }
    const { result, stages } = await runIsolatedUsage(() => generate(n, ctx))
    const verdict = await judge(result.scene.buffer)
    attempts.push({ result, stages, verdict, n })
    const tag = verdict.judged ? (verdict.pass ? 'PASS' : 'FAIL') : 'UNJUDGED'
    console.log(`[fidelity-gate] ${label}: attempt ${n}/${maxAttempts} ${tag}${verdict.score != null ? ` score=${verdict.score}` : ''} — ${verdict.reason}`)
    if (verdict.pass) return deliver(attempts[attempts.length - 1], { passed: verdict.judged, judged: verdict.judged, attempts: n, reason: verdict.reason, score: verdict.score })
  }

  // Nothing passed: ship the best-scoring attempt, flagged. Ties/no scores → the last one.
  const best = attempts.reduce((b, a) => ((a.verdict.score ?? -1) > (b.verdict.score ?? -1) ? a : b), attempts[attempts.length - 1])
  console.error(`[fidelity-gate] ${label}: all ${maxAttempts} attempts failed — delivering attempt ${best.n} flagged (score=${best.verdict.score})`)
  return deliver(best, { passed: false, judged: true, attempts: maxAttempts, reason: best.verdict.reason, score: best.verdict.score })
}

function deliver(attempt, qa) {
  replayUsage(attempt.stages)
  return { ...attempt.result, qa }
}

module.exports = { judgeEvFidelity, withFidelityGate, parseVerdict, CORRECTIVE_PREFIX }
