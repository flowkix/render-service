const puppeteer = require('puppeteer')
const axios = require('axios')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { randomUUID } = require('crypto')

// A fully-rendered deck PDF (7 pages, each with a full-bleed background photo plus
// card/panel imagery) is reliably well over this size. A PDF at or below it is a strong
// signal the render fired before images finished loading — this is only a defense-in-depth
// backstop, not the primary fix (see waitForDeckReady below).
const MIN_EXPECTED_PDF_BYTES = 150 * 1024

async function waitForDeckReady (page) {
  // The deck's own JS (snacket-website/deck/index.html) sets window.__DECK_READY__ = true
  // only after: the Supabase fetch has resolved, all text/logo/photo DOM population is done,
  // and #deck has been flipped from display:none to display:block. That last flip matters —
  // Chromium defers loading background-image url()s declared on descendants of a display:none
  // ancestor until that ancestor enters the render tree, so the CSS ::before photos on
  // #p2/#p3/#p4/#p5/#p7 (and #p1's dynamic EV photo, set via an inline --page-photo custom
  // property) only start downloading around that point — well after page.goto()'s
  // networkidle2 has already settled on the pre-fetch, pre-reveal page state. That gap, not a
  // missing print-color-adjust (already fixed, PR #35), was the root cause of the intermittent
  // placeholder/no-image PDF: page.pdf() could fire before this late burst of image requests
  // had even been issued, let alone finished downloading.
  await page.waitForFunction(() => window.__DECK_READY__ === true, { timeout: 30000 })

  const hasError = await page.evaluate(() => window.__DECK_ERROR__ === true)
  if (hasError) {
    throw new Error('Deck failed to load (deck-error state) — refusing to generate a PDF of the error page')
  }

  // Wait for every actual pixel the PDF needs: real <img> elements (client logo), plus every
  // ::before background-image url() across the 7 .page sections. The background-image URLs
  // aren't in document.images, so they're read off computed style and preloaded explicitly.
  await page.evaluate(async () => {
    const urls = new Set()

    document.querySelectorAll('.page').forEach(el => {
      const bg = getComputedStyle(el, '::before').backgroundImage
      const match = /url\(["']?([^"')]+)["']?\)/.exec(bg)
      if (match && match[1]) urls.add(match[1])
    })

    Array.from(document.images).forEach(img => { if (img.src) urls.add(img.src) })

    await Promise.all(Array.from(urls).map(url => new Promise(resolve => {
      const probe = new Image()
      probe.onload = resolve
      probe.onerror = resolve // never hang PDF generation on one broken image URL
      probe.src = url
    })))
  })
}

// Chromium's print-to-PDF embeds PNG-sourced background photos (e.g. an AI-composited
// EV scene) as near-lossless Flate raster instead of JPEG — a single 1830x1125 image
// weighed 4MB+ raw, and one real 7-page deck came out to 11MB (confirmed via
// `pdfimages -list` on a live-generated deck, 2026-09-10). That's what made "swipe
// between pages" feel stuck in desktop PDF viewers (reported live by John): every
// page-paint had to decode several megabytes of raw pixels per page instead of a
// hardware-friendly JPEG. Ghostscript's /ebook preset (150dpi color downsample) cut
// that same file to 2.1MB with no visible quality loss at normal viewing size
// (verified side-by-side before shipping this). Never let a missing/failing `gs`
// binary break PDF generation — fall back to the uncompressed original.
async function compressPdf (pdfBuffer) {
  const inPath = path.join(os.tmpdir(), `deck_in_${randomUUID()}.pdf`)
  const outPath = path.join(os.tmpdir(), `deck_out_${randomUUID()}.pdf`)
  fs.writeFileSync(inPath, pdfBuffer)

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(process.env.GS_BIN || 'gs', [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/ebook',
        '-dNOPAUSE', '-dQUIET', '-dBATCH',
        '-dDownsampleColorImages=true', '-dColorImageResolution=150', '-dColorImageDownsampleType=/Bicubic',
        `-sOutputFile=${outPath}`,
        inPath,
      ])
      let stderr = ''
      proc.stderr.on('data', d => { stderr += d.toString() })
      proc.on('error', reject) // e.g. gs binary not found
      proc.on('close', code => {
        if (code === 0) resolve()
        else reject(new Error(`Ghostscript exit ${code}: ${stderr.slice(-500)}`))
      })
    })

    const compressed = fs.readFileSync(outPath)
    if (compressed.length === 0) throw new Error('Ghostscript produced an empty file')
    return compressed
  } catch (err) {
    console.warn(`[deck-pdf] compression failed (${err.message}) — shipping uncompressed PDF`)
    return pdfBuffer
  } finally {
    try { fs.unlinkSync(inPath) } catch (_) {}
    try { fs.unlinkSync(outPath) } catch (_) {}
  }
}

async function renderPdfOnce ({ browser, deckUrl }) {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(deckUrl, { waitUntil: 'networkidle2', timeout: 60000 })
    await waitForDeckReady(page)

    // deck/index.html's @media print block sizes each .page as 210mm x 297mm (portrait) —
    // landscape:true here mismatched that, leaving each page's content pinned to the left
    // of a wider landscape canvas with the uncovered remainder rendering solid black
    // (confirmed 2026-08-18 via side-by-side diagnostic renders). Portrait matches the CSS.
    return await page.pdf({
      format: 'A4',
      landscape: false,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
  } finally {
    await page.close()
  }
}

async function generateDeckPdf ({ deckUrl, prospectId }) {
  const sbUrl = process.env.SNACKET_OS_SUPABASE_URL || 'https://noielmbqxmrnkmysqyek.supabase.co'
  const sbKey = process.env.SNACKET_OS_SUPABASE_KEY
  if (!sbKey) throw new Error('SNACKET_OS_SUPABASE_KEY env var not set')

  const launchOpts = {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  }
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  }
  const browser = await puppeteer.launch(launchOpts)

  let pdfBuffer
  try {
    pdfBuffer = await renderPdfOnce({ browser, deckUrl })

    // Defense-in-depth backstop, not the primary fix (that's waitForDeckReady above): if the
    // output is still anomalously small — e.g. a genuinely slow image CDN response that
    // outlasted even the explicit per-image wait — retry the whole render once before
    // shipping a possibly-broken PDF.
    if (pdfBuffer.length < MIN_EXPECTED_PDF_BYTES) {
      console.warn(`[deck-pdf] first render suspiciously small (${pdfBuffer.length} bytes) for ${prospectId} — retrying once`)
      pdfBuffer = await renderPdfOnce({ browser, deckUrl })
      if (pdfBuffer.length < MIN_EXPECTED_PDF_BYTES) {
        console.warn(`[deck-pdf] retry still small (${pdfBuffer.length} bytes) for ${prospectId} — shipping it anyway, needs investigation`)
      }
    }
  } finally {
    await browser.close()
  }

  const rawBytes = pdfBuffer.length
  pdfBuffer = await compressPdf(pdfBuffer)
  console.log(`[deck-pdf] compressed ${prospectId}: ${rawBytes} → ${pdfBuffer.length} bytes`)

  // Timestamped, not a fixed deck-pdf/${prospectId}.pdf — Cloudflare (fronting Supabase
  // Storage) was confirmed live (2026-09-12) to keep serving an old cached response for
  // a storage path after a fresh x-upsert overwrite, `Cache-Control: no-cache` on the
  // object notwithstanding (CF-Cache-Status: HIT anyway) — a client-side cache-busting
  // query string on the download didn't help either, since Cloudflare's cache key here
  // ignores query strings. A rep regenerating a PDF (edit photos, hit Retry, click
  // Download PDF again) could silently receive the PREVIOUS version. A unique path per
  // generation sidesteps the CDN entirely — nothing to invalidate, no caller changes
  // needed since every caller (n8n, the deck's own Download PDF button) already just
  // uses whatever pdf_url this returns rather than assuming a fixed one.
  const storagePath = `deck-pdf/${prospectId}-${Date.now()}.pdf`
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
