'use strict'

// Single source of truth for the "is this the real SNACKET EV?" question. Used by BOTH the
// runtime fidelity gate (pipeline/fidelity-gate.js — gates what ships to a prospect) and the
// offline bench scorer (bench/scorer.js — measures pass rates). Keeping one text means the
// bench measures exactly what production enforces; the 2026-07-23 incident where a prompt
// fix and the scorer rubric drifted apart (docs/lessons/failed-approaches.md) is why this
// lives in one module instead of two copies.
//
// Structure ONLY — branding, wrap colors, logos, lighting, people and camera angle are
// deliberately out of scope: the raw reference carries SNACKET's own markings while a
// production image carries the prospect's, so a branding comparison would always fail.
function evStructureQuestion(refLabel) {
  return (
    `Is the vehicle in the generated image the SAME physical vehicle as the reference EV (${refLabel})? ` +
    `The reference is a compact, narrow-body electric micro-truck: small enclosed driver cab with a flat rectangular roof, ` +
    `a boxy rear service body with two raised gull-wing doors (lifted flat panels on struts), a round center disc on the ` +
    `side wall, small wheels, and a decorative skirt with a coffee-bean pattern along the base of the body. ` +
    `Compare body shape, size and proportions, cab, roof, door geometry, wheels and the base skirt. ` +
    `IGNORE branding, logos, wrap colors, text, lighting, people, background and camera angle — judge physical structure only. ` +
    `Answer pass=false if it looks like a visibly DIFFERENT vehicle (box van, cargo van, food truck, flatbed, trailer, larger truck) ` +
    `or if a structural element is clearly different or missing (e.g. no coffee-bean skirt, open side instead of a service wall, ` +
    `different cab or roof). Minor rendering differences in details are acceptable.`
  )
}

module.exports = { evStructureQuestion }
