const puppeteer = require('puppeteer')
const axios = require('axios')

async function generateDeckPdf({ deckUrl, prospectId }) {
  const sbUrl = process.env.SNACKET_OS_SUPABASE_URL || 'https://noielmbqxmrnkmysqyek.supabase.co'
  const sbKey = process.env.SNACKET_OS_SUPABASE_KEY
  if (!sbKey) throw new Error('SNACKET_OS_SUPABASE_KEY env var not set')

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  })

  let pdfBuffer
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(deckUrl, { waitUntil: 'networkidle2', timeout: 60000 })
    pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
  } finally {
    await browser.close()
  }

  const storagePath = `deck-pdf/${prospectId}.pdf`
  const uploadUrl = `${sbUrl}/storage/v1/object/snacket-assets/${storagePath}`
  await axios.put(uploadUrl, pdfBuffer, {
    headers: {
      apikey: sbKey,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    timeout: 30000,
    maxBodyLength: Infinity,
  })

  return {
    pdf_url: `${sbUrl}/storage/v1/object/public/snacket-assets/${storagePath}`,
  }
}

module.exports = { generateDeckPdf }
