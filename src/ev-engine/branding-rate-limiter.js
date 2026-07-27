'use strict'

// In-memory, single-process — same assumption as scene-rate-limiter.js /
// scene-simple-rate-limiter.js. Deliberately its own Map (not shared with either),
// so a caller's quota on /generate-ev-branding is independent of its quota on the
// other 2 routes, even if the same `source` value is used for all three.
const hourlyBySource = new Map() // source -> [timestamps]

const HOUR_MS = 60 * 60 * 1000

const LIMITS = {
  perSourcePerHour: parseInt(process.env.BRANDING_RATE_LIMIT_PER_SOURCE_HOUR || '20', 10),
}

function pruneOld(list, windowMs, now) {
  while (list.length && now - list[0] > windowMs) list.shift()
}

// Throws with a caller-facing message if the request should be blocked.
// Call AFTER validating the request is well-formed and authenticated, BEFORE generating.
function checkBrandingRateLimit({ source }) {
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

module.exports = { checkBrandingRateLimit, LIMITS }
