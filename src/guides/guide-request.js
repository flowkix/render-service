'use strict'

// SNACKET guide lead magnets (snacketnow.com/guides/*). Pure helpers for
// POST /guides/request: validation, lead-record shape and CORS origin check.
// The route in server.js stays thin and mirrors /clt-alliance/request-guide.
//
// Contract (agreed with the landing pages, see snacket-website
// docs/projects/cltivate-2026/BRIEF.md §6):
//   body: { name, email, organization, audience, website /* honeypot */,
//           utm_source, utm_medium, utm_campaign }
//   200 { ok: true } · 400 { ok: false, error } · 429 · 500

// Static, pre-rendered PDFs served by the website itself — nothing is
// generated per request.
const GUIDES = {
  'sponsor-renewal': {
    source: 'guide_sponsor_renewal',
    title: 'The Sponsor Renewal Equation',
    pdfUrl: 'https://www.snacketnow.com/guides/files/SNACKET_LeadMagnet_Nonprofit_EN_v1.pdf',
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

  return { ok: true, value }
}

// Row for SNACKET-OS `leads`. company_name is NOT NULL and is the Pipeline
// card heading, so the organization fills it (unlike the CLT brochure flow,
// which had no company field).
function buildLeadRecord(value) {
  const guide = GUIDES[value.audience]
  return {
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
}

// Payload for the n8n `guide-request` webhook (delivery email + sales notify).
function buildWebhookPayload(value, leadId) {
  const guide = GUIDES[value.audience]
  return {
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
}

module.exports = {
  GUIDES,
  isAllowedGuidesOrigin,
  validateGuideRequest,
  buildLeadRecord,
  buildWebhookPayload,
}
