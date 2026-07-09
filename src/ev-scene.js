const axios = require('axios')

const EV_REF_URL = 'https://nrawezmnyivbmatrugdv.supabase.co/storage/v1/object/public/snacket-assets/brand/ev-reference/snacket-ev-referencia.jpg'

function buildPrompt(companyName, activationDescription, brandConcept) {
  return [
    `Image 1 = SNACKET EV reference photo. Image 2 = ${companyName} logo.`,
    ``,
    `CAMERA ANGLE (mandatory): Render from the EXACT same camera angle as Image 1: rear 3/4 view, slightly elevated, showing both open gull-wing doors and the full service area interior. Do not change the perspective or angle.`,
    ``,
    `VEHICLE STRUCTURE (copy exactly from Image 1): flat rectangular roof, all exterior panels, brown decorative skirt at the base, cab structure, windshield, wheels, QR code, all hardware, 3 nitro faucets and serving tray, driver cab door with SNACKET logo. The EV must fill at least 60% of the frame.`,
    ``,
    `APPLY ALL SIX TASKS SIMULTANEOUSLY IN ONE PASS:`,
    ``,
    `TASK 1 — Scene background: Replace the plain background with a photorealistic scene suited for: ${activationDescription} / Campaign: ${brandConcept}. The EV is the large center hero — close-up, prominent, occupying most of the image.`,
    ``,
    `TASK 2 — Small rear gull-wing door, interior face: The flat panel on the UNDERSIDE (interior face) of the small rear door (smaller of the two open doors). Replace the SNACKET logo with the ${companyName} logo (Image 2), centered, large. Do not touch the exterior top surface of the door.`,
    ``,
    `TASK 3 — Large front gull-wing door, interior face: The flat panel on the UNDERSIDE (interior face) of the large front door. Replace the SNACKET logo with the ${companyName} logo (Image 2), centered, large. Do not touch the exterior top surface of the door.`,
    ``,
    `TASK 4 — Icon strip on service body wall: The narrow horizontal band on the SERVICE BODY WALL at the top of the service opening, just below the large door hinge. Contains small SNACKET icons (gears, robots, coffee cups) in a row. Replace all icons with the company name ${companyName} in small clean letters repeated evenly across the full strip width. Keep strip background and height unchanged.`,
    ``,
    `TASK 5 — Left circular medallion on interior wall: On the LEFT interior wall of the service area there is a large circular medallion mounted on the flat wall surface. Replace the current logo inside this circular area with the ${companyName} logo (Image 2).`,
    ``,
    `TASK 6 — Center circular disc behind the faucets: In the center of the service area there is a large circular disc printed flat on the wall surface. The 3 beer/nitro faucets are physical hardware on brackets mounted IN FRONT of this disc — they are separate objects. Replace the current branding on this circular wall disc with the ${companyName} logo (Image 2). The 3 faucets, handles, stems, brackets, and serving tray must remain exactly as they are.`,
    ``,
    `QUALITY RULE: For ALL areas of Image 1 not mentioned in the tasks above, reproduce pixel-perfect. Do not redraw, reinterpret, or regenerate anything not instructed to change.`,
  ].join('\n')
}

async function fetchBuffer(url) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
  return Buffer.from(resp.data)
}

async function callGemini(parts) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY env var not set')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`
  const resp = await axios.post(
    url,
    { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 180000 }
  )
  return resp.data
}

async function uploadToSnacketOS(imageBuffer, prospectId) {
  const sbUrl = process.env.SNACKET_OS_SUPABASE_URL || 'https://noielmbqxmrnkmysqyek.supabase.co'
  const sbKey = process.env.SNACKET_OS_SUPABASE_KEY
  if (!sbKey) throw new Error('SNACKET_OS_SUPABASE_KEY env var not set')

  const uploadUrl = `${sbUrl}/storage/v1/object/snacket-assets/deck-ev/${prospectId}.png`
  await axios.put(uploadUrl, imageBuffer, {
    headers: { apikey: sbKey, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    timeout: 30000
  })
  return `${sbUrl}/storage/v1/object/public/snacket-assets/deck-ev/${prospectId}.png`
}

async function generateEvScene({ prospectId, logoUrl, companyName, activationDescription, brandConcept }) {
  console.log(`[ev-scene] downloading EV ref for ${prospectId}`)
  const evBuffer = await fetchBuffer(EV_REF_URL)

  const parts = [
    { text: buildPrompt(companyName, activationDescription, brandConcept) },
    { inlineData: { mimeType: 'image/jpeg', data: evBuffer.toString('base64') } },
  ]

  if (logoUrl) {
    console.log(`[ev-scene] downloading logo: ${logoUrl}`)
    const logoBuffer = await fetchBuffer(logoUrl)
    const logoMime = /\.jpe?g$/i.test(logoUrl) ? 'image/jpeg' : 'image/png'
    parts.push({ inlineData: { mimeType: logoMime, data: logoBuffer.toString('base64') } })
  }

  console.log(`[ev-scene] calling Gemini (single pass)`)
  const geminiResp = await callGemini(parts)

  const candidates = geminiResp.candidates || []
  if (!candidates[0]?.content?.parts) {
    throw new Error(`Gemini no candidates. Response keys: ${JSON.stringify(Object.keys(geminiResp))}`)
  }
  const imagePart = candidates[0].content.parts.find(p => p.inlineData || p.inline_data)
  if (!imagePart) {
    throw new Error(`Gemini returned no image. Parts: ${JSON.stringify(candidates[0].content.parts.map(p => Object.keys(p)))}`)
  }
  const inlineData = imagePart.inlineData || imagePart.inline_data
  const imageBuffer = Buffer.from(inlineData.data, 'base64')

  console.log(`[ev-scene] uploading to SNACKET-OS (${imageBuffer.length} bytes)`)
  const evImageUrl = await uploadToSnacketOS(imageBuffer, prospectId)

  return { ev_image_url: evImageUrl }
}

module.exports = { generateEvScene }
