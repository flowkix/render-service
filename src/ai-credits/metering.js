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
    console.error(`[ai-credits] precheck failed for "${source}" (fail-open):`, err.message)
    return null
  }
}

function kick(body, { http, config }) {
  if (!config.baseUrl || !config.secret) {
    console.error('[ai-credits] kick skipped — HUB_URL/RENDER_AI_CREDITS_SECRET not set (HUB cron will charge the row)')
    return
  }
  http.post(`${config.baseUrl}/api/internal/ai-credits/render-charge`, body, { headers: hubHeaders(config), timeout: HUB_TIMEOUT_MS })
    .catch(err => console.error('[ai-credits] kick failed (HUB cron will retry):', err.message))
}

// Never throws: metering must not break a generation that already succeeded.
async function persistUsage({ source, stages, requestStatus }, { getDb, http, config }) {
  const row = { source, stages, request_status: requestStatus, idempotency_key: randomUUID() }
  try {
    const { data, error } = await getDb().from('ai_credit_render_outbox').insert(row).select('id').single()
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

  if (creditModeFor(source) === 'block') {
    const pre = await precheck(source, { http, config })
    if (pre && pre.allowed === false) throw new InsufficientCreditsError()
  }

  const { result, error, stages } = await runWithUsageRecorder(fn)
  if (stages.length > 0) {
    await persistUsage({ source, stages, requestStatus: error ? 'failed_partial' : 'succeeded' }, { getDb, http, config })
  }
  if (error) throw error
  return result
}

module.exports = { meterGeneration, InsufficientCreditsError }
