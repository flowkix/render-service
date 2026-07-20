'use strict'
// Local env loader for bench runs (no dotenv dep). Railway provides env vars in prod;
// locally we read render-service/.env first, then fall back to the FLOWKIX .secrets
// convention (paths only — secrets never enter the repo).
const path = require('path')
const fs = require('fs')

function parseEnvFile(file) {
  try {
    const out = {}
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
    return out
  } catch {
    return {}
  }
}

function loadBenchEnv() {
  const local = parseEnvFile(path.join(__dirname, '..', '.env'))
  for (const [k, v] of Object.entries(local)) {
    if (!process.env[k]) process.env[k] = v
  }
  const secretsDir = path.join(__dirname, '..', '..', '.secrets')
  if (!process.env.GEMINI_API_KEY) {
    const g = parseEnvFile(path.join(secretsDir, 'google-ai.env'))
    if (g.GOOGLE_AI_API_KEY) process.env.GEMINI_API_KEY = g.GOOGLE_AI_API_KEY
  }
  if (!process.env.FAL_KEY) {
    const f = parseEnvFile(path.join(secretsDir, 'fal.env'))
    if (f.FAL_KEY) process.env.FAL_KEY = f.FAL_KEY
  }
}

module.exports = { loadBenchEnv }
