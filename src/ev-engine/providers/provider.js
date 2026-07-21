'use strict'

/**
 * Provider contract:
 *   generate({ images, prompt, opts }) -> { buffer, meta }
 *     images: [{ buffer, mimeType, role: 'primary'|'ref' }]  — primary FIRST (IMAGE A rule)
 *     opts:   { model, aspectRatio, resolution '1K'|'2K'|'4K', timeoutMs, label }
 *     meta:   { provider, model, latencyMs, costUsd, tokens? }
 *   estimateCost({ model, resolution }) -> number (USD)
 */
class Provider {
  // eslint-disable-next-line no-unused-vars
  async generate(req) {
    throw new Error('Provider.generate not implemented')
  }

  // eslint-disable-next-line no-unused-vars
  estimateCost(opts) {
    throw new Error('Provider.estimateCost not implemented')
  }
}

// Flat per-image pricing by resolution (USD) — used for estimates and cost accounting.
// Sources: Gemini API pricing (Jul 2026), fal.ai Kontext pricing. Update here if rates change.
const PRICING = {
  'gemini-3-pro-image': { '1K': 0.134, '2K': 0.134, '4K': 0.24 },
  'gemini-3.1-flash-image': { '1K': 0.067, '2K': 0.101, '4K': 0.151 },
  'gemini-2.5-flash-image': { '1K': 0.039, '2K': 0.039, '4K': 0.039 },
  'flux-pro/kontext/max': { '1K': 0.08, '2K': 0.08, '4K': 0.08 },
  'gemini-3.5-flash': { scoring: 0.01 },
}

function priceFor(model, resolution = '2K') {
  const table = PRICING[model]
  if (!table) return 0
  return table[resolution] ?? table['2K'] ?? 0
}

module.exports = { Provider, PRICING, priceFor }
