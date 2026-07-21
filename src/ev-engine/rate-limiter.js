'use strict'
const crypto = require('crypto')

// In-memory, single-process — correct for render-service's current single-Railway-instance
// deployment. If this ever scales to multiple instances, move to Supabase/Redis.
const hourlyByIp = new Map()   // ip -> [timestamps]
const dailyByEmail = new Map() // emailHash -> [timestamps]
const dailyGlobal = []         // [timestamps]

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const LIMITS = {
  perIpPerHour: parseInt(process.env.CLT_RATE_LIMIT_PER_IP_HOUR || '5', 10),
  perEmailPerDay: parseInt(process.env.CLT_RATE_LIMIT_PER_EMAIL_DAY || '1', 10),
  globalPerDay: parseInt(process.env.CLT_RATE_LIMIT_GLOBAL_DAY || '100', 10),
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

function pruneOld(list, windowMs, now) {
  while (list.length && now - list[0] > windowMs) list.shift()
}

// Throws with a user-facing message if the request should be blocked.
// Call AFTER validating the request is well-formed, BEFORE calling the generator.
function checkRateLimit({ ip, email }) {
  const now = Date.now()
  const ipHash = hashIp(ip)
  const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')

  const ipHits = hourlyByIp.get(ipHash) || []
  pruneOld(ipHits, HOUR_MS, now)
  if (ipHits.length >= LIMITS.perIpPerHour) {
    throw new Error(`Rate limit: max ${LIMITS.perIpPerHour} generations per hour per IP`)
  }

  const emailHits = dailyByEmail.get(emailHash) || []
  pruneOld(emailHits, DAY_MS, now)
  if (emailHits.length >= LIMITS.perEmailPerDay) {
    throw new Error(`Rate limit: max ${LIMITS.perEmailPerDay} generation(s) per day per email`)
  }

  pruneOld(dailyGlobal, DAY_MS, now)
  if (dailyGlobal.length >= LIMITS.globalPerDay) {
    throw new Error('Daily generation budget reached — try again tomorrow')
  }

  ipHits.push(now); hourlyByIp.set(ipHash, ipHits)
  emailHits.push(now); dailyByEmail.set(emailHash, emailHits)
  dailyGlobal.push(now)

  return { ipHash }
}

module.exports = { checkRateLimit, hashIp, LIMITS }
