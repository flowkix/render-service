const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')
const { renderHtmlStringToPng, buildPrintPdf } = require('./engine')
const { buildExteriorHtml, buildInteriorHtml } = require('./bifold-html')
const { uploadPdf } = require('../supabase')

const DPI = 300
const BLEED_IN = 0.065
const TRIM_W_IN = 10.98
const TRIM_H_IN = 8.5
const SHEET_W_IN = TRIM_W_IN + BLEED_IN * 2
const SHEET_H_IN = TRIM_H_IN + BLEED_IN * 2

const TEMPLATE_BUILDERS = {
  'snacket-bifold-v2': { buildExteriorHtml, buildInteriorHtml },
}

// input: { template_key, content, palette, photo_urls, client_id }
// returns: { front_pdf_url, back_pdf_url }
async function generatePrintPiece({ template_key, content, palette, photo_urls, client_id }) {
  const builders = TEMPLATE_BUILDERS[template_key]
  if (!builders) throw new Error(`Unknown template_key: ${template_key}`)

  const jobId = randomUUID()
  const workDir = path.join(os.tmpdir(), `print-piece-${jobId}`)
  await fs.mkdir(workDir, { recursive: true })

  try {
    const exteriorHtml = builders.buildExteriorHtml({ content, palette, photoUrls: photo_urls })
    const interiorHtml = builders.buildInteriorHtml({ content, palette, photoUrls: photo_urls })

    const exteriorPng = path.join(workDir, 'exterior.png')
    const interiorPng = path.join(workDir, 'interior.png')

    await renderHtmlStringToPng({ html: exteriorHtml, cssWidthIn: SHEET_W_IN, cssHeightIn: SHEET_H_IN, dpi: DPI, outputPngPath: exteriorPng })
    await renderHtmlStringToPng({ html: interiorHtml, cssWidthIn: SHEET_W_IN, cssHeightIn: SHEET_H_IN, dpi: DPI, outputPngPath: interiorPng })

    const frontPdfPath = path.join(workDir, 'FRONT.pdf')
    const backPdfPath = path.join(workDir, 'BACK.pdf')

    await buildPrintPdf({ pngPath: exteriorPng, pageWidthIn: SHEET_W_IN, pageHeightIn: SHEET_H_IN, outputPdfPath: frontPdfPath })
    await buildPrintPdf({ pngPath: interiorPng, pageWidthIn: SHEET_W_IN, pageHeightIn: SHEET_H_IN, outputPdfPath: backPdfPath })

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

module.exports = { generatePrintPiece }
