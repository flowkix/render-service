const axios = require('axios')

const EV_REF_URL = 'https://nrawezmnyivbmatrugdv.supabase.co/storage/v1/object/public/snacket-assets/brand/ev-reference/snacket-ev-referencia.jpg'

function buildPass1Prompt(activationDescription, brandConcept) {
  return [
    `Image 1 = SNACKET EV photo on a plain white background.`,
    ``,
    `SINGLE TASK — Replace the plain white background with a photorealistic scene:`,
    `Scene: ${activationDescription}`,
    `Brand concept: ${brandConcept}`,
    ``,
    `STRICT RULES:`,
    `- The EV vehicle must remain 100% identical to Image 1: same color, same branding, same logos, same structure, same hardware, same doors, same faucets, same QR code — everything unchanged.`,
    `- Do NOT modify anything on the EV itself. Only the background changes.`,
    `- The EV is the large center hero, prominent, occupying most of the frame.`,
    `- Same camera angle as Image 1: rear 3/4 view, slightly elevated, both gull-wing doors open.`,
  ].join('\n')
}

function buildPass2Prompt(companyName) {
  return [
    `Image 1 = SNACKET EV in a scene. Image 2 = ${companyName} logo (use this logo EXACTLY as shown — do not invent icons).`,
    ``,
    `TASK — Scan the entire EV carefully. Find EVERY place where the SNACKET robot logo appears (circular design with robot/gear/coffee-cup icons and the word SNACKET). Replace ALL instances with Image 2 logo, large and centered on each surface.`,
    ``,
    `You must find and replace ALL of these:`,
    `1. The circular medallion on the LEFT interior wall of the service area`,
    `2. The large circular disc on the CENTER interior wall (3 faucet handles are mounted IN FRONT of it — keep the faucets, only replace the disc logo)`,
    `3. The underside panel of the LEFT raised wing door (the smaller door) — flat rectangular panel facing downward`,
    `4. The underside panel of the RIGHT raised wing door (the larger door) — flat rectangular panel facing downward`,
    ``,
    `ALSO replace:`,
    `5. Icon strip — the narrow horizontal band at the top of the service opening: replace all SNACKET icons with the company name "${companyName}" in small letters repeated across the strip`,
    ``,
    `STRICT RULES:`,
    `- Use Image 2 logo EXACTLY. Do not modify, stylize, or invent any part of Image 2.`,
    `- Do not change anything except the 5 surfaces listed. Scene background, EV color, EV structure, faucets, QR code, serving tray, wheels, cab — all unchanged.`,
    `- Zero SNACKET logos must remain visible on the EV in the output.`,
  ].join('\n')
}

function buildPass3Prompt(companyName) {
  return [
    `Image 1 = EV in a scene. Image 2 = ${companyName} logo (use this EXACTLY — do not invent icons).`,
    ``,
    `CHECK AND FIX: Look at the two raised wing doors that open like wings at the top of the EV. Each door has a FLAT PANEL on its UNDERSIDE (bottom face, facing downward when the door is raised).`,
    ``,
    `- LEFT wing door (smaller, viewer's left): Does its bottom flat panel show the ${companyName} logo from Image 2? If NOT — apply Image 2 logo there now, large and centered.`,
    `- RIGHT wing door (larger, viewer's right): Does its bottom flat panel show the ${companyName} logo from Image 2? If NOT — apply Image 2 logo there now, large and centered.`,
    ``,
    `Also check: does the LEFT interior wall circular medallion show Image 2 logo? If it shows anything other than Image 2 logo — replace it now with Image 2 logo.`,
    ``,
    `STRICT RULES:`,
    `- Use Image 2 EXACTLY as provided. Do not stylize or modify the logo.`,
    `- Change ONLY the surfaces that do not yet show the correct ${companyName} logo.`,
    `- Do not alter the scene, EV color, faucets, QR code, or any already-correct surfaces.`,
  ].join('\n')
}

async function fetchBuffer(url) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
  return Buffer.from(resp.data)
}

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
  const imagePart = candidates[0].content.parts.find(p => p.inlineData || p.inline_data)
  if (!imagePart) {
    throw new Error(`${label}: no image part. Parts: ${JSON.stringify(candidates[0].content.parts.map(p => Object.keys(p)))}`)
  }
  const inlineData = imagePart.inlineData || imagePart.inline_data
  return Buffer.from(inlineData.data, 'base64')
}

async function uploadToSnacketOS(imageBuffer, prospectId) {
  const sbUrl = process.env.SNACKET_OS_SUPABASE_URL || 'https://noielmbqxmrnkmysqyek.supabase.co'
  const sbKey = process.env.SNACKET_OS_SUPABASE_KEY
  if (!sbKey) throw new Error('SNACKET_OS_SUPABASE_KEY env var not set')

  const uploadUrl = `${sbUrl}/storage/v1/object/snacket-assets/deck-ev/${prospectId}.png`
  await axios.put(uploadUrl, imageBuffer, {
    headers: { apikey: sbKey, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    timeout: 30000,
  })
  return `${sbUrl}/storage/v1/object/public/snacket-assets/deck-ev/${prospectId}.png`
}

async function generateEvScene({ prospectId, logoUrl, companyName, activationDescription, brandConcept }) {
  // Fetch shared assets up front
  console.log(`[ev-scene] fetching assets for ${prospectId}`)
  const evBuffer = await fetchBuffer(EV_REF_URL)

  let logoBuffer = null
  let logoMime = 'image/png'
  if (logoUrl) {
    console.log(`[ev-scene] downloading logo: ${logoUrl}`)
    logoBuffer = await fetchBuffer(logoUrl)
    logoMime = /\.jpe?g$/i.test(logoUrl) ? 'image/jpeg' : 'image/png'
  }

  // --- Pass 1: background only ---
  console.log(`[ev-scene] pass 1 — background`)
  const pass1Parts = [
    { text: buildPass1Prompt(activationDescription, brandConcept) },
    { inlineData: { mimeType: 'image/jpeg', data: evBuffer.toString('base64') } },
  ]
  const pass1Resp = await callGemini(pass1Parts, 'pass1')
  const pass1Buffer = extractImageBuffer(pass1Resp, 'pass1')

  // --- Pass 2: 3 interior surfaces ---
  console.log(`[ev-scene] pass 2 — interior surfaces`)
  const pass2Parts = [
    { text: buildPass2Prompt(companyName) },
    { inlineData: { mimeType: 'image/png', data: pass1Buffer.toString('base64') } },
  ]
  if (logoBuffer) pass2Parts.push({ inlineData: { mimeType: logoMime, data: logoBuffer.toString('base64') } })

  const pass2Resp = await callGemini(pass2Parts, 'pass2')
  const pass2Buffer = extractImageBuffer(pass2Resp, 'pass2')

  // --- Pass 3: wing door panels ---
  console.log(`[ev-scene] pass 3 — wing door panels`)
  const pass3Parts = [
    { text: buildPass3Prompt(companyName) },
    { inlineData: { mimeType: 'image/png', data: pass2Buffer.toString('base64') } },
  ]
  if (logoBuffer) pass3Parts.push({ inlineData: { mimeType: logoMime, data: logoBuffer.toString('base64') } })

  const pass3Resp = await callGemini(pass3Parts, 'pass3')
  const finalBuffer = extractImageBuffer(pass3Resp, 'pass3')

  console.log(`[ev-scene] uploading final (${finalBuffer.length} bytes)`)
  const evImageUrl = await uploadToSnacketOS(finalBuffer, prospectId)

  return { ev_image_url: evImageUrl }
}

module.exports = { generateEvScene }
