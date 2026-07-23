'use strict'
const crypto = require('crypto')

// In-memory, single-process — same reasoning as rate-limiter.js. Codes are short-lived
// (10 min) so a service restart wiping pending codes is an acceptable, rare inconvenience
// (user just requests a new one), not worth a DB table for this.
const codesByEmail = new Map() // emailHash -> { code, expiresAt, attempts }
const sendsByEmail = new Map() // emailHash -> [timestamps] (resend rate limit)

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_VERIFY_ATTEMPTS = 5
const MAX_SENDS_PER_HOUR = 3
const HOUR_MS = 60 * 60 * 1000

function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
}

function pruneOld(list, windowMs, now) {
  while (list.length && now - list[0] > windowMs) list.shift()
}

// Throws if this email has requested too many codes recently. Call before storeCode().
function checkResendLimit(email) {
  const now = Date.now()
  const emailHash = hashEmail(email)
  const hits = sendsByEmail.get(emailHash) || []
  pruneOld(hits, HOUR_MS, now)
  if (hits.length >= MAX_SENDS_PER_HOUR) {
    throw new Error(`Too many code requests — max ${MAX_SENDS_PER_HOUR} per hour, please try again later`)
  }
  hits.push(now)
  sendsByEmail.set(emailHash, hits)
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

function storeCode(email) {
  const code = generateCode()
  const emailHash = hashEmail(email)
  codesByEmail.set(emailHash, { code, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 })
  return code
}

// Returns { valid: true } and consumes the code (one-time use) on success,
// or { valid: false, error } without consuming it on failure (except when attempts/expiry
// force a reset — those cases require requesting a brand new code either way).
function verifyCode(email, submittedCode) {
  const emailHash = hashEmail(email)
  const entry = codesByEmail.get(emailHash)
  if (!entry) return { valid: false, error: 'No active code for this email — request a new one' }
  if (Date.now() > entry.expiresAt) {
    codesByEmail.delete(emailHash)
    return { valid: false, error: 'Code expired — request a new one' }
  }
  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    codesByEmail.delete(emailHash)
    return { valid: false, error: 'Too many incorrect attempts — request a new one' }
  }
  if (String(submittedCode || '').trim() !== entry.code) {
    entry.attempts += 1
    return { valid: false, error: 'Incorrect code' }
  }
  codesByEmail.delete(emailHash)
  return { valid: true }
}

module.exports = { checkResendLimit, storeCode, verifyCode }
