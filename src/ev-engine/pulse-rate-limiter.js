'use strict'
const crypto = require('crypto')

// In-memory, single-process — same model as balloon-rate-limiter.js, kept as its
// own module (not shared) so the Audience Pulse survey flow's limits never
// interact with the balloon-décor, guide-download, or EV-preview generator's.
const hourlyByIp = new Map()
const dailyByEmail = new Map()

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const LIMITS = {
  // This is a live event QR-code survey — many attendees can share the same
  // venue WiFi/NAT IP, so the per-IP ceiling is kept well above the balloon
  // route's default of 10.
  perIpPerHour: parseInt(process.env.PULSE_RATE_LIMIT_PER_IP_HOUR || '20', 10),
  perEmailPerDay: parseInt(process.env.PULSE_RATE_LIMIT_PER_EMAIL_DAY || '3', 10),
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

function pruneOld(list, windowMs, now) {
  while (list.length && now - list[0] > windowMs) list.shift()
}

// Unlike checkBalloonRateLimit, `email` is optional here — most survey
// submissions won't include one (lead capture via wants_contact is opt-in),
// so the per-email/day limit is only checked and tracked when an email is
// actually present. The per-IP/hour limit always applies.
function checkPulseRateLimit({ ip, email }) {
  const now = Date.now()
  const ipHash = hashIp(ip)

  const ipHits = hourlyByIp.get(ipHash) || []
  pruneOld(ipHits, HOUR_MS, now)
  if (ipHits.length >= LIMITS.perIpPerHour) {
    throw new Error(`Rate limit: max ${LIMITS.perIpPerHour} requests per hour per IP`)
  }

  let emailHash = null
  let emailHits = null
  if (email) {
    emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
    emailHits = dailyByEmail.get(emailHash) || []
    pruneOld(emailHits, DAY_MS, now)
    if (emailHits.length >= LIMITS.perEmailPerDay) {
      throw new Error(`Rate limit: max ${LIMITS.perEmailPerDay} request(s) per day per email`)
    }
  }

  ipHits.push(now); hourlyByIp.set(ipHash, ipHits)
  if (email) {
    emailHits.push(now); dailyByEmail.set(emailHash, emailHits)
  }

  return { ipHash }
}

module.exports = { checkPulseRateLimit, LIMITS }
