// src/print-design/generate-print-piece.js
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')
const { renderHtmlStringToPng, buildPrintPdf } = require('./engine')
const { buildFrontHtml: buildBifoldFront, buildBackHtml: buildBifoldBack } = require('./bifold-html')
const { buildFrontHtml: buildBusinessCardFront, buildBackHtml: buildBusinessCardBack } = require('./business-card-html')
const { buildFrontHtml: buildBusinessCardV2Front, buildBackHtml: buildBusinessCardV2Back } = require('./business-card-v2-html')
const { uploadPdf } = require('../supabase')

const DPI = 300

const TEMPLATE_REGISTRY = {
  'snacket-bifold-v2': {
    buildFrontHtml: buildBifoldFront,
    buildBackHtml: buildBifoldBack,
    bleedIn: 0.065,
    trimWIn: 10.98,
    trimHIn: 8.5,
  },
  'snacket-business-card': {
    buildFrontHtml: buildBusinessCardFront,
    buildBackHtml: buildBusinessCardBack,
    bleedIn: 0.06,
    trimWIn: 3.50,
    trimHIn: 2.00,
  },
  'snacket-business-card-v2': {
    buildFrontHtml: buildBusinessCardV2Front,
    buildBackHtml: buildBusinessCardV2Back,
    bleedIn: 0.06,
    trimWIn: 3.50,
    trimHIn: 2.00,
  },
}

function computeSheetDimensions(template) {
  return {
    sheetWIn: template.trimWIn + template.bleedIn * 2,
    sheetHIn: template.trimHIn + template.bleedIn * 2,
  }
}

// input: { template_key, content, palette, photo_urls, client_id }
// returns: { front_pdf_url, back_pdf_url }
async function generatePrintPiece({ template_key, content, palette, photo_urls, client_id }) {
  const template = TEMPLATE_REGISTRY[template_key]
  if (!template) throw new Error(`Unknown template_key: ${template_key}`)

  const { sheetWIn, sheetHIn } = computeSheetDimensions(template)

  const jobId = randomUUID()
  const workDir = path.join(os.tmpdir(), `print-piece-${jobId}`)
  await fs.mkdir(workDir, { recursive: true })

  try {
    const frontHtml = template.buildFrontHtml({ content, palette, photoUrls: photo_urls })
    const backHtml = template.buildBackHtml({ content, palette, photoUrls: photo_urls })

    const frontPngPath = path.join(workDir, 'front.png')
    const backPngPath = path.join(workDir, 'back.png')

    await renderHtmlStringToPng({ html: frontHtml, cssWidthIn: sheetWIn, cssHeightIn: sheetHIn, dpi: DPI, outputPngPath: frontPngPath })
    await renderHtmlStringToPng({ html: backHtml, cssWidthIn: sheetWIn, cssHeightIn: sheetHIn, dpi: DPI, outputPngPath: backPngPath })

    const frontPdfPath = path.join(workDir, 'FRONT.pdf')
    const backPdfPath = path.join(workDir, 'BACK.pdf')

    await buildPrintPdf({ pngPath: frontPngPath, pageWidthIn: sheetWIn, pageHeightIn: sheetHIn, outputPdfPath: frontPdfPath })
    await buildPrintPdf({ pngPath: backPngPath, pageWidthIn: sheetWIn, pageHeightIn: sheetHIn, outputPdfPath: backPdfPath })

    const frontStoragePath = `${client_id}/${template_key}/${jobId}-FRONT.pdf`
    const backStoragePath = `${client_id}/${template_key}/${jobId}-BACK.pdf`

    // Log which side succeeded even on partial failure — if one upload lands
    // and the other throws, Promise.all rejects with only one error and the
    // successful object is otherwise an invisible orphan in the bucket.
    const [front_pdf_url, back_pdf_url] = await Promise.all([
      uploadPdf(frontPdfPath, 'print-design-output', frontStoragePath)
        .catch(err => { console.error(`[print-piece] FRONT upload failed (${frontStoragePath}):`, err.message); throw err }),
      uploadPdf(backPdfPath, 'print-design-output', backStoragePath)
        .catch(err => { console.error(`[print-piece] BACK upload failed (${backStoragePath}):`, err.message); throw err }),
    ])
    console.log(`[print-piece] uploaded — front=${frontStoragePath} back=${backStoragePath}`)

    return { front_pdf_url, back_pdf_url }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
      .catch(err => console.error(`[print-piece] workDir cleanup failed (${workDir}):`, err.message))
  }
}

module.exports = { generatePrintPiece, computeSheetDimensions, TEMPLATE_REGISTRY }
