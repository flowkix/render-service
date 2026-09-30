'use strict'
const { randomUUID } = require('crypto')
const axios = require('axios')
const { getClient } = require('../supabase')
const { runWithUsageRecorder } = require('./usage-recorder')
const { creditModeFor } = require('./credit-mode')

// AI Credits ítem 9 — charges every paid render-service image pipeline to
// SNACKET's HUB AI credits. Flow (spec §3): run the pipeline inside a usage
// recorder → INSERT one ai_credit_render_outbox row in HUB's DB (the durability
// point) → fire-and-forget kick to HUB's render-charge endpoint (HUB's cron
// retries anything the kick misses). Blocking sources pre-check the balance
// first and fail OPEN if HUB can't answer. Spec:
// hub/docs/superpowers/specs/2026-09-29-ai-credits-render-service-metering-design.md

class InsufficientCreditsError extends Error {
  constructor() {
    super('insufficient_credits')
    this.name = 'InsufficientCreditsError'
  }
}

const HUB_TIMEOUT_MS = 5000
const OUTBOX_INSERT_TIMEOUT_MS = 5000

function hubConfig() {
  return { baseUrl: process.env.HUB_URL, secret: process.env.RENDER_AI_CREDITS_SECRET }
}

function hubHeaders(config) {
  return { 'Content-Type': 'application/json', 'x-render-ai-credits-secret': config.secret }
}

async function precheck(source, { http, config }) {
  if (!config.baseUrl || !config.secret) {
    console.error('[ai-credits] precheck skipped — HUB_URL/RENDER_AI_CREDITS_SECRET not set (fail-open)')
    return null
  }
  try {
    const resp = await http.post(`${config.baseUrl}/api/internal/ai-credits/render-precheck`, { source }, { headers: hubHeaders(config), timeout: HUB_TIMEOUT_MS })
    return resp.data
  } catch (err) {
    // Sanitized the same way credit-mode logs an unknown source — keeps an
    // odd/injected source value from blowing up log formatting.
    console.error(`[ai-credits] precheck failed for ${JSON.stringify(String(source)).slice(0, 80)} (fail-open): status=${err.response?.status ?? 'none'} ${err.message}`)
    return null
  }
}

// Never throws synchronously — a body shape mismatch or a broken http client
// must not break the caller, which by this point already has its result.
function kick(body, { http, config }) {
  const isFallback = Boolean(body.fallback)
  if (!config.baseUrl || !config.secret) {
    if (isFallback) {
      // No outbox row exists for HUB's cron to pick up later — this charge is
      // truly gone unless someone replays the fallback payload by hand.
      console.error('[ai-credits] CHARGE LOST — no outbox row and HUB_URL/RENDER_AI_CREDITS_SECRET not set, manual recovery needed:', JSON.stringify(body.fallback))
    } else {
      console.error('[ai-credits] kick skipped — HUB_URL/RENDER_AI_CREDITS_SECRET not set (HUB cron will charge the row)')
    }
    return
  }
  Promise.resolve()
    .then(() => http.post(`${config.baseUrl}/api/internal/ai-credits/render-charge`, body, { headers: hubHeaders(config), timeout: HUB_TIMEOUT_MS }))
    .catch(err => {
      if (isFallback) {
        // Same reasoning as above: no outbox row backs this up, so a failed
        // kick here means the charge has no other path to land.
        console.error('[ai-credits] CHARGE LOST — fallback kick failed, manual recovery needed:', err.message, JSON.stringify(body.fallback))
      } else {
        console.error('[ai-credits] kick failed (HUB cron will retry):', err.message)
      }
    })
}

// Never throws: metering must not break a generation that already succeeded.
async function persistUsage({ source, stages, requestStatus }, { getDb, http, config, insertTimeoutMs }) {
  const row = { source, stages, request_status: requestStatus, idempotency_key: randomUUID() }
  try {
    const { data, error } = await getDb()
      .from('ai_credit_render_outbox')
      .insert(row)
      .select('id')
      .single()
      .abortSignal(AbortSignal.timeout(insertTimeoutMs))
    if (error) throw new Error(error.message)
    kick({ outbox_id: data.id }, { http, config })
  } catch (err) {
    console.error('[ai-credits] UNEXPECTED outbox insert failed — sending fallback to HUB:', err.message, JSON.stringify(row))
    kick({ fallback: row }, { http, config })
  }
}

async function meterGeneration({ source }, fn, deps = {}) {
  const http = deps.http || axios
  const getDb = deps.getDb || getClient
  const config = deps.config || hubConfig()
  const insertTimeoutMs = deps.insertTimeoutMs || OUTBOX_INSERT_TIMEOUT_MS

  if (creditModeFor(source) === 'block') {
    const pre = await precheck(source, { http, config })
    if (pre && pre.allowed === false) throw new InsufficientCreditsError()
  }

  const { result, error, stages } = await runWithUsageRecorder(fn)
  if (stages.length > 0) {
    await persistUsage({ source, stages, requestStatus: error ? 'failed_partial' : 'succeeded' }, { getDb, http, config, insertTimeoutMs })
  }
  if (error) throw error
  return result
}

module.exports = { meterGeneration, InsufficientCreditsError }
