'use strict'
const crypto = require('crypto')

// In-memory, single-process — same model as rate-limiter.js, kept as its own module
// (not shared) so the guide-download flow's limits/wording never interact with the
// EV-preview generator's.
const hourlyByIp = new Map()
const dailyByEmail = new Map()

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const LIMITS = {
  perIpPerHour: parseInt(process.env.GUIDE_RATE_LIMIT_PER_IP_HOUR || '5', 10),
  perEmailPerDay: parseInt(process.env.GUIDE_RATE_LIMIT_PER_EMAIL_DAY || '3', 10),
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

function pruneOld(list, windowMs, now) {
  while (list.length && now - list[0] > windowMs) list.shift()
}

function checkGuideRateLimit({ ip, email }) {
  const now = Date.now()
  const ipHash = hashIp(ip)
  const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')

  const ipHits = hourlyByIp.get(ipHash) || []
  pruneOld(ipHits, HOUR_MS, now)
  if (ipHits.length >= LIMITS.perIpPerHour) {
    throw new Error(`Rate limit: max ${LIMITS.perIpPerHour} guide requests per hour per IP`)
  }

  const emailHits = dailyByEmail.get(emailHash) || []
  pruneOld(emailHits, DAY_MS, now)
  if (emailHits.length >= LIMITS.perEmailPerDay) {
    throw new Error(`Rate limit: max ${LIMITS.perEmailPerDay} guide request(s) per day per email`)
  }

  ipHits.push(now); hourlyByIp.set(ipHash, ipHits)
  emailHits.push(now); dailyByEmail.set(emailHash, emailHits)

  return { ipHash }
}

module.exports = { checkGuideRateLimit, LIMITS }
