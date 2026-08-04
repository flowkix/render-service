const express = require('express')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const net = require('net')
const dns = require('dns').promises
const { randomUUID, timingSafeEqual } = require('crypto')
const axios = require('axios')
const sharp = require('sharp')
const { renderReel } = require('./src/render')
const { getClient } = require('./src/supabase')
const { downloadFile, extFromUrl } = require('./src/downloader')
const { generateEvScene } = require('./src/ev-scene')
const { generateDeckPdf } = require('./src/deck-pdf')
const { generateCarouselSlide, generateOverlaySlide } = require('./src/slide-gen')
const { uploadImage } = require('./src/supabase')
const { runBranding, runFull, runSimpleFull } = require('./src/ev-engine')
const { checkRateLimit } = require('./src/ev-engine/rate-limiter')
const { checkSceneRateLimit } = require('./src/ev-engine/scene-rate-limiter')
const { checkSimpleSceneRateLimit } = require('./src/ev-engine/scene-simple-rate-limiter')
const { checkBrandingRateLimit } = require('./src/ev-engine/branding-rate-limiter')
const { checkGuideRateLimit } = require('./src/ev-engine/guide-rate-limiter')
const { checkBalloonRateLimit } = require('./src/ev-engine/balloon-rate-limiter')
const { uploadCltAlliancePreview, getSnacketOsClient } = require('./src/ev-engine/clt-alliance-upload')
const { checkResendLimit, storeCode, verifyCode } = require('./src/ev-engine/clt-alliance-verification')
const { MAX_INLINE_PAYLOAD_BYTES } = require('./src/ev-engine/assets')
const { generatePrintPiece } = require('./src/print-design/generate-print-piece')
const { loadWrapZonesConfig } = require('./src/ev-engine/wrap-zones')
const { renderWrapZones } = require('./src/ev-engine/wrap-render')
const { uploadEvWrapRender } = require('./src/ev-engine/wrap-storage')

const app = express()
// Exactly one trusted reverse proxy in front of this service (Railway's edge). Railway
// appends the real observed client IP to the RIGHT side of any X-Forwarded-For chain it
// forwards. Setting this to 1 makes Express (via proxy-addr) trust exactly one hop nearest
// the server and derive req.ip from the entry at that boundary — i.e. Railway's own
// appended value — while ignoring/stripping any attacker-injected entries further left in
// the chain. Verified empirically: with trust proxy=1, a header of "1.2.3.4, 9.9.9.9"
// (attacker-spoofed leftmost + Railway-appended rightmost) resolves req.ip to "9.9.9.9".
app.set('trust proxy', 1)
app.use(express.json({ limit: '1mb' }))

let supabaseStatus = 'checking'

async function checkSupabase() {
  try {
    const sb = getClient()
    const { error } = await sb.from('content_calendar').select('id').limit(1)
    if (error) {
      supabaseStatus = `FAILED: ${error.message}`
      console.error('[server] Supabase FAILED:', error.message)
    } else {
      supabaseStatus = 'connected'
      console.log('[server] Supabase OK')
      return // stop retrying
    }
  } catch (err) {
    supabaseStatus = `FAILED: ${err.message}`
    console.error('[server] Supabase check threw:', err.message)
  }
  // Retry every 10s until connected
  setTimeout(checkSupabase, 10000)
}

app.get('/health', (_, res) => res.json({
  ok: supabaseStatus === 'connected',
  ts: Date.now(),
  supabase: supabaseStatus,
  version: 'v2'
}))

// Extract first frame from any video URL. Returns JPEG bytes.
app.post('/thumbnail', async (req, res) => {
  const { video_url } = req.body
  if (!video_url) return res.status(400).json({ ok: false, error: 'video_url required' })

  let videoPath = null
  const outPath = path.join(os.tmpdir(), `thumb_${randomUUID()}.jpg`)
  try {
    const ext = extFromUrl(video_url)
    videoPath = await downloadFile(video_url, ext)

    await new Promise((resolve, reject) => {
      // Extract frame at 0.1s; fallback to frame 0 if video shorter than that
      const proc = spawn('ffmpeg', [
        '-i', videoPath,
        '-ss', '0.1',
        '-vframes', '1',
        '-vf', 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080',
        '-f', 'image2',
        '-update', '1',
        '-y', outPath,
      ])
      let stderr = ''
      proc.stderr.on('data', d => { stderr += d.toString() })
      proc.on('close', code => {
        if (code === 0) resolve()
        else reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-500)}`))
      })
      proc.on('error', err => reject(new Error(`FFmpeg spawn: ${err.message}`)))
    })

    const jpeg = fs.readFileSync(outPath)
    res.set('Content-Type', 'image/jpeg').send(jpeg)
  } catch (err) {
    console.error('[thumbnail]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    if (videoPath) try { fs.unlinkSync(videoPath) } catch (_) {}
    try { fs.unlinkSync(outPath) } catch (_) {}
  }
})

app.post('/generate-ev-scene', async (req, res) => {
  const { prospect_id, logo_url, company_name, activation_description, brand_concept } = req.body
  if (!prospect_id || !company_name) {
    return res.status(400).json({ ok: false, error: 'prospect_id and company_name required' })
  }
  try {
    console.log(`[ev-scene] start — ${prospect_id} / ${company_name}`)
    const result = await generateEvScene({
      prospectId: prospect_id,
      logoUrl: logo_url || '',
      companyName: company_name,
      activationDescription: activation_description || 'a brand activation event',
      brandConcept: brand_concept || 'Brand Activation',
    })
    console.log(`[ev-scene] done — ${result.ev_image_url}`)
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error(`[ev-scene] FAILED — ${prospect_id}:`, err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// SSRF guard for the public route below only. Not exported/shared — the internal
// /generate-ev-scene route and src/ev-engine/assets.js's fetchBuffer() are left
// untouched; this exists solely because /generate-ev-scene-public is unauthenticated
// and internet-facing, so a raw URL passthrough into fetchBuffer() would let anyone
// probe internal Railway network addresses or cloud metadata endpoints.
const PRIVATE_IPV4_RANGES = [
  { base: [10, 0, 0, 0], mask: 8 },
  { base: [172, 16, 0, 0], mask: 12 },
  { base: [192, 168, 0, 0], mask: 16 },
  { base: [127, 0, 0, 0], mask: 8 },
  { base: [169, 254, 0, 0], mask: 16 }, // link-local, incl. cloud metadata 169.254.169.254
  { base: [0, 0, 0, 0], mask: 8 },
]

function ipv4InRange(ip, base, maskBits) {
  const p = ip.split('.').map(Number)
  const baseInt = (base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3]
  const ipInt = (p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]
  const maskInt = maskBits === 0 ? 0 : (~0 << (32 - maskBits))
  return (ipInt & maskInt) === (baseInt & maskInt)
}

function isPrivateOrReservedIp(ip) {
  if (net.isIPv4(ip)) {
    return PRIVATE_IPV4_RANGES.some(r => ipv4InRange(ip, r.base, r.mask))
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateOrReservedIp(mapped[1])
    const firstHextet = parseInt(lower.split(':')[0] || '0', 16)
    if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true // fe80::/10 link-local
    if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true // fc00::/7 unique local
    return false
  }
  return true // unrecognized format — fail closed
}

// ev-engine's assets.js enforces MAX_INLINE_PAYLOAD_BYTES (imported above, currently 8MB) as
// a COMBINED base64-encoded ceiling across BOTH images sent to Gemini for this route: this
// logo + the fixed EV reference photo (zones.v1.json's referenceImage — a static Supabase
// asset, ~150KB raw / ~200KB base64 as of 2026-07). Base64 inflates raw bytes by ~4/3, so an
// 8MB RAW logo (the old value here) already base64-encodes to ~10.9MB — bigger than the
// entire 8MB combined ceiling before the reference image is even added. That let a near-cap
// logo pass this fetch-size guard cleanly, then fail downstream inside the Gemini provider's
// assertPayloadWithinLimit(), surfacing only as a generic "Generation failed" 500 (see the
// catch block in /generate-ev-scene-public, which now also special-cases that specific error).
//
// Budget math (derived from the real ceiling, not a duplicated magic number, so it can't
// drift if MAX_INLINE_PAYLOAD_BYTES ever changes):
//   - Reserve 1,000,000 base64 bytes for the reference image — ~5x its actual ~200KB base64
//     size today, covering that static asset being swapped for something larger later.
//   - Remaining base64 budget for the logo: MAX_INLINE_PAYLOAD_BYTES - 1,000,000 = 7,000,000
//   - Undo base64 inflation (x3/4) to get raw bytes: 7,000,000 * 3/4 = 5,250,000
//   - Apply an extra 20% safety margin for rounding/config drift: 5,250,000 * 0.8 = 4,200,000
// Worst case with this cap: a 4.2MB raw logo (~5.6MB base64) + ~200KB base64 reference =
// ~5.8MB combined, ~73% of the real 8MB ceiling — comfortable headroom, not a razor's edge.
const REFERENCE_IMAGE_BASE64_RESERVE_BYTES = 1_000_000
const MAX_LOGO_FETCH_BYTES = Math.floor(
  (MAX_INLINE_PAYLOAD_BYTES - REFERENCE_IMAGE_BASE64_RESERVE_BYTES) * (3 / 4) * 0.8
)

// Resolves the hostname ourselves and rejects private/reserved IPs BEFORE fetching,
// then fetches with a size cap and no auto-redirect-following (so a public-looking
// host can't 302 us to an internal address after the DNS check passes).
// Redirects ARE followed, but manually (see the recursive call below) — each hop's
// hostname goes back through the same DNS/private-IP check before being fetched,
// so a redirect chain that lands on an internal address is still caught. This is
// required in practice: e.g. Google's favicon service (used by the SNACKET website's
// domain-auto-detect logo picker) issues a real 301 to a gstatic.com host.
// Accepted residual risk: this re-resolves the hostname on the actual axios.get()
// rather than pinning the checked IP, so a DNS-rebinding attacker with a very low
// TTL could swap in a private address between the check and the fetch. Not pinned
// because this is a low-value target (marketing microsite logo fetch, not a
// security product) — if this ever needs closing, fetch by IP with a Host header
// override instead of re-passing the hostname.
async function fetchPublicUrlBuffer(urlString, redirectsLeft = 5) {
  let parsed
  try {
    parsed = new URL(urlString)
  } catch (_) {
    throw new Error('logo_source is not a valid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('logo_source must use http or https')
  }

  let addresses
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true })
  } catch (err) {
    throw new Error(`could not resolve logo_source host: ${err.message}`)
  }
  if (addresses.length === 0 || addresses.some(a => isPrivateOrReservedIp(a.address))) {
    throw new Error('logo_source resolves to a disallowed network address')
  }

  const resp = await axios.get(urlString, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxContentLength: MAX_LOGO_FETCH_BYTES,
    maxRedirects: 0,
    validateStatus: s => (s >= 200 && s < 300) || (s >= 300 && s < 400),
  })

  if (resp.status >= 200 && resp.status < 300) {
    return Buffer.from(resp.data)
  }

  if (resp.status >= 300 && resp.status < 400) {
    if (redirectsLeft <= 0) {
      throw new Error('logo_source redirected too many times')
    }
    const location = resp.headers.location
    if (!location) {
      throw new Error('logo_source redirected without a Location header')
    }
    let nextUrl
    try {
      nextUrl = new URL(location, urlString).href
    } catch (_) {
      throw new Error('logo_source redirected to an invalid URL')
    }
    return fetchPublicUrlBuffer(nextUrl, redirectsLeft - 1)
  }

  throw new Error(`logo_source fetch failed with status ${resp.status}`)
}

// Allowed browser origins for the public generator endpoint below. This route is called
// directly via fetch() from the public snacketnow.com site, a different origin from this
// Railway service — without an explicit Access-Control-Allow-Origin, browsers block the
// response entirely (confirmed live: every real end-user submission failed with a CORS
// preflight error, even though direct server-to-server requests to this route worked fine
// and masked the problem — CORS is a browser-only restriction, not enforced by curl/axios/etc).
const GENERATOR_ALLOWED_ORIGINS = new Set([
  'https://snacketnow.com',
  'https://www.snacketnow.com',
])

function applyCltAllianceCors(req, res) {
  const origin = req.headers.origin
  if (origin && GENERATOR_ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
  }
}

app.options('/generate-ev-scene-public', (req, res) => {
  applyCltAllianceCors(req, res)
  res.sendStatus(204)
})

app.options('/clt-alliance/send-code', (req, res) => {
  applyCltAllianceCors(req, res)
  res.sendStatus(204)
})

app.options('/clt-alliance/request-guide', (req, res) => {
  applyCltAllianceCors(req, res)
  res.sendStatus(204)
})

app.options('/balloons/request-addon', (req, res) => {
  applyCltAllianceCors(req, res)
  res.sendStatus(204)
})

// snacketnow.com/balloons — public balloon décor add-on request intake.
// Validates the code against a real, active catalog_items row (never trusts
// the client-supplied name), inserts into catalog_addon_requests, then
// notifies sales@snacketfoods.net via n8n. Mirrors /clt-alliance/request-guide's
// shape (honeypot + rate limit + best-effort DB insert + awaited email send).
app.post('/balloons/request-addon', async (req, res) => {
  applyCltAllianceCors(req, res)
  const { catalog_sku, name, email, quantity, honeypot } = req.body

  if (honeypot && String(honeypot).trim() !== '') {
    return res.json({ ok: true })
  }
  if (!catalog_sku || !name || !email || !quantity) {
    return res.status(400).json({ ok: false, error: 'catalog_sku, name, email and quantity are required' })
  }
  if (typeof name !== 'string' || typeof email !== 'string' || typeof catalog_sku !== 'string') {
    return res.status(400).json({ ok: false, error: 'name, email and catalog_sku must be text' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid email' })
  }
  if (name.length > 200) {
    return res.status(400).json({ ok: false, error: 'name must be 200 characters or fewer' })
  }
  if (email.length > 320) {
    return res.status(400).json({ ok: false, error: 'email must be 320 characters or fewer' })
  }
  const qty = Number(quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
    return res.status(400).json({ ok: false, error: 'quantity must be a whole number between 1 and 999' })
  }

  const clientIp = req.ip || 'unknown'
  try {
    checkBalloonRateLimit({ ip: clientIp, email })
  } catch (err) {
    return res.status(429).json({ ok: false, error: err.message })
  }

  let snacketOs
  try {
    snacketOs = getSnacketOsClient()
  } catch (err) {
    console.error('[balloon-addon] snacket-os client init FAILED:', err.message)
    return res.status(500).json({ ok: false, error: 'internal error' })
  }

  // Look up the real catalog row server-side — never trust a client-supplied
  // name/price for what gets written to the catalog request record.
  const { data: catalogItem, error: catalogError } = await snacketOs
    .from('catalog_items')
    .select('id, name, sku')
    .eq('sku', catalog_sku)
    .eq('category', 'addon_decor')
    .eq('is_active', true)
    .maybeSingle()

  if (catalogError) {
    console.error('[balloon-addon] catalog lookup FAILED:', catalogError.message)
    return res.status(500).json({ ok: false, error: 'internal error' })
  }
  if (!catalogItem) {
    return res.status(400).json({ ok: false, error: 'unknown or inactive design code' })
  }

  let requestId = null
  try {
    const { data: newRequest, error: insertError } = await snacketOs
      .from('catalog_addon_requests')
      .insert({
        catalog_item_id: catalogItem.id,
        prospect_name: name,
        prospect_email: email,
        quantity: qty,
        source: 'balloon_menu_public',
      })
      .select('id')
      .single()
    if (insertError) {
      console.error('[balloon-addon] request insert FAILED:', insertError.message)
    } else {
      requestId = newRequest.id
    }
  } catch (err) {
    console.error('[balloon-addon] request insert threw:', err.message)
  }

  // Awaited — the user is actively waiting to hear their request went through.
  try {
    await axios.post('https://flowait.app.n8n.cloud/webhook/snacket-balloon-addon-notify', {
      name, email, quantity: qty,
      catalog_sku: catalogItem.sku,
      catalog_item_name: catalogItem.name,
      request_id: requestId,
    }, { timeout: 15000 })
  } catch (err) {
    console.error('[balloon-addon] notify send FAILED:', err.message)

    // Same fire-and-forget failure-alert pattern as the CLT Alliance flows —
    // a public prospect has no reason to ever tell us this failed.
    axios.post('https://flowait.app.n8n.cloud/webhook/clt-alliance-failure-alert', {
      name, email, error_message: `[balloon-addon] ${err.message}`.slice(0, 2000), lead_id: requestId,
      occurred_at: new Date().toISOString(),
    }, { timeout: 10000 }).catch(alertErr => {
      console.error('[balloon-addon] failure alert FAILED:', alertErr.message)
    })

    if (!requestId) {
      // Neither the DB record nor the notification landed — this is a real
      // failure the user should see and retry, not a false-positive success.
      return res.status(500).json({ ok: false, error: 'Could not send your request — please try again.' })
    }
    // The request IS recorded in catalog_addon_requests even though the email
    // notification failed — staff can still find it there, so tell the user
    // it succeeded rather than prompting a confusing duplicate submission.
  }

  res.json({ ok: true })
})

// Static, pre-generated asset (see scripts/generate-clt-alliance-guide.js) — this route
// never generates anything per-request, it only logs the lead and emails the link.
const CLT_ALLIANCE_GUIDE_URL = 'https://noielmbqxmrnkmysqyek.supabase.co/storage/v1/object/public/clt-alliance-generator/guide/coffee-connect-guide.pdf'

app.post('/clt-alliance/request-guide', async (req, res) => {
  applyCltAllianceCors(req, res)
  const { name, email, honeypot } = req.body

  if (honeypot && String(honeypot).trim() !== '') {
    return res.json({ ok: true })
  }
  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'name and email are required' })
  }
  if (typeof name !== 'string' || typeof email !== 'string') {
    return res.status(400).json({ ok: false, error: 'name and email must be text' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid email' })
  }
  if (name.length > 200) {
    return res.status(400).json({ ok: false, error: 'name must be 200 characters or fewer' })
  }
  if (email.length > 320) {
    return res.status(400).json({ ok: false, error: 'email must be 320 characters or fewer' })
  }

  const clientIp = req.ip || 'unknown'
  try {
    checkGuideRateLimit({ ip: clientIp, email })
  } catch (err) {
    return res.status(429).json({ ok: false, error: err.message })
  }

  let snacketOs
  try {
    snacketOs = getSnacketOsClient()
  } catch (err) {
    console.error('[clt-alliance-guide] snacket-os client init FAILED:', err.message)
    return res.status(500).json({ ok: false, error: 'internal error' })
  }

  // Thin lead — no logo/company fields here, so this goes straight into the shared
  // Pipeline `leads` table with a dedicated source, no separate audit table (unlike
  // the EV-preview generator's clt_alliance_leads, which stores richer per-generation
  // data this flow doesn't have).
  let leadId = null
  try {
    const { data: existingLead } = await snacketOs
      .from('leads')
      .select('id')
      .eq('prospect_email', email)
      .eq('source', 'clt_alliance_brochure')
      .maybeSingle()

    if (existingLead) {
      leadId = existingLead.id
      await snacketOs.from('leads').update({ company_name: name, prospect_name: name }).eq('id', leadId)
    } else {
      const { data: newLead, error: insertError } = await snacketOs
        .from('leads')
        .insert({
          source: 'clt_alliance_brochure',
          stage: 'deck',
          deck_url: CLT_ALLIANCE_GUIDE_URL,
          // leads.company_name is NOT NULL and is what Pipeline renders as each
          // card's heading (SNACKET-OS/src/app/(dashboard)/leads/page.tsx,
          // LeadCard.tsx) — this flow never collects a company, so the prospect's
          // own name doubles as the card's identifying label instead of a blank
          // or duplicate-across-every-card placeholder.
          company_name: name,
          prospect_name: name,
          prospect_email: email,
        })
        .select('id')
        .single()
      if (insertError) {
        console.error('[clt-alliance-guide] lead insert FAILED:', insertError.message)
      } else {
        leadId = newLead.id
      }
    }
  } catch (err) {
    console.error('[clt-alliance-guide] lead bridge FAILED:', err.message)
  }

  // Awaited — the user is actively waiting to hear their guide is on the way, so a
  // genuine send failure must surface as an error, not a false-positive success.
  try {
    await axios.post('https://flowait.app.n8n.cloud/webhook/clt-alliance-brochure-request', {
      name, email, guide_url: CLT_ALLIANCE_GUIDE_URL, lead_id: leadId,
    }, { timeout: 15000 })
  } catch (err) {
    console.error('[clt-alliance-guide] email send FAILED:', err.message)

    // Real prospects hit this on the public microsite and have no reason to ever tell
    // us — mirrors the /generate-ev-scene-public failure-alert pattern (spec C3.5).
    // Fire-and-forget: never let a slow/failed alert affect the user-facing error response.
    axios.post('https://flowait.app.n8n.cloud/webhook/clt-alliance-failure-alert', {
      name, email, error_message: err.message.slice(0, 2000), lead_id: leadId,
      occurred_at: new Date().toISOString(),
    }, { timeout: 10000 }).catch(alertErr => {
      console.error('[clt-alliance-guide] failure alert FAILED:', alertErr.message)
    })

    return res.status(500).json({ ok: false, error: 'Could not send your guide — please try again.' })
  }

  res.json({ ok: true })
})

// Sends a one-time verification code to the prospect's own email BEFORE any generation
// runs, so a fake/typo'd email can never trigger (and never see) a real branding
// generation. /generate-ev-scene-public below requires and consumes this code.
app.post('/clt-alliance/send-code', async (req, res) => {
  applyCltAllianceCors(req, res)
  const { name, company, email, honeypot } = req.body

  if (honeypot && String(honeypot).trim() !== '') {
    // Bot caught by the honeypot — respond as if successful, don't tip it off.
    return res.json({ ok: true })
  }
  if (!name || !company || !email) {
    return res.status(400).json({ ok: false, error: 'name, company, and email are required' })
  }
  if (typeof name !== 'string' || typeof company !== 'string' || typeof email !== 'string') {
    return res.status(400).json({ ok: false, error: 'name, company, and email must be text' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid email' })
  }
  if (name.length > 200 || company.length > 200) {
    return res.status(400).json({ ok: false, error: 'name and company must be 200 characters or fewer' })
  }
  if (email.length > 320) {
    return res.status(400).json({ ok: false, error: 'email must be 320 characters or fewer' })
  }

  try {
    checkResendLimit(email)
  } catch (err) {
    return res.status(429).json({ ok: false, error: err.message })
  }

  const code = storeCode(email)

  // Awaited (unlike the sales/failure notifications below) — the user is actively
  // waiting on this email to arrive, so we must know if it genuinely failed to send.
  try {
    await axios.post('https://flowait.app.n8n.cloud/webhook/clt-alliance-send-code', {
      name, company, email, code,
    }, { timeout: 15000 })
  } catch (err) {
    console.error('[clt-alliance] verification code email FAILED to send:', err.message)
    return res.status(500).json({ ok: false, error: 'Could not send your verification code — please try again.' })
  }

  res.json({ ok: true })
})

// Public, unauthenticated — protected by contact-gate + rate limiting instead of auth.
// Branding-stage-only by design (2026-07-21 decision): no scene/staff generation here,
// sidesteps the known scene-stage staff-guest interaction bug entirely. See
// docs/lessons/failed-approaches.md "EV IMAGE ENGINE V3 — scene-stage staff/interaction prompt wording".
app.post('/generate-ev-scene-public', async (req, res) => {
  applyCltAllianceCors(req, res)
  const { name, company, email, logo_source, honeypot, verification_code } = req.body

  if (honeypot && String(honeypot).trim() !== '') {
    // Bot caught by the honeypot — respond as if successful, don't tip it off.
    return res.json({ ok: true, image_url: null })
  }
  if (!name || !company || !email || !logo_source || !verification_code) {
    return res.status(400).json({ ok: false, error: 'name, company, email, logo_source, and verification_code are required' })
  }
  if (typeof name !== 'string' || typeof company !== 'string' || typeof email !== 'string') {
    return res.status(400).json({ ok: false, error: 'name, company, and email must be text' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid email' })
  }
  if (name.length > 200 || company.length > 200) {
    return res.status(400).json({ ok: false, error: 'name and company must be 200 characters or fewer' })
  }
  if (email.length > 320) {
    return res.status(400).json({ ok: false, error: 'email must be 320 characters or fewer' })
  }

  // Checked before rate limiting / lead creation / generation — a wrong-code guess must
  // never burn the real per-day generation allowance or touch Supabase.
  const verification = verifyCode(email, verification_code)
  if (!verification.valid) {
    return res.status(400).json({ ok: false, error: verification.error })
  }

  // req.ip is proxy-aware once `trust proxy` is set (see app.set('trust proxy', 1) above) —
  // it resolves through Railway's trusted hop rather than trusting the raw, spoofable
  // leftmost X-Forwarded-For entry an attacker could inject.
  const clientIp = req.ip || 'unknown'

  const leadId = randomUUID()
  let snacketOs
  try {
    snacketOs = getSnacketOsClient()
  } catch (err) {
    console.error(`[clt-alliance] snacket-os client init FAILED — ${leadId}:`, err.message)
    return res.status(500).json({ ok: false, error: 'internal error' })
  }

  let ipHash
  try {
    ;({ ipHash } = checkRateLimit({ ip: clientIp, email }))
  } catch (err) {
    return res.status(429).json({ ok: false, error: err.message })
  }

  // Insert the lead row as 'pending' before generating, so a crash mid-generation
  // still leaves an auditable record.
  const { error: insertError } = await snacketOs.from('clt_alliance_leads').insert({
    id: leadId,
    contact_name: name,
    contact_company: company,
    contact_email: email,
    logo_source_label: String(logo_source).slice(0, 200),
    status: 'pending',
    ip_hash: ipHash,
    user_agent: req.headers['user-agent'] || null,
  })
  if (insertError) {
    console.error(`[clt-alliance] lead insert FAILED — ${leadId}:`, insertError.message)
    return res.status(500).json({ ok: false, error: 'internal error' })
  }

  // Mirror into the shared SNACKET-OS Pipeline `leads` table (source='clt_alliance')
  // so this shows up in Pipeline like any other Stage A lead. clt_alliance_leads
  // stays as the detailed audit/rate-limit record — this is just a summary row.
  // Scoped to source='clt_alliance' on the email lookup so a shared email with a
  // lead from a different source is never silently overwritten (same dedup pattern
  // as pitch-elevator-ingest). Best-effort: a failure here must not break the actual
  // image-generation feature, so errors are logged, not thrown.
  let pipelineLeadId = null
  try {
    const { data: existingPipelineLead } = await snacketOs
      .from('leads')
      .select('id')
      .eq('prospect_email', email)
      .eq('source', 'clt_alliance')
      .maybeSingle()

    if (existingPipelineLead) {
      pipelineLeadId = existingPipelineLead.id
      await snacketOs.from('leads')
        .update({ company_name: company, prospect_name: name })
        .eq('id', pipelineLeadId)
    } else {
      const { data: newPipelineLead, error: pipelineInsertError } = await snacketOs
        .from('leads')
        .insert({
          source: 'clt_alliance',
          stage: 'deck',
          company_name: company,
          prospect_name: name,
          prospect_email: email,
        })
        .select('id')
        .single()
      if (pipelineInsertError) {
        console.error(`[clt-alliance] pipeline lead insert FAILED — ${leadId}:`, pipelineInsertError.message)
      } else {
        pipelineLeadId = newPipelineLead.id
      }
    }
  } catch (err) {
    console.error(`[clt-alliance] pipeline lead bridge FAILED — ${leadId}:`, err.message)
  }

  try {
    console.log(`[clt-alliance] start — ${leadId} / ${company}`)

    let logoBuffer
    if (/^data:/.test(logo_source)) {
      const base64 = logo_source.split(',')[1]
      if (!base64) throw new Error('malformed data URL')
      logoBuffer = Buffer.from(base64, 'base64')
    } else if (/^https?:\/\//i.test(logo_source)) {
      // Fetched ourselves (DNS-resolved + private-IP-checked + size-capped) rather than
      // passed through as a raw URL string — this route is public/unauthenticated, so
      // runBranding always gets a Buffer here, never a URL for fetchBuffer to dereference.
      logoBuffer = await fetchPublicUrlBuffer(logo_source)
    } else {
      throw new Error('logo_source must be a data: URL or an http(s) URL')
    }

    const { buffer } = await runBranding({
      companyName: company,
      logoSource: logoBuffer,
      zones: 'all',
    })

    // Gemini's returned buffer isn't guaranteed to actually be PNG-encoded (it can come
    // back as JPEG bytes) — normalize to real PNG before upload, matching ev-scene.js's
    // established convention (sharp(...).png()) for this same engine's output.
    const pngBuffer = await sharp(buffer).png().toBuffer()

    const imageUrl = await uploadCltAlliancePreview(pngBuffer, leadId)

    await snacketOs.from('clt_alliance_leads')
      .update({ status: 'completed', ev_image_url: imageUrl })
      .eq('id', leadId)

    if (pipelineLeadId) {
      await snacketOs.from('leads')
        .update({ ev_image_url: imageUrl })
        .eq('id', pipelineLeadId)
    }

    // Fire-and-forget notification to sales — the n8n webhook responds immediately
    // (responseMode: onReceived) and this must never delay or fail the user-facing
    // response, which already has its own generated preview regardless of this call.
    axios.post('https://flowait.app.n8n.cloud/webhook/clt-alliance-sales-notify', {
      name, company, email, image_url: imageUrl, lead_id: pipelineLeadId || leadId,
    }, { timeout: 10000 }).catch(err => {
      console.error(`[clt-alliance] sales notification FAILED — ${leadId}:`, err.message)
    })

    console.log(`[clt-alliance] done — ${leadId} / ${imageUrl}`)
    res.json({ ok: true, image_url: imageUrl, lead_id: leadId })
  } catch (err) {
    console.error(`[clt-alliance] FAILED — ${leadId}:`, err.message)
    await snacketOs.from('clt_alliance_leads')
      .update({ status: 'failed', error_message: err.message.slice(0, 2000) })
      .eq('id', leadId)

    // Real prospects hit this on the public microsite and have no reason to ever tell
    // us — this is the only signal we get. Fire-and-forget, same pattern as the sales
    // notification: never let a slow/failed alert affect the user-facing error response.
    axios.post('https://flowait.app.n8n.cloud/webhook/clt-alliance-failure-alert', {
      name, company, email, error_message: err.message.slice(0, 2000), lead_id: leadId,
      occurred_at: new Date().toISOString(),
    }, { timeout: 10000 }).catch(alertErr => {
      console.error(`[clt-alliance] failure alert FAILED — ${leadId}:`, alertErr.message)
    })

    // Defense-in-depth alongside the MAX_LOGO_FETCH_BYTES sizing above: if the combined
    // base64 payload guard in assets.js's assertPayloadWithinLimit() still trips (e.g. the
    // reference image config changes later), surface a specific, actionable message instead
    // of the generic one below.
    const isPayloadTooLarge = /base64 exceeds/.test(err.message)
    const userError = isPayloadTooLarge
      ? 'Your logo image is too large to process — please use a smaller file and try again.'
      : 'Generation failed — our team has been notified.'
    res.status(500).json({ ok: false, error: userError })
  }
})

// Constant-time string comparison for shared-secret checks — plain !== leaks timing
// info about how many leading bytes match. Lengths are compared first (throwing that
// away as a much smaller side-channel than leaking prefix-match length is the standard
// accepted mitigation), and a missing header (undefined) is coerced to '' rather than
// being passed to Buffer.from(undefined), which would throw.
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a || ''))
  const bufB = Buffer.from(String(b || ''))
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Authenticated, internal — for FLOWKIX workflows (n8n, HUB, future client microsites)
// that need the full branding+scene pipeline via HTTP. Not public: requires a shared
// secret header. Per-source rate limiting (not IP/email — this is an internal,
// authenticated route with known callers) prevents one workflow's burst of generations
// from starving or destabilizing generation for another concurrent caller.
app.post('/generate-ev-scene-v2', async (req, res) => {
  const secret = req.headers['x-render-secret']
  if (!process.env.RENDER_SECRET) {
    console.error('[scene-v2] RENDER_SECRET env var not set — refusing all requests')
    return res.status(500).json({ ok: false, error: 'internal error' })
  }
  if (!safeCompare(secret, process.env.RENDER_SECRET)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  const { source, company_name, logo_source, theme, venue, table_count, led_poster_content } = req.body
  if (!source || !company_name || !logo_source || !theme || !venue) {
    return res.status(400).json({
      ok: false,
      error: 'source, company_name, logo_source, theme, and venue are required',
    })
  }
  if (table_count !== undefined && (!Number.isInteger(table_count) || table_count < 0)) {
    return res.status(400).json({ ok: false, error: 'table_count must be a non-negative integer if provided' })
  }

  try {
    checkSceneRateLimit({ source })
  } catch (err) {
    return res.status(429).json({ ok: false, error: err.message })
  }

  // uploadImage() (src/supabase.js) reads from a LOCAL FILE PATH via fs.createReadStream —
  // it does not accept a Buffer directly. Write to a temp file first, same pattern already
  // used by the /thumbnail route above (os.tmpdir() + randomUUID(), cleaned up in `finally`).
  const tmpPath = path.join(os.tmpdir(), `scene-v2_${randomUUID()}.png`)
  try {
    console.log(`[scene-v2] start — ${source} / ${company_name}`)

    // Resolve logo_source to a Buffer ourselves, same as /generate-ev-scene-public above —
    // never pass the raw string through to runFull/runBranding, since fetchBuffer() in
    // src/ev-engine/assets.js treats any non-http(s) string as a LOCAL FILE PATH and reads
    // it off disk. This route is authenticated but still accepts arbitrary caller input in
    // logo_source, so without this resolution step it's an arbitrary local-file-read
    // primitive (e.g. logo_source: "../../.env"). Reuses the existing SSRF-safe
    // fetchPublicUrlBuffer() rather than duplicating its DNS/private-IP/redirect logic.
    let logoBuffer
    if (/^data:/.test(logo_source)) {
      const base64 = logo_source.split(',')[1]
      if (!base64) throw new Error('malformed data URL')
      logoBuffer = Buffer.from(base64, 'base64')
    } else if (/^https?:\/\//i.test(logo_source)) {
      logoBuffer = await fetchPublicUrlBuffer(logo_source)
    } else {
      throw new Error('logo_source must be a data: URL or an http(s) URL')
    }

    const { scene } = await runFull({
      companyName: company_name,
      logoSource: logoBuffer,
      theme,
      venue,
      tableCount: table_count,
      ledPosterContent: led_poster_content,
    })
    fs.writeFileSync(tmpPath, scene.buffer)
    const storagePath = `scene-v2/${source}/${randomUUID()}.png`
    const imageUrl = await uploadImage(tmpPath, 'snacket-assets', storagePath)
    console.log(`[scene-v2] done — ${source} / ${imageUrl}`)
    res.json({ ok: true, image_url: imageUrl })
  } catch (err) {
    console.error(`[scene-v2] FAILED — ${source}:`, err.message)
    res.status(500).json({ ok: false, error: 'Generation failed — our team has been notified.' })
  } finally {
    try { fs.unlinkSync(tmpPath) } catch (_) {}
  }
})

// Authenticated, internal — same auth/rate-limit/upload pattern as /generate-ev-scene-v2,
// for the "Object with Logo in Simple Scene Generator" capability: branded EV + staff in a
// simple, unstaged environment, with NO brand-activation infrastructure. Uses its own rate
// limiter instance (scene-simple-rate-limiter.js) so this capability's quota is independent
// of /generate-ev-scene-v2's, even if a caller reuses the same `source` value for both.
app.post('/generate-ev-scene-simple', async (req, res) => {
  const secret = req.headers['x-render-secret']
  if (!process.env.RENDER_SECRET) {
    console.error('[scene-simple] RENDER_SECRET env var not set — refusing all requests')
    return res.status(500).json({ ok: false, error: 'internal error' })
  }
  if (!safeCompare(secret, process.env.RENDER_SECRET)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  const { source, company_name, logo_source, theme, venue } = req.body
  if (!source || !company_name || !logo_source || !theme || !venue) {
    return res.status(400).json({
      ok: false,
      error: 'source, company_name, logo_source, theme, and venue are required',
    })
  }

  try {
    checkSimpleSceneRateLimit({ source })
  } catch (err) {
    return res.status(429).json({ ok: false, error: err.message })
  }

  const tmpPath = path.join(os.tmpdir(), `scene-simple_${randomUUID()}.png`)
  try {
    console.log(`[scene-simple] start — ${source} / ${company_name}`)

    // Resolve logo_source to a Buffer ourselves — same SSRF-safe pattern as
    // /generate-ev-scene-v2 (see that route's comment for why: fetchBuffer() in
    // src/ev-engine/assets.js treats any non-http(s) string as a LOCAL FILE PATH).
    let logoBuffer
    if (/^data:/.test(logo_source)) {
      const base64 = logo_source.split(',')[1]
      if (!base64) throw new Error('malformed data URL')
      logoBuffer = Buffer.from(base64, 'base64')
    } else if (/^https?:\/\//i.test(logo_source)) {
      logoBuffer = await fetchPublicUrlBuffer(logo_source)
    } else {
      throw new Error('logo_source must be a data: URL or an http(s) URL')
    }

    const { scene } = await runSimpleFull({
      companyName: company_name,
      logoSource: logoBuffer,
      theme,
      venue,
    })
    fs.writeFileSync(tmpPath, scene.buffer)
    const storagePath = `scene-simple/${source}/${randomUUID()}.png`
    const imageUrl = await uploadImage(tmpPath, 'snacket-assets', storagePath)
    console.log(`[scene-simple] done — ${source} / ${imageUrl}`)
    res.json({ ok: true, image_url: imageUrl })
  } catch (err) {
    console.error(`[scene-simple] FAILED — ${source}:`, err.message)
    res.status(500).json({ ok: false, error: 'Generation failed — our team has been notified.' })
  } finally {
    try { fs.unlinkSync(tmpPath) } catch (_) {}
  }
})

// Standalone route for the "Object with Logo Generator" capability — logo applied
// to the EV, white background, no scene. Previously only reachable embedded inside
// /generate-ev-scene-public (CLT Alliance's public route); this gives it its own
// entry point, symmetric with /generate-ev-scene-v2 and /generate-ev-scene-simple,
// so no future change to CLT Alliance's route can accidentally affect this
// capability's availability. Calls the existing, unmodified runBranding — no engine
// code changes.
app.post('/generate-ev-branding', async (req, res) => {
  const secret = req.headers['x-render-secret']
  if (!process.env.RENDER_SECRET) {
    console.error('[branding] RENDER_SECRET env var not set — refusing all requests')
    return res.status(500).json({ ok: false, error: 'internal error' })
  }
  if (!safeCompare(secret, process.env.RENDER_SECRET)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  const { source, company_name, logo_source } = req.body
  if (!source || !company_name || !logo_source) {
    return res.status(400).json({
      ok: false,
      error: 'source, company_name, and logo_source are required',
    })
  }

  try {
    checkBrandingRateLimit({ source })
  } catch (err) {
    return res.status(429).json({ ok: false, error: err.message })
  }

  const tmpPath = path.join(os.tmpdir(), `branding_${randomUUID()}.png`)
  try {
    console.log(`[branding] start — ${source} / ${company_name}`)

    let logoBuffer
    if (/^data:/.test(logo_source)) {
      const base64 = logo_source.split(',')[1]
      if (!base64) throw new Error('malformed data URL')
      logoBuffer = Buffer.from(base64, 'base64')
    } else if (/^https?:\/\//i.test(logo_source)) {
      logoBuffer = await fetchPublicUrlBuffer(logo_source)
    } else {
      throw new Error('logo_source must be a data: URL or an http(s) URL')
    }

    const { buffer } = await runBranding({
      companyName: company_name,
      logoSource: logoBuffer,
      zones: 'all',
    })

    // Gemini's returned buffer isn't guaranteed to actually be PNG-encoded — normalize
    // before upload, same as /generate-ev-scene-public does for this same underlying
    // runBrandingStage output.
    const pngBuffer = await sharp(buffer).png().toBuffer()
    fs.writeFileSync(tmpPath, pngBuffer)
    const storagePath = `branding/${source}/${randomUUID()}.png`
    const imageUrl = await uploadImage(tmpPath, 'snacket-assets', storagePath)
    console.log(`[branding] done — ${source} / ${imageUrl}`)
    res.json({ ok: true, image_url: imageUrl })
  } catch (err) {
    console.error(`[branding] FAILED — ${source}:`, err.message)
    res.status(500).json({ ok: false, error: 'Generation failed — our team has been notified.' })
  } finally {
    try { fs.unlinkSync(tmpPath) } catch (_) {}
  }
})

// Authenticated, internal — same X-Render-Secret pattern as /generate-ev-scene-v2. Composites
// N 'sharp'-mode zones (already-calibrated cornerPoints from wrap-zones.v1.json) onto one base
// vehicle photo in a single call. Rejects the whole request if any requested zone doesn't
// exist, isn't visible in the given angle, or is compositingMode 'generative' — the caller
// (HUB's compose route) is responsible for routing generative zones to the separate Edge
// Function instead, never mixing the two in one call here.
app.post('/generate-ev-wrap-sharp', async (req, res) => {
  const secret = req.headers['x-render-secret']
  if (!process.env.RENDER_SECRET) {
    console.error('[wrap-sharp] RENDER_SECRET env var not set — refusing all requests')
    return res.status(500).json({ ok: false, error: 'internal error' })
  }
  if (!safeCompare(secret, process.env.RENDER_SECRET)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  const { lead_id, vehicle_slug, angle, base_image_url, zones } = req.body
  if (!lead_id || !vehicle_slug || !angle || !base_image_url || !Array.isArray(zones) || zones.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'lead_id, vehicle_slug, angle, base_image_url, and a non-empty zones[] array are required',
    })
  }
  for (const z of zones) {
    if (!z || typeof z.zone_id !== 'string' || !Array.isArray(z.asset_urls) || z.asset_urls.length < 1 || z.asset_urls.length > 2) {
      return res.status(400).json({ ok: false, error: 'each zones[] entry needs zone_id and asset_urls (1 or 2 http(s) URLs)' })
    }
  }

  try {
    console.log(`[wrap-sharp] start — lead=${lead_id} vehicle=${vehicle_slug} angle=${angle} zones=${zones.length}`)
    const wrapZonesConfig = loadWrapZonesConfig()

    // Resolved via the same SSRF-safe fetcher as /generate-ev-scene-v2 above — this route is
    // authenticated but still accepts arbitrary caller-supplied URLs (asset_urls, base_image_url).
    const baseImageBuffer = await fetchPublicUrlBuffer(base_image_url)
    const zoneInputs = []
    for (const z of zones) {
      const assetBuffers = []
      for (const url of z.asset_urls) {
        assetBuffers.push(await fetchPublicUrlBuffer(url))
      }
      zoneInputs.push({ zoneId: z.zone_id, assetBuffers })
    }

    const { buffer, appliedZoneIds } = await renderWrapZones({
      vehicleSlug: vehicle_slug,
      angle,
      baseImageBuffer,
      zoneInputs,
      wrapZonesConfig,
    })

    const storagePath = await uploadEvWrapRender(buffer, lead_id, vehicle_slug, angle)
    console.log(`[wrap-sharp] done — lead=${lead_id} zones=${appliedZoneIds.join(',')}`)
    res.json({ ok: true, image_url: storagePath, applied_zone_ids: appliedZoneIds })
  } catch (err) {
    console.error(`[wrap-sharp] FAILED — lead=${lead_id}:`, err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Authenticated, internal — read-only exposure of wrap-zones.v1.json's per-vehicle zone
// catalog (same X-Render-Secret pattern). HUB's wrap-catalog route (Task 8) calls this to
// enrich each wrap_catalog_items row with its zone definitions, and the compose route
// (Task 13) calls it to know each selected zone's compositingMode (sharp vs generative).
app.get('/ev-wrap-zones/:vehicleSlug', (req, res) => {
  const secret = req.headers['x-render-secret']
  if (!process.env.RENDER_SECRET) {
    console.error('[ev-wrap-zones] RENDER_SECRET env var not set — refusing all requests')
    return res.status(500).json({ ok: false, error: 'internal error' })
  }
  if (!safeCompare(secret, process.env.RENDER_SECRET)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
  try {
    const wrapZonesConfig = loadWrapZonesConfig()
    const vehicle = wrapZonesConfig.vehicles[req.params.vehicleSlug]
    if (!vehicle) {
      return res.status(404).json({ ok: false, error: `Unknown vehicle "${req.params.vehicleSlug}"` })
    }
    res.json({ ok: true, vehicle_slug: req.params.vehicleSlug, angles: vehicle.angles || {}, zones: vehicle.zones || {} })
  } catch (err) {
    console.error('[ev-wrap-zones] FAILED:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/generate-pdf', async (req, res) => {
  const { deck_url, prospect_id } = req.body
  if (!deck_url || !prospect_id) {
    return res.status(400).json({ ok: false, error: 'deck_url and prospect_id required' })
  }
  try {
    console.log(`[deck-pdf] start — ${prospect_id} / ${deck_url}`)
    const result = await generateDeckPdf({ deckUrl: deck_url, prospectId: prospect_id })
    console.log(`[deck-pdf] done — ${result.pdf_url}`)
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error(`[deck-pdf] FAILED — ${prospect_id}:`, err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/generate-print-piece', async (req, res) => {
  const { template_key, content, palette, photo_urls, client_id } = req.body
  if (!template_key || !content || !palette || !photo_urls || !client_id) {
    return res.status(400).json({ ok: false, error: 'template_key, content, palette, photo_urls, and client_id required' })
  }
  try {
    console.log(`[print-piece] start — ${client_id} / ${template_key}`)
    const result = await generatePrintPiece({ template_key, content, palette, photo_urls, client_id })
    console.log(`[print-piece] done — front=${result.front_pdf_url} back=${result.back_pdf_url}`)
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error(`[print-piece] FAILED — ${client_id}:`, err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/generate-carousel-slide', async (req, res) => {
  const { photo_url, title, body, cta, post_id, slide_index } = req.body
  if (!photo_url || post_id === undefined || slide_index === undefined) {
    return res.status(400).json({ ok: false, error: 'photo_url, post_id, and slide_index required' })
  }
  let srcPath = null
  let outPath = null
  try {
    console.log(`[carousel-slide] start — post=${post_id} slide=${slide_index}`)
    srcPath = await downloadFile(photo_url, extFromUrl(photo_url))
    outPath = await generateCarouselSlide(srcPath, { title, body, cta })

    const storagePath = `a1b2c3d4-0001-0001-0001-000000000001/rendered/${post_id}-slide-${slide_index}.png`
    const imageUrl = await uploadImage(outPath, 'assets', storagePath)

    console.log(`[carousel-slide] done — ${imageUrl}`)
    res.json({ ok: true, image_url: imageUrl })
  } catch (err) {
    console.error(`[carousel-slide] FAILED — post=${post_id} slide=${slide_index}:`, err.message)
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    if (srcPath) try { fs.unlinkSync(srcPath) } catch (_) {}
    if (outPath) try { fs.unlinkSync(outPath) } catch (_) {}
  }
})

app.post('/generate-social-image', async (req, res) => {
  const { photo_url, title, body, cta, post_id, slide_index, width, height } = req.body
  if (!photo_url || post_id === undefined || slide_index === undefined || !width || !height) {
    return res.status(400).json({ ok: false, error: 'photo_url, post_id, slide_index, width, and height required' })
  }
  let srcPath = null
  let outPath = null
  try {
    console.log(`[social-image] start — post=${post_id} slide=${slide_index} ${width}x${height}`)
    srcPath = await downloadFile(photo_url, extFromUrl(photo_url))
    outPath = await generateOverlaySlide(srcPath, { title, body, cta }, { width, height })

    const storagePath = `a1b2c3d4-0001-0001-0001-000000000001/rendered/${post_id}-slide-${slide_index}.png`
    const imageUrl = await uploadImage(outPath, 'assets', storagePath)

    console.log(`[social-image] done — ${imageUrl}`)
    res.json({ ok: true, image_url: imageUrl })
  } catch (err) {
    console.error(`[social-image] FAILED — post=${post_id} slide=${slide_index}:`, err.message)
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    if (srcPath) try { fs.unlinkSync(srcPath) } catch (_) {}
    if (outPath) try { fs.unlinkSync(outPath) } catch (_) {}
  }
})

app.post('/render', async (req, res) => {
  if (supabaseStatus !== 'connected') {
    return res.status(503).json({ ok: false, error: `Supabase not connected: ${supabaseStatus}` })
  }
  const { reel_id, scenes, audio_url, supabase_bucket, output_path } = req.body
  if (!reel_id || !Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ ok: false, error: 'reel_id and scenes[] required' })
  }
  res.status(202).json({ ok: true, reel_id, status: 'rendering' })
  renderReel({ reel_id, scenes, audio_url, supabase_bucket, output_path }).catch(err => {
    console.error('[render] fatal error for', reel_id, err.message)
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`render-service v2 listening on ${PORT}`)
  checkSupabase()
})
