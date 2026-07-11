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
    `Image 1 = SNACKET EV in a scene. Image 2 = ${companyName} logo. Use Image 2 EXACTLY — do not invent or modify it.`,
    ``,
    `TASK — Replace the SNACKET branding on 3 specific interior surfaces with Image 2 logo.`,
    ``,
    `SURFACE 1 — Left circular medallion: On the LEFT interior wall of the service area there is a large circular disc/medallion mounted on the flat wall surface. Replace the SNACKET robot logo inside this circle with Image 2 logo, large and centered.`,
    ``,
    `SURFACE 2 — Center circular disc: On the CENTER back wall of the service area there is a large circular disc printed on the wall. IMPORTANT: 3 chrome metal faucet tap handles on black metal brackets are physically mounted IN FRONT of this disc — they are 3D objects that protrude forward from the wall. You MUST keep all 3 faucet handles exactly as they are, visible and overlapping the disc. Only replace the SNACKET logo printed on the disc itself with Image 2 logo. The faucets must remain.`,
    ``,
    `SURFACE 3 — Icon strip: There is a narrow horizontal decorative band on the SERVICE BODY BACK WALL — the vertical wall at the top of the service opening, just below the hinge line where the large wing door connects. This strip runs horizontally across the back wall of the service bay. It contains small SNACKET icons/text. Replace all icons/text in this strip with the company name "${companyName}" in small clean letters repeated evenly across the strip. This strip is on the WALL, NOT on any door panel.`,
    ``,
    `STRICT RULES:`,
    `- The 3 chrome faucet handles MUST remain visible in front of the center disc. Do not remove, hide, or move them.`,
    `- Do NOT place the icon strip on any door panel — it belongs only on the back wall of the service bay.`,
    `- Change ONLY the 3 surfaces above. Scene background, EV color, structure, QR code, serving tray, wheels, cab — all unchanged.`,
    `- Use Image 2 logo exactly. Do not add any other icons or text.`,
  ].join('\n')
}

function buildPass3Prompt(companyName) {
  return [
    `Image 1 = EV in a scene. Image 2 = ${companyName} logo. Use Image 2 EXACTLY — do not invent or modify it.`,
    ``,
    `TASK — Replace the SNACKET logo on the UNDERSIDE PANELS of the two raised wing doors with Image 2 logo.`,
    ``,
    `The two wing doors are raised open at the top of the EV forming a V shape. Each door has a flat rectangular panel on its BOTTOM FACE (the face that points downward when the door is open):`,
    ``,
    `- LEFT door panel (smaller door, viewer's left side): The flat bottom face currently shows a circular SNACKET logo. Replace it with Image 2 logo, large and centered on the panel.`,
    `- RIGHT door panel (larger door, viewer's right side): The flat bottom face currently shows a circular SNACKET logo. Replace it with Image 2 logo, large and centered on the panel.`,
    ``,
    `STRICT RULES:`,
    `- Change ONLY the logo on the flat bottom faces of the two wing door panels. Nothing else.`,
    `- Do NOT change the gray/beige top exterior faces of the doors (the surfaces facing upward/outward).`,
    `- Do NOT change the scene, interior, faucets, center disc, medallion, or any other surface.`,
    `- The faucets inside the service area must remain exactly as in Image 1.`,
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
