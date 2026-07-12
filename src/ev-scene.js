'use strict'
const sharp = require('sharp')
const axios = require('axios')

// SNACKET EV reference photo — white background, 1024×768px
// Rear 3/4 view, slightly elevated, both gull-wing doors open
const EV_REF_URL = 'https://nrawezmnyivbmatrugdv.supabase.co/storage/v1/object/public/snacket-assets/brand/ev-reference/snacket-ev-referencia.jpg'

// ── Sharp zones ──────────────────────────────────────────────────────────────
// Pixel positions calibrated for the 1024×768 reference image.
// Only zones that are camera-facing and unobstructed are handled by Sharp.
// Perspective-distorted zones (door panels, icon strip) and zones with
// foreground objects (center disc / faucets) are delegated to Gemini.
const SHARP_ZONES = [
  {
    id: 'left_medallion',
    shape: 'circle',
    // Left interior wall circular disc — faces camera at ~20°, no obstructions
    left: 255, top: 372, size: 98,
  },
  // Commented zones kept for future calibration:
  // { id: 'center_disc', shape: 'circle', left: 396, top: 348, size: 208 }, // faucets in front
  // { id: 'right_door',  shape: 'rect', left: 338, top: 20, w: 360, h: 255, rotate: -6 },
  // { id: 'left_door',   shape: 'rect', left: 55,  top: 58, w: 148, h: 182, rotate: 44 },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
async function fetchBuffer(url) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
  return Buffer.from(resp.data)
}

async function circularLogoOverlay(logoBuffer, size) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  )
  const resized = await sharp(logoBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function applySharpZones(evBuffer, logoBuffer) {
  if (!logoBuffer || SHARP_ZONES.length === 0) return evBuffer
  const logoPng = await sharp(logoBuffer).png().toBuffer()

  const composites = []
  for (const z of SHARP_ZONES) {
    if (z.shape === 'circle') {
      const overlay = await circularLogoOverlay(logoPng, z.size)
      composites.push({ input: overlay, left: z.left, top: z.top, blend: 'over' })
      console.log(`[ev-scene] sharp zone ${z.id}: left=${z.left} top=${z.top} size=${z.size}`)
    }
  }

  return sharp(evBuffer)
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(parts, label) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY env var not set')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`
  const t0 = Date.now()
  const resp = await axios.post(
    url,
    { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 180000 }
  )
  console.log(`[ev-scene] ${label} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  return resp.data
}

function extractImageBuffer(geminiResp, label) {
  const candidates = geminiResp.candidates || []
  if (!candidates[0]?.content?.parts) {
    throw new Error(`${label}: no candidates. Keys: ${JSON.stringify(Object.keys(geminiResp))}`)
  }
  const part = candidates[0].content.parts.find(p => p.inlineData || p.inline_data)
  if (!part) {
    throw new Error(`${label}: no image part. Parts: ${JSON.stringify(candidates[0].content.parts.map(p => Object.keys(p)))}`)
  }
  const inline = part.inlineData || part.inline_data
  return Buffer.from(inline.data, 'base64')
}

// ── Prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(companyName, activationDescription, brandConcept, hasLogo) {
  const lines = [
    `Image 1 = SNACKET EV on a white background.${hasLogo ? ` The left circular medallion on the interior left wall already shows the ${companyName} logo (already composited in Image 1). Image 2 = ${companyName} logo — use Image 2 EXACTLY, unchanged.` : ''}`,
    ``,
    `TASK A — Replace the white background with a photorealistic activation scene:`,
    `Scene: ${activationDescription}`,
    `Brand concept: ${brandConcept}`,
    `Add 2–3 people: one brand ambassador operating the EV service counter, 1–2 guests being served.`,
    `Warm, professional, high-energy atmosphere. Same camera angle: rear 3/4 view, slightly elevated.`,
  ]

  if (hasLogo) {
    lines.push(
      ``,
      `TASK B — Brand the EV with the ${companyName} logo (Image 2) on these surfaces:`,
      ``,
      `SURFACE 1 — CENTER DISC: Large circular disc on the service bay back wall. 3 chrome faucet tap handles are physically mounted IN FRONT of this disc — they are 3D objects protruding forward. Replace only the SNACKET logo printed on the disc with Image 2 logo. The 3 faucet handles MUST remain fully visible, overlapping the disc.`,
      ``,
      `SURFACE 2 — ICON STRIP: Narrow horizontal decorative band running across the SERVICE BODY BACK WALL just below the hinge line where the large wing door connects. Replace SNACKET icons/text in this strip with "${companyName}" repeated evenly.`,
      ``,
      `SURFACE 3 — LEFT WING DOOR PANEL: The smaller left door is raised open. Its flat bottom face (pointing downward) shows a circular SNACKET logo. Replace with Image 2 logo, large and centered on the panel.`,
      ``,
      `SURFACE 4 — RIGHT WING DOOR PANEL: The larger right door is raised open. Its flat bottom face shows a circular SNACKET logo. Replace with Image 2 logo, large and centered on the panel.`
    )
  }

  lines.push(
    ``,
    `STRICT RULES:`,
    `- EV vehicle MUST remain 100% identical: same color, same structure, same hardware, same open gull-wing doors.`,
    hasLogo ? `- Use Image 2 logo EXACTLY. No color modifications. No added text.` : null,
    hasLogo ? `- Preserve the ${companyName} logo already on the left medallion in Image 1.` : null,
    `- The 3 chrome faucet handles must remain visible in front of the center disc.`,
    `- No text overlays, no borders, no watermarks in the output.`,
  )

  return lines.filter(l => l !== null).join('\n')
}

// ── Upload ───────────────────────────────────────────────────────────────────
async function uploadToSnacketOS(buffer, prospectId) {
  const sbUrl = process.env.SNACKET_OS_SUPABASE_URL || 'https://noielmbqxmrnkmysqyek.supabase.co'
  const sbKey = process.env.SNACKET_OS_SUPABASE_KEY
  if (!sbKey) throw new Error('SNACKET_OS_SUPABASE_KEY env var not set')
  const uploadUrl = `${sbUrl}/storage/v1/object/snacket-assets/deck-ev/${prospectId}.png`
  await axios.put(uploadUrl, buffer, {
    headers: { apikey: sbKey, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    timeout: 30000,
    maxBodyLength: Infinity,
  })
  return `${sbUrl}/storage/v1/object/public/snacket-assets/deck-ev/${prospectId}.png`
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function generateEvScene({ prospectId, logoUrl, companyName, activationDescription, brandConcept }) {
  const t0 = Date.now()
  console.log(`[ev-scene] v2 start — ${prospectId} / ${companyName}`)

  // 1. Fetch EV base + client logo in parallel
  const [evBuffer, logoBuffer] = await Promise.all([
    fetchBuffer(EV_REF_URL),
    logoUrl ? fetchBuffer(logoUrl) : Promise.resolve(null),
  ])
  console.log(`[ev-scene] assets fetched in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // 2. Sharp: composite logo on left medallion (pixel-perfect, ~<1s)
  const brandedEvBuffer = await applySharpZones(evBuffer, logoBuffer)
  console.log(`[ev-scene] sharp done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // 3. Single comprehensive Gemini pass: background scene + people + remaining branding zones
  //    (replaces the previous 3-pass sequential approach — ~3x faster)
  const hasLogo = !!logoBuffer
  const logoMime = logoUrl && /\.jpe?g$/i.test(logoUrl) ? 'image/jpeg' : 'image/png'

  const parts = [
    { text: buildPrompt(companyName, activationDescription, brandConcept, hasLogo) },
    { inlineData: { mimeType: 'image/jpeg', data: brandedEvBuffer.toString('base64') } },
  ]
  if (hasLogo) {
    parts.push({ inlineData: { mimeType: logoMime, data: logoBuffer.toString('base64') } })
  }

  const geminiResp = await callGemini(parts, 'scene+branding')
  const finalBuffer = extractImageBuffer(geminiResp, 'scene+branding')
  console.log(`[ev-scene] gemini done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // 4. Upload to SNACKET-OS Supabase Storage
  const evImageUrl = await uploadToSnacketOS(finalBuffer, prospectId)
  console.log(`[ev-scene] complete in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${evImageUrl}`)

  return { ev_image_url: evImageUrl }
}

module.exports = { generateEvScene }
