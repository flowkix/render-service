'use strict'
const axios = require('axios')
const { Provider, priceFor } = require('./provider')
const { assertPayloadWithinLimit } = require('../assets')

// Direct HTTP to generativelanguage.googleapis.com (never SDK/native nodes — geo-block lesson 2026-07-03).
// gemini-3-pro-image / gemini-3.1-flash-image validated 2026-07-20: :generateContent with
// generationConfig.imageConfig { aspectRatio, imageSize } — the /v1beta/interactions endpoint
// does NOT exist on this API surface.
class GeminiProvider extends Provider {
  constructor({ apiKey = process.env.GEMINI_API_KEY } = {}) {
    super()
    if (!apiKey) throw new Error('GEMINI_API_KEY env var not set')
    this.apiKey = apiKey
  }

  async generate({ images, prompt, opts = {} }) {
    const model = opts.model || 'gemini-3-pro-image'
    const timeoutMs = opts.timeoutMs || 180000
    assertPayloadWithinLimit(images.map(i => i.buffer))

    const parts = [
      { text: prompt },
      ...images.map(i => ({ inlineData: { mimeType: i.mimeType, data: i.buffer.toString('base64') } })),
    ]
    const imageConfig = {}
    if (opts.aspectRatio) imageConfig.aspectRatio = opts.aspectRatio
    if (opts.resolution) imageConfig.imageSize = opts.resolution.toUpperCase()

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
      },
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`
    const t0 = Date.now()
    const resp = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: timeoutMs,
    })
    const latencyMs = Date.now() - t0

    const buffer = extractImageBuffer(resp.data, opts.label || model)
    return {
      buffer,
      meta: {
        provider: 'gemini',
        model,
        latencyMs,
        costUsd: priceFor(model, opts.resolution || '2K'),
        tokens: resp.data.usageMetadata?.totalTokenCount,
      },
    }
  }

  estimateCost({ model = 'gemini-3-pro-image', resolution = '2K' } = {}) {
    return priceFor(model, resolution)
  }
}

function extractImageBuffer(geminiResp, label) {
  const candidates = geminiResp.candidates || []
  if (!candidates[0]?.content?.parts) {
    throw new Error(`${label}: no candidates. Keys: ${JSON.stringify(Object.keys(geminiResp))}`)
  }
  const part = candidates[0].content.parts.find(p => p.inlineData || p.inline_data)
  if (!part) {
    throw new Error(`${label}: no image part. Parts: ${JSON.stringify(candidates[0].content.parts.map(p => Object.keys(p)))}`)
  }
  const inline = part.inlineData || part.inline_data
  return Buffer.from(inline.data, 'base64')
}

module.exports = { GeminiProvider, extractImageBuffer }
