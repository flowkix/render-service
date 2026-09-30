'use strict'
const { AsyncLocalStorage } = require('async_hooks')

// Per-request collector of successful paid image generations (AI Credits ítem 9).
// Providers call recordImageUsage() after each successful call; meterGeneration()
// wraps the pipeline in runWithUsageRecorder() and turns the stages into one
// outbox row. AsyncLocalStorage keeps concurrent HTTP requests isolated without
// threading a collector through every pipeline stage.
const storage = new AsyncLocalStorage()

const VALID_RESOLUTIONS = ['0.5K', '1K', '2K', '4K']
const MAX_STAGE_LENGTH = 64

async function runWithUsageRecorder(fn) {
  const store = { stages: [] }
  try {
    const result = await storage.run(store, fn)
    return { result, error: null, stages: store.stages }
  } catch (error) {
    return { result: undefined, error, stages: store.stages }
  }
}

function recordImageUsage({ stage, model, resolution }) {
  const store = storage.getStore()
  if (!store) return
  const normalizedResolution = String(resolution).toUpperCase()
  if (!VALID_RESOLUTIONS.includes(normalizedResolution)) {
    // One malformed stage must not make HUB reject the whole billing row — drop
    // just this stage and keep the rest of the request's usage intact.
    console.error('[usage-recorder] invalid resolution — stage NOT recorded', JSON.stringify({ stage, model, resolution }))
    return
  }
  store.stages.push({ stage: String(stage).slice(0, MAX_STAGE_LENGTH), model, resolution: normalizedResolution, images: 1 })
}

module.exports = { runWithUsageRecorder, recordImageUsage }
