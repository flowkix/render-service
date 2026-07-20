'use strict'
const path = require('path')
const fs = require('fs')

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'logos.json'), 'utf8'))

const ZONE_SETS = {
  all: 'all',
  center_only: ['center_disc'],
  doors_band: ['left_door_interior', 'right_door_interior', 'lower_band'],
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

function logoById(id) {
  const logo = fixtures.logos.find(l => l.id === id)
  if (!logo) throw new Error(`Unknown logo id "${id}"`)
  return { ...logo, absPath: path.join(__dirname, 'fixtures', logo.file) }
}

function candidateSlug(c) {
  return `${c.provider === 'gemini' ? '' : c.provider + '-'}${c.model.replace(/[^a-z0-9.]+/gi, '-')}`
}

function buildCases({ logos, zoneSets, presets, brandingCandidates, sceneCandidates }) {
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
    for (const presetId of presets) {
      for (const cand of sceneCandidates) {
        cases.push({
          caseId: `s_${logo.id}_${presetId}_${candidateSlug(cand)}`,
          stage: 'scene',
          logo,
          presetId,
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
      presets: ['P2'],
      brandingCandidates: [BRANDING_CANDIDATES[0]],
      sceneCandidates: [SCENE_CANDIDATES[0]],
    }),

  // Full bake-off: 5 logos x (3 zone-sets x 3 branding candidates + 3 presets x 2 scene candidates)
  default: () =>
    buildCases({
      logos: fixtures.logos.map(l => l.id),
      zoneSets: Object.keys(ZONE_SETS),
      presets: ['P1', 'P2', 'P3'],
      brandingCandidates: BRANDING_CANDIDATES,
      sceneCandidates: SCENE_CANDIDATES,
    }),
}

function getMatrix(name) {
  if (!MATRICES[name]) throw new Error(`Unknown matrix "${name}". Valid: ${Object.keys(MATRICES).join(', ')}`)
  return MATRICES[name]()
}

module.exports = { getMatrix, ZONE_SETS, BRANDING_CANDIDATES, SCENE_CANDIDATES, fixtures, logoById }
