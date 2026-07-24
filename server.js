const express = require('express')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const net = require('net')
const dns = require('dns').promises
const { randomUUID } = require('crypto')
const axios = require('axios')
const sharp = require('sharp')
const { renderReel } = require('./src/render')
const { getClient } = require('./src/supabase')
const { downloadFile, extFromUrl } = require('./src/downloader')
const { generateEvScene } = require('./src/ev-scene')
const { generateDeckPdf } = require('./src/deck-pdf')
const { generateCarouselSlide, generateOverlaySlide } = require('./src/slide-gen')
const { uploadImage } = require('./src/supabase')
const { runBranding } = require('./src/ev-engine')
const { checkRateLimit } = require('./src/ev-engine/rate-limiter')
const { uploadCltAlliancePreview, getSnacketOsClient } = require('./src/ev-engine/clt-alliance-upload')
const { generatePrintPiece } = require('./src/print-design/generate-print-piece')

const app = express()
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

const MAX_LOGO_FETCH_BYTES = 8_000_000 // matches EV Engine v3's known 8MB inline (base64) payload ceiling

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

// Public, unauthenticated — protected by contact-gate + rate limiting instead of auth.
// Branding-stage-only by design (2026-07-21 decision): no scene/staff generation here,
// sidesteps the known scene-stage staff-guest interaction bug entirely. See
// docs/lessons/failed-approaches.md "EV IMAGE ENGINE V3 — scene-stage staff/interaction prompt wording".
app.post('/generate-ev-scene-public', async (req, res) => {
  const { name, company, email, logo_source, honeypot } = req.body

  if (honeypot && String(honeypot).trim() !== '') {
    // Bot caught by the honeypot — respond as if successful, don't tip it off.
    return res.json({ ok: true, image_url: null })
  }
  if (!name || !company || !email || !logo_source) {
    return res.status(400).json({ ok: false, error: 'name, company, email, and logo_source are required' })
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

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'

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

    console.log(`[clt-alliance] done — ${leadId} / ${imageUrl}`)
    res.json({ ok: true, image_url: imageUrl, lead_id: leadId })
  } catch (err) {
    console.error(`[clt-alliance] FAILED — ${leadId}:`, err.message)
    await snacketOs.from('clt_alliance_leads')
      .update({ status: 'failed', error_message: err.message.slice(0, 2000) })
      .eq('id', leadId)
    res.status(500).json({ ok: false, error: 'Generation failed — our team has been notified.' })
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
    console.log(`[print-piece] done — ${result.front_pdf_url}`)
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
