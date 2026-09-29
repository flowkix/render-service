'use strict'
const test = require('node:test')
const assert = require('node:assert')
const {
  GUIDES,
  isAllowedGuidesOrigin,
  validateGuideRequest,
  buildLeadRecord,
  buildWebhookPayload,
} = require('./guide-request')

const valid = {
  name: '  Ana Pérez ',
  email: 'ana@example.org',
  organization: ' Hope Charlotte ',
  audience: 'sponsor-renewal',
  website: '',
  utm_source: 'cltivate',
  utm_medium: 'qr',
  utm_campaign: 'nonprofit_sponsor_review',
}

test('valid request is trimmed and accepted', () => {
  const r = validateGuideRequest(valid)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.value.name, 'Ana Pérez')
  assert.strictEqual(r.value.organization, 'Hope Charlotte')
  assert.deepStrictEqual(r.value.utm, { source: 'cltivate', medium: 'qr', campaign: 'nonprofit_sponsor_review' })
})

test('honeypot filled → silently flagged as bot', () => {
  assert.deepStrictEqual(validateGuideRequest({ ...valid, website: 'http://spam' }), { honeypot: true })
})

test('missing organization is rejected', () => {
  const r = validateGuideRequest({ ...valid, organization: '' })
  assert.strictEqual(r.ok, false)
})

test('whitespace-only name is rejected', () => {
  assert.strictEqual(validateGuideRequest({ ...valid, name: '   ' }).ok, false)
})

test('unknown audience is rejected (no prototype keys)', () => {
  assert.strictEqual(validateGuideRequest({ ...valid, audience: 'constructor' }).error, 'unknown audience')
  assert.strictEqual(validateGuideRequest({ ...valid, audience: 'cltivate' }).error, 'unknown audience')
})

test('invalid email and oversize fields are rejected', () => {
  assert.strictEqual(validateGuideRequest({ ...valid, email: 'not-an-email' }).error, 'invalid email')
  assert.strictEqual(validateGuideRequest({ ...valid, organization: 'x'.repeat(201) }).ok, false)
})

test('non-string fields are rejected', () => {
  assert.strictEqual(validateGuideRequest({ ...valid, email: ['a@b.co'] }).ok, false)
})

test('missing UTMs become null, long UTMs are capped', () => {
  const r = validateGuideRequest({ ...valid, utm_source: undefined, utm_medium: '', utm_campaign: 'c'.repeat(300) })
  assert.strictEqual(r.value.utm.source, null)
  assert.strictEqual(r.value.utm.medium, null)
  assert.strictEqual(r.value.utm.campaign.length, 100)
})

test('lead record maps to the right source, event and PDF', () => {
  const { value } = validateGuideRequest(valid)
  const lead = buildLeadRecord(value)
  assert.strictEqual(lead.source, 'guide_sponsor_renewal')
  assert.strictEqual(lead.company_name, 'Hope Charlotte')
  assert.strictEqual(lead.met_at_event, 'CLTivate Community 2026')
  assert.strictEqual(lead.deck_url, GUIDES['sponsor-renewal'].pdfUrl)
  assert.strictEqual(lead.intake_data.utm.campaign, 'nonprofit_sponsor_review')
})

test('evergreen traffic (no utm_source) has no event', () => {
  const { value } = validateGuideRequest({ ...valid, audience: 'community-investment', utm_source: '' })
  const lead = buildLeadRecord(value)
  assert.strictEqual(lead.source, 'guide_community_investment')
  assert.strictEqual(lead.met_at_event, null)
  const payload = buildWebhookPayload(value, 'lead-1')
  assert.strictEqual(payload.guide_title, 'Make Your Community Investment Visible')
  assert.strictEqual(payload.lead_id, 'lead-1')
})

test('CORS allows production and this project\'s Vercel previews only', () => {
  assert.ok(isAllowedGuidesOrigin('https://www.snacketnow.com'))
  assert.ok(isAllowedGuidesOrigin('https://snacketnow.com'))
  assert.ok(isAllowedGuidesOrigin('https://snacket-website-git-feat-guides-build-flowkix.vercel.app'))
  assert.ok(isAllowedGuidesOrigin('https://snacket-website-a1b2c3d4e-flowkix.vercel.app'))
  assert.ok(!isAllowedGuidesOrigin('https://evil-snacket-website-x-flowkix.vercel.app'))
  assert.ok(!isAllowedGuidesOrigin('https://snacket-website-x-flowkix.vercel.app.evil.com'))
  assert.ok(!isAllowedGuidesOrigin('http://snacket-website-x-flowkix.vercel.app'))
  assert.ok(!isAllowedGuidesOrigin(undefined))
})
