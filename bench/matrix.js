'use strict'
const path = require('path')
const fs = require('fs')

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'logos.json'), 'utf8'))

const ZONE_SETS = {
  all: 'all',
  center_only: ['center_disc'],
  doors_band: ['left_door_interior', 'right_door_interior', 'header_band'],
}

const BRANDING_CANDIDATES = [
  { provider: 'gemini', model: 'gemini-3-pro-image' },
  { provider: 'gemini', model: 'gemini-3.1-flash-image' },
  { provider: 'fal-kontext', model: 'flux-pro/kontext/max' },
]

const SCENE_CANDIDATES = [
  { provider: 'gemini', model: 'gemini-3-pro-image' },
  { provider: 'gemini', model: 'gemini-3.1-flash-image' },
]

// v2 scene test cases — theme + venue combos exercising the compositional model.
// Kept small and named (not a cross-product of independent options) so the ≤10-image
// validation budget in the implementation plan is predictable and reproducible.
const SCENE_TEST_CASES = [
  {
    id: 'rooftop-golden-hour',
    theme: 'upscale golden-hour cocktail activation, string lights, lounge ambiance',
    venue: 'rooftop terrace with city skyline views',
  },
  {
    id: 'urban-plaza-daytime',
    theme: 'bright energetic daytime brand activation, modern minimalist styling',
    venue: 'urban plaza surrounded by glass office towers',
  },
]

function logoById(id) {
  const logo = fixtures.logos.find(l => l.id === id)
  if (!logo) throw new Error(`Unknown logo id "${id}"`)
  return { ...logo, absPath: path.join(__dirname, 'fixtures', logo.file) }
}

function candidateSlug(c) {
  return `${c.provider === 'gemini' ? '' : c.provider + '-'}${c.model.replace(/[^a-z0-9.]+/gi, '-')}`
}

function buildCases({ logos, zoneSets, sceneCases, brandingCandidates, sceneCandidates }) {
  const cases = []
  for (const logoId of logos) {
    const logo = logoById(logoId)
    for (const zoneSetName of zoneSets) {
      for (const cand of brandingCandidates) {
        cases.push({
          caseId: `b_${logo.id}_${zoneSetName}_${candidateSlug(cand)}`,
          stage: 'branding',
          logo,
          zoneSetName,
          zones: ZONE_SETS[zoneSetName],
          candidate: cand,
        })
      }
    }
    for (const sceneCase of sceneCases) {
      for (const cand of sceneCandidates) {
        cases.push({
          caseId: `s_${logo.id}_${sceneCase.id}_${candidateSlug(cand)}`,
          stage: 'scene',
          logo,
          theme: sceneCase.theme,
          venue: sceneCase.venue,
          candidate: cand,
        })
      }
    }
  }
  return cases
}

const MATRICES = {
  // 2 cases + 1 shared branded-EV prereq (~$0.42, ~2 min) — quick sanity of both stages on the primary model
  smoke: () =>
    buildCases({
      logos: ['novacare-icon-text'],
      zoneSets: ['all'],
      sceneCases: [SCENE_TEST_CASES[0]],
      brandingCandidates: [BRANDING_CANDIDATES[0]],
      sceneCandidates: [SCENE_CANDIDATES[0]],
    }),

  // Full bake-off: 5 logos x (3 zone-sets x 3 branding candidates + 2 scene-cases x 2 scene candidates)
  default: () =>
    buildCases({
      logos: fixtures.logos.map(l => l.id),
      zoneSets: Object.keys(ZONE_SETS),
      sceneCases: SCENE_TEST_CASES,
      brandingCandidates: BRANDING_CANDIDATES,
      sceneCandidates: SCENE_CANDIDATES,
    }),

  // v2 scene-model validation: 5 logos x 2 scene-cases x 1 candidate (flash, the confirmed
  // bake-off winner) = exactly 10 scene images. Branding prerequisites auto-generate via
  // ev-bench.js's BrandedEvCache — no explicit branding cases needed here.
  sceneV2Validation: () =>
    buildCases({
      logos: fixtures.logos.map(l => l.id),
      zoneSets: [],
      sceneCases: SCENE_TEST_CASES,
      brandingCandidates: [],
      sceneCandidates: [SCENE_CANDIDATES[1]],
    }),
}

function getMatrix(name) {
  if (!MATRICES[name]) throw new Error(`Unknown matrix "${name}". Valid: ${Object.keys(MATRICES).join(', ')}`)
  return MATRICES[name]()
}

module.exports = { getMatrix, ZONE_SETS, BRANDING_CANDIDATES, SCENE_CANDIDATES, SCENE_TEST_CASES, fixtures, logoById }
