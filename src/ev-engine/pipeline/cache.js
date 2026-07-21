'use strict'
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

function brandingCacheKey({ logoBuffer, zoneIds, configVersion, provider, model }) {
  const logoSha = crypto.createHash('sha256').update(logoBuffer).digest('hex').slice(0, 16)
  const material = [logoSha, zoneIds.selected.join(','), configVersion, provider, model].join('|')
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 24)
}

// Phase 1: local-dir cache only. 'supabase' mode is a phase-2 concern (documented in the plan);
// constructor rejects it explicitly so callers don't silently get no caching.
class BrandedEvCache {
  constructor({ mode = 'none', dir = null } = {}) {
    if (!['none', 'local'].includes(mode)) {
      throw new Error(`cache mode "${mode}" not supported in phase 1 (use 'none' or 'local')`)
    }
    this.mode = mode
    this.dir = dir
    if (mode === 'local') {
      if (!dir) throw new Error('local cache requires a dir')
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  _file(key) {
    return path.join(this.dir, `${key}.png`)
  }

  async get(key) {
    if (this.mode !== 'local') return null
    const file = this._file(key)
    try {
      return await fs.promises.readFile(file)
    } catch {
      return null
    }
  }

  async set(key, buffer) {
    if (this.mode !== 'local') return
    await fs.promises.writeFile(this._file(key), buffer)
  }
}

module.exports = { BrandedEvCache, brandingCacheKey }
