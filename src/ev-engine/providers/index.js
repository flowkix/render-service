'use strict'
const { GeminiProvider } = require('./gemini')
const { FalKontextProvider } = require('./fal-kontext')

const registry = {
  gemini: GeminiProvider,
  'fal-kontext': FalKontextProvider,
}

const instances = new Map()

function getProvider(name) {
  if (!registry[name]) {
    throw new Error(`Unknown provider "${name}". Valid: ${Object.keys(registry).join(', ')}`)
  }
  if (!instances.has(name)) {
    instances.set(name, new registry[name]())
  }
  return instances.get(name)
}

// Non-throwing availability check (bench uses it to skip challengers with missing keys)
function providerAvailable(name) {
  try {
    getProvider(name)
    return true
  } catch {
    return false
  }
}

module.exports = { getProvider, providerAvailable }
