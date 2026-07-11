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
    `Image 1 = SNACKET EV in a scene. Image 2 = ${companyName} logo.`,
    ``,
    `TASK — Replace the SNACKET branding on exactly 3 surfaces inside the service area with the ${companyName} logo from Image 2.`,
    ``,
    `SURFACE 1 — Left circular medallion: On the LEFT interior wall of the service area there is a large circular medallion. Replace the SNACKET logo inside this circle with Image 2 logo, large and centered.`,
    ``,
    `SURFACE 2 — Center circular disc behind the faucets: The large circular disc on the center wall surface. The 3 faucet handles are physical hardware mounted IN FRONT of this disc — do not remove them. Replace the SNACKET branding on the disc with Image 2 logo.`,
    ``,
    `SURFACE 3 — Icon strip: The narrow horizontal band at the top of the service opening. Replace SNACKET icons/text with the company name "${companyName}" in small letters repeated evenly across the full strip width.`,
    ``,
    `STRICT RULES:`,
    `- Replace ONLY the 3 surfaces above. Do not touch anything else.`,
    `- Scene background, EV color, structure, faucets, QR code, serving tray, wheels, cab, wing doors — all unchanged.`,
  ].join('\n')
}

function buildPass3Prompt(companyName) {
  return [
    `Image 1 = EV in a scene. Image 2 = ${companyName} logo.`,
    ``,
    `TASK — Replace the logo on the UNDERSIDE PANELS of the two raised wing doors with Image 2 logo.`,
    ``,
    `DOOR PANEL 1 — LEFT wing door (the smaller door on the left side): When this door is raised open like a wing, its flat bottom face is exposed and faces downward. That flat rectangular panel currently has a circular logo with SNACKET text on it. Replace that circular SNACKET logo with Image 2 logo, large and centered on the panel.`,
    ``,
    `DOOR PANEL 2 — RIGHT wing door (the larger door on the right side): Same as above — the flat bottom face of the right raised door currently shows a circular SNACKET logo. Replace it with Image 2 logo, large and centered.`,
    ``,
    `STRICT RULES:`,
    `- Replace ONLY the logo on those 2 flat door underside panels. Change nothing else.`,
    `- The top surfaces of the doors (the gray exterior panels facing up/outward) must remain unchanged.`,
    `- Do not change the scene, the EV color, the interior, the faucets, or any other surface.`,
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
