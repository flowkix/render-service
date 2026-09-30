'use strict'
const { AsyncLocalStorage } = require('async_hooks')

// Per-request collector of successful paid image generations (AI Credits ítem 9).
// Providers call recordImageUsage() after each successful call; meterGeneration()
// wraps the pipeline in runWithUsageRecorder() and turns the stages into one
// outbox row. AsyncLocalStorage keeps concurrent HTTP requests isolated without
// threading a collector through every pipeline stage.
const storage = new AsyncLocalStorage()

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
  store.stages.push({ stage, model, resolution: String(resolution).toUpperCase(), images: 1 })
}

module.exports = { runWithUsageRecorder, recordImageUsage }
