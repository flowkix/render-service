'use strict'

// In-memory, single-process — correct for render-service's current single-Railway-instance
// deployment (same assumption as src/ev-engine/rate-limiter.js). If this ever scales to
// multiple instances, move to Supabase/Redis.
//
// Keyed by `source` (the calling workflow's identifier, e.g. "pitch-elevator",
// "clt-alliance", "n8n-wf-12") rather than IP/email — this route is authenticated and
// internal, called by known FLOWKIX workflows, not the public. The goal is to stop one
// workflow's burst of generations from starving or destabilizing generation for another
// concurrent caller, not to prevent public abuse (that's what the shared-secret auth is for).
const hourlyBySource = new Map() // source -> [timestamps]

const HOUR_MS = 60 * 60 * 1000

const LIMITS = {
  perSourcePerHour: parseInt(process.env.SCENE_RATE_LIMIT_PER_SOURCE_HOUR || '20', 10),
}

function pruneOld(list, windowMs, now) {
  while (list.length && now - list[0] > windowMs) list.shift()
}

// Throws with a caller-facing message if the request should be blocked.
// Call AFTER validating the request is well-formed and authenticated, BEFORE generating.
function checkSceneRateLimit({ source }) {
  if (!source || !String(source).trim()) throw new Error('source is required for rate limiting')
  const now = Date.now()
  const key = String(source).trim()

  const hits = hourlyBySource.get(key) || []
  pruneOld(hits, HOUR_MS, now)
  if (hits.length >= LIMITS.perSourcePerHour) {
    throw new Error(`Rate limit: max ${LIMITS.perSourcePerHour} generations per hour for source "${key}"`)
  }

  hits.push(now)
  hourlyBySource.set(key, hits)
}

module.exports = { checkSceneRateLimit, LIMITS }
