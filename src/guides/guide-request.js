'use strict'

// SNACKET guide lead magnets (snacketnow.com/guides/*). Pure helpers for
// POST /guides/request: validation, lead-record shape and CORS origin check.
// The route in server.js stays thin and mirrors /clt-alliance/request-guide.
//
// Contract (agreed with the landing pages, see snacket-website
// docs/projects/cltivate-2026/BRIEF.md §6 + §11 D14/T21a):
//   body: { name, email, organization, audience, website /* honeypot */,
//           utm_source, utm_medium, utm_campaign,
//           title, works_with_sponsors, fits_where /* sponsor-renewal only, see SPONSORSHIP_FIELDS below */ }
//   200 { ok: true } · 400 { ok: false, error } · 429 · 500

// Static, pre-rendered PDFs served by the website itself — nothing is
// generated per request.
const GUIDES = {
  'sponsor-renewal': {
    source: 'guide_sponsor_renewal',
    title: 'Nonprofits Activation Guide',
    pdfUrl: 'https://www.snacketnow.com/guides/files/SNACKET_LeadMagnet_Nonprofit_EN_v2.pdf',
    landingUrl: 'https://www.snacketnow.com/guides/sponsor-renewal',
  },
  'community-investment': {
    source: 'guide_community_investment',
    title: 'Make Your Community Investment Visible',
    pdfUrl: 'https://www.snacketnow.com/guides/files/SNACKET_LeadMagnet_Corporate_EN_v1.pdf',
    landingUrl: 'https://www.snacketnow.com/guides/community-investment',
  },
}

// UTM source value → human-readable event name stored in leads.met_at_event.
// Unknown sources are still kept in intake_data.utm, just not promoted.
const EVENT_BY_UTM_SOURCE = {
  cltivate: 'CLTivate Community 2026',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Johanna's sponsorship-pivot rewrite (BRIEF §11 D14, 2026-10-07): the
// sponsor-renewal landing's lead form grows a 2nd step with 2 qualifying
// questions, plus a Title/Role field in step 1. Only required for
// 'sponsor-renewal' — community-investment (corporate) is untouched, still
// just name/email/organization, per BRIEF §11 ("corporate is NOT part of
// this pivot"). Enum values match the landing's <select> option values
// exactly, agreed with Codex in TASKS.md T21a before either side built
// against a guess.
const WORKS_WITH_SPONSORS_VALUES = new Set(['yes', 'not_currently', 'not_sure'])
const FITS_WHERE_VALUES = new Set([
  'gala', 'conference', 'community_program', 'fundraiser',
  'wellness_sports', 'volunteer_member', 'not_sure',
])

// Production site + this project's Vercel preview deployments
// (snacket-website-<hash|git-branch>-flowkix.vercel.app), so the full funnel
// can be tested on a preview URL before go-live.
const ALLOWED_ORIGINS = new Set(['https://snacketnow.com', 'https://www.snacketnow.com'])
const PREVIEW_ORIGIN_RE = /^https:\/\/snacket-website-[a-z0-9-]+-flowkix\.vercel\.app$/

function isAllowedGuidesOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false
  return ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN_RE.test(origin)
}

function cleanUtm(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 100)
  return trimmed === '' ? null : trimmed
}

// Returns { honeypot: true } for bots, { ok: false, error } for bad input,
// or { ok: true, value } with trimmed, validated fields.
function validateGuideRequest(body) {
  const b = body && typeof body === 'object' ? body : {}

  if (b.website && String(b.website).trim() !== '') return { honeypot: true }

  const { name, email, organization, audience } = b
  if (!name || !email || !organization || !audience) {
    return { ok: false, error: 'name, email, organization and audience are required' }
  }
  if (typeof name !== 'string' || typeof email !== 'string' || typeof organization !== 'string' || typeof audience !== 'string') {
    return { ok: false, error: 'name, email, organization and audience must be text' }
  }
  if (!Object.prototype.hasOwnProperty.call(GUIDES, audience)) {
    return { ok: false, error: 'unknown audience' }
  }

  const value = {
    name: name.trim(),
    email: email.trim(),
    organization: organization.trim(),
    audience,
    utm: {
      source: cleanUtm(b.utm_source),
      medium: cleanUtm(b.utm_medium),
      campaign: cleanUtm(b.utm_campaign),
    },
  }

  if (!value.name || !value.organization) {
    return { ok: false, error: 'name and organization are required' }
  }
  if (!EMAIL_RE.test(value.email)) return { ok: false, error: 'invalid email' }
  if (value.name.length > 200) return { ok: false, error: 'name must be 200 characters or fewer' }
  if (value.organization.length > 200) return { ok: false, error: 'organization must be 200 characters or fewer' }
  if (value.email.length > 320) return { ok: false, error: 'email must be 320 characters or fewer' }

  // Step-2 sponsorship fields: required for sponsor-renewal only (its 2-step
  // form), untouched/ignored for community-investment (BRIEF §11).
  if (audience === 'sponsor-renewal') {
    const { title, works_with_sponsors, fits_where } = b
    if (!title || typeof title !== 'string' || !title.trim()) {
      return { ok: false, error: 'title is required' }
    }
    const trimmedTitle = title.trim()
    if (trimmedTitle.length > 200) return { ok: false, error: 'title must be 200 characters or fewer' }
    if (typeof works_with_sponsors !== 'string' || !WORKS_WITH_SPONSORS_VALUES.has(works_with_sponsors)) {
      return { ok: false, error: 'works_with_sponsors must be one of: ' + [...WORKS_WITH_SPONSORS_VALUES].join(', ') }
    }
    if (typeof fits_where !== 'string' || !FITS_WHERE_VALUES.has(fits_where)) {
      return { ok: false, error: 'fits_where must be one of: ' + [...FITS_WHERE_VALUES].join(', ') }
    }
    value.title = trimmedTitle
    value.worksWithSponsors = works_with_sponsors
    value.fitsWhere = fits_where
  }

  return { ok: true, value }
}

// Row for SNACKET-OS `leads`. company_name is NOT NULL and is the Pipeline
// card heading, so the organization fills it (unlike the CLT brochure flow,
// which had no company field).
function buildLeadRecord(value) {
  const guide = GUIDES[value.audience]
  const record = {
    source: guide.source,
    stage: 'deck',
    deck_url: guide.pdfUrl,
    company_name: value.organization,
    prospect_name: value.name,
    prospect_email: value.email,
    met_at_event: EVENT_BY_UTM_SOURCE[value.utm.source] || null,
    intake_data: {
      guide: value.audience,
      guide_title: guide.title,
      landing_url: guide.landingUrl,
      utm: value.utm,
    },
  }
  // sponsor-renewal only (BRIEF §11 D14) — prospect_title is a real column
  // (NOT NULL-free, text), the 2 qualifying answers are intake-only, no new
  // columns needed for those.
  if (value.audience === 'sponsor-renewal') {
    record.prospect_title = value.title
    record.intake_data.works_with_sponsors = value.worksWithSponsors
    record.intake_data.fits_where = value.fitsWhere
  }
  return record
}

// Payload for the n8n `guide-request` webhook (delivery email + sales notify).
function buildWebhookPayload(value, leadId) {
  const guide = GUIDES[value.audience]
  const payload = {
    name: value.name,
    email: value.email,
    organization: value.organization,
    audience: value.audience,
    guide_title: guide.title,
    guide_url: guide.pdfUrl,
    lead_id: leadId,
    met_at_event: EVENT_BY_UTM_SOURCE[value.utm.source] || null,
    utm: value.utm,
  }
  // sponsor-renewal only -- not used by the immediate delivery email today,
  // but the day1/day7 follow-up workflow (TASKS.md T21c) reads leads.intake_data
  // directly, not this webhook payload, so this is forwarded for completeness
  // / future use, not a hard dependency of T21c.
  if (value.audience === 'sponsor-renewal') {
    payload.title = value.title
    payload.works_with_sponsors = value.worksWithSponsors
    payload.fits_where = value.fitsWhere
  }
  return payload
}

module.exports = {
  GUIDES,
  isAllowedGuidesOrigin,
  validateGuideRequest,
  buildLeadRecord,
  buildWebhookPayload,
}
