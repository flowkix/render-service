const puppeteer = require('puppeteer')
const { PDFDocument } = require('pdf-lib')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')
const { pathToFileURL } = require('url')

// Renders an HTML string to a PNG at an exact physical size and DPI.
// Writes the HTML to a temp file first (not page.setContent) so relative-free
// font file:// URLs (already made absolute by fonts.js) resolve identically
// to how the local CLI's Playwright engine does it via page.goto(file://).
async function renderHtmlStringToPng({ html, cssWidthIn, cssHeightIn, dpi, outputPngPath }) {
  const widthPx = Math.round(cssWidthIn * 96)
  const heightPx = Math.round(cssHeightIn * 96)
  const deviceScaleFactor = dpi / 96

  const tmpHtmlPath = path.join(os.tmpdir(), `print-piece-${randomUUID()}.html`)

  const launchOpts = {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  }
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  }

  let browser
  try {
    await fs.writeFile(tmpHtmlPath, html, 'utf8')
    browser = await puppeteer.launch(launchOpts)
    const page = await browser.newPage()
    await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor })
    await page.goto(pathToFileURL(tmpHtmlPath).href, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.screenshot({ path: outputPngPath })
  } finally {
    if (browser) await browser.close()
    await fs.unlink(tmpHtmlPath).catch(() => {})
  }
}

// Assembles one PNG into a single-page print-ready PDF at exact physical size.
async function buildPrintPdf({ pngPath, pageWidthIn, pageHeightIn, outputPdfPath }) {
  const doc = await PDFDocument.create()
  const widthPt = pageWidthIn * 72
  const heightPt = pageHeightIn * 72

  const pngBytes = await fs.readFile(pngPath)
  const pngImage = await doc.embedPng(pngBytes)
  const page = doc.addPage([widthPt, heightPt])
  page.drawImage(pngImage, { x: 0, y: 0, width: widthPt, height: heightPt })

  const pdfBytes = await doc.save()
  await fs.writeFile(outputPdfPath, pdfBytes)
}

module.exports = { renderHtmlStringToPng, buildPrintPdf }
