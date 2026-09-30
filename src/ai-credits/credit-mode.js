'use strict'

// AI Credits ítem 9 — which render-service callers are BLOCKED at zero balance.
// Blocking = a person from SNACKET/FLOWKIX is operating the flow and can act on a
// "no credits" message. Everything else (n8n automations, prospect-facing review
// pages, the public CLT microsite) is best-effort: generate anyway, the charge
// lands in HUB's Charge Failures panel. Spec:
// hub/docs/superpowers/specs/2026-09-29-ai-credits-render-service-metering-design.md §4
const BLOCKING_SOURCES = new Set([
  'pitch-elevator',
  'hub-tools-ev-studio',
  'hub-tools-ev-full',
  'hub-tools-ev-simple',
  'hub-tools-ev-decor',
  'pitch-elevator-gallery',
])

const KNOWN_BEST_EFFORT = new Set([
  'stage-a', // n8n Stage A v2 deck creation (AKoPO7HtRXsEZGiE, node "Railway EV Scene")
  'stage-a-review-regen',
  'pitch-elevator-review-regen',
  'business-card-capture',
  'clt-alliance-public',
  'legacy-ev-scene',
])

function creditModeFor(source) {
  if (BLOCKING_SOURCES.has(source)) return 'block'
  if (!KNOWN_BEST_EFFORT.has(source)) {
    console.warn(`[credit-mode] unknown source ${JSON.stringify(String(source)).slice(0, 80)} — treating as best-effort`)
  }
  return 'best-effort'
}

module.exports = { creditModeFor, BLOCKING_SOURCES }
