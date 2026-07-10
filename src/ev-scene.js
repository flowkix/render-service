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
    `Image 1 = SNACKET EV in a scene. Image 2 = ${companyName} logo (the replacement logo).`,
    ``,
    `SINGLE TASK — Replace the SNACKET branding on exactly 5 surfaces of the EV with the ${companyName} logo from Image 2. Apply Image 2 logo large and centered on each surface.`,
    ``,
    `SURFACE 1 — Small rear gull-wing door, interior face: The flat panel on the UNDERSIDE of the smaller open door. Replace the SNACKET logo with Image 2 logo, centered, large.`,
    ``,
    `SURFACE 2 — Large front gull-wing door, interior face: The flat panel on the UNDERSIDE of the larger open door. Replace the SNACKET logo with Image 2 logo, centered, large.`,
    ``,
    `SURFACE 3 — Icon strip on service body wall: The narrow horizontal band at the top of the service opening. Replace all SNACKET icons/text with the company name "${companyName}" in small clean letters repeated evenly across the full strip width.`,
    ``,
    `SURFACE 4 — Left circular medallion on interior wall: The large circular disc on the LEFT interior wall. Replace the SNACKET logo inside this circle with Image 2 logo.`,
    ``,
    `SURFACE 5 — Center circular disc behind the faucets: The large circular disc on the center wall surface. The 3 faucets are physical hardware IN FRONT of this disc — do not touch them. Replace the SNACKET branding on the disc with Image 2 logo.`,
    ``,
    `STRICT RULES:`,
    `- Replace ONLY the 5 surfaces above. Change nothing else.`,
    `- The scene background, EV structure, color, hardware, faucets, QR code, serving tray, wheels, cab — all must remain exactly as in Image 1.`,
    `- Do not add text overlays. Do not change the EV color. Do not recompose the scene.`,
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
  // --- Pass 1: background only ---
  console.log(`[ev-scene] pass 1 — background for ${prospectId}`)
  const evBuffer = await fetchBuffer(EV_REF_URL)

  const pass1Parts = [
    { text: buildPass1Prompt(activationDescription, brandConcept) },
    { inlineData: { mimeType: 'image/jpeg', data: evBuffer.toString('base64') } },
  ]
  const pass1Resp = await callGemini(pass1Parts, 'pass1')
  const pass1Buffer = extractImageBuffer(pass1Resp, 'pass1')

  // --- Pass 2: logo rebranding on 5 surfaces ---
  console.log(`[ev-scene] pass 2 — rebranding ${companyName} on 5 surfaces`)
  const pass2Parts = [
    { text: buildPass2Prompt(companyName) },
    { inlineData: { mimeType: 'image/png', data: pass1Buffer.toString('base64') } },
  ]

  if (logoUrl) {
    console.log(`[ev-scene] downloading logo: ${logoUrl}`)
    const logoBuffer = await fetchBuffer(logoUrl)
    const logoMime = /\.jpe?g$/i.test(logoUrl) ? 'image/jpeg' : 'image/png'
    pass2Parts.push({ inlineData: { mimeType: logoMime, data: logoBuffer.toString('base64') } })
  }

  const pass2Resp = await callGemini(pass2Parts, 'pass2')
  const finalBuffer = extractImageBuffer(pass2Resp, 'pass2')

  console.log(`[ev-scene] uploading final (${finalBuffer.length} bytes)`)
  const evImageUrl = await uploadToSnacketOS(finalBuffer, prospectId)

  return { ev_image_url: evImageUrl }
}

module.exports = { generateEvScene }
