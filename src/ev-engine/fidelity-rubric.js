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
//
// Calibrated 2026-09-30/10-01 on 13 labeled images (6 hallucinated, 7 correct — real prod
// outputs + bench): with gemini-3-flash-preview the question alone passed a wood-grain box
// truck whose doors/taps looked right (1 miss / 6 bad); adding the explicit discriminators
// below caught all 6 at the cost of 1 false reject / 7 good. A false reject costs one retry;
// a miss ships a wrong vehicle to a prospect, so the discriminators stay. gemini-2.5-flash
// missed 3/6 even with them — keep the scorer model on gemini-3-flash-preview.
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

// Failure modes seen in real outputs that a generic "same structure?" question let through.
function evStructureDiscriminators() {
  return (
    'Discriminators that mean a DIFFERENT vehicle even when doors and taps look similar: body panels that are predominantly ' +
    'wood-grain or brown instead of the reference white or light-colored panels (small wood-toned accent strips are normal and fine); ' +
    'coffee beans covering most of the body instead of forming only a narrow decorative band along the base; an open flatbed/platform ' +
    'side instead of a closed service wall; a pickup, van or box-truck silhouette; only one raised door panel; large wheels.'
  )
}

module.exports = { evStructureQuestion, evStructureDiscriminators }
