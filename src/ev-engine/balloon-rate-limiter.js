'use strict'
const crypto = require('crypto')

// In-memory, single-process — same model as guide-rate-limiter.js, kept as its
// own module (not shared) so the balloon-décor request flow's limits never
// interact with the guide-download or EV-preview generator's.
const hourlyByIp = new Map()
const dailyByEmail = new Map()

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const LIMITS = {
  perIpPerHour: parseInt(process.env.BALLOON_RATE_LIMIT_PER_IP_HOUR || '10', 10),
  perEmailPerDay: parseInt(process.env.BALLOON_RATE_LIMIT_PER_EMAIL_DAY || '6', 10),
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

function pruneOld(list, windowMs, now) {
  while (list.length && now - list[0] > windowMs) list.shift()
}

function checkBalloonRateLimit({ ip, email }) {
  const now = Date.now()
  const ipHash = hashIp(ip)
  const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')

  const ipHits = hourlyByIp.get(ipHash) || []
  pruneOld(ipHits, HOUR_MS, now)
  if (ipHits.length >= LIMITS.perIpPerHour) {
    throw new Error(`Rate limit: max ${LIMITS.perIpPerHour} requests per hour per IP`)
  }

  const emailHits = dailyByEmail.get(emailHash) || []
  pruneOld(emailHits, DAY_MS, now)
  if (emailHits.length >= LIMITS.perEmailPerDay) {
    throw new Error(`Rate limit: max ${LIMITS.perEmailPerDay} request(s) per day per email`)
  }

  ipHits.push(now); hourlyByIp.set(ipHash, ipHits)
  emailHits.push(now); dailyByEmail.set(emailHash, emailHits)

  return { ipHash }
}

module.exports = { checkBalloonRateLimit, LIMITS }
