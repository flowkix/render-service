'use strict'
const axios = require('axios')
const { Provider, priceFor } = require('./provider')

// Flux.1 Kontext [max] via fal.ai queue API — branding-stage challenger.
// Multi-image variant (/multi) accepts image_urls[]; single variant accepts image_url.
// Images are sent as data URIs so no public hosting is required during bench runs.
const FAL_QUEUE_BASE = 'https://queue.fal.run'
const SINGLE_MODEL_PATH = 'fal-ai/flux-pro/kontext/max'
const MULTI_MODEL_PATH = 'fal-ai/flux-pro/kontext/max/multi'

class FalKontextProvider extends Provider {
  constructor({ apiKey = process.env.FAL_KEY } = {}) {
    super()
    if (!apiKey) throw new Error('FAL_KEY env var not set — Kontext challenger unavailable')
    this.apiKey = apiKey
  }

  async generate({ images, prompt, opts = {} }) {
    const timeoutMs = opts.timeoutMs || 180000
    const t0 = Date.now()
    const dataUris = images.map(i => `data:${i.mimeType};base64,${i.buffer.toString('base64')}`)
    const multi = dataUris.length > 1
    const modelPath = multi ? MULTI_MODEL_PATH : SINGLE_MODEL_PATH

    const payload = {
      prompt,
      ...(multi ? { image_urls: dataUris } : { image_url: dataUris[0] }),
      ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
      output_format: 'png',
      safety_tolerance: '5',
    }

    const headers = { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' }
    const submit = await axios.post(`${FAL_QUEUE_BASE}/${modelPath}`, payload, { headers, timeout: 60000 })
    const { status_url: statusUrl, response_url: responseUrl } = submit.data
    if (!statusUrl || !responseUrl) {
      throw new Error(`fal-kontext: unexpected queue response keys ${JSON.stringify(Object.keys(submit.data))}`)
    }

    let status = submit.data.status
    while (status !== 'COMPLETED') {
      if (Date.now() - t0 > timeoutMs) throw new Error(`fal-kontext: timeout after ${timeoutMs}ms (last status ${status})`)
      await new Promise(r => setTimeout(r, 2000))
      const poll = await axios.get(statusUrl, { headers, timeout: 30000 })
      status = poll.data.status
      if (status === 'FAILED' || status === 'ERROR') {
        throw new Error(`fal-kontext: generation failed — ${JSON.stringify(poll.data).slice(0, 400)}`)
      }
    }

    const result = await axios.get(responseUrl, { headers, timeout: 30000 })
    const imageUrl = result.data?.images?.[0]?.url
    if (!imageUrl) throw new Error(`fal-kontext: no image in result. Keys: ${JSON.stringify(Object.keys(result.data || {}))}`)
    const img = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 })

    return {
      buffer: Buffer.from(img.data),
      meta: {
        provider: 'fal-kontext',
        model: 'flux-pro/kontext/max',
        latencyMs: Date.now() - t0,
        costUsd: priceFor('flux-pro/kontext/max'),
      },
    }
  }

  estimateCost() {
    return priceFor('flux-pro/kontext/max')
  }
}

module.exports = { FalKontextProvider }
