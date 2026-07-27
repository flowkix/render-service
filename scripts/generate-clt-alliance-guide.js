const fs = require('fs')
const path = require('path')
const { renderHtmlStringToPng, buildPrintPdf } = require('../src/print-design/engine')
const { buildGuideHtml } = require('../src/print-design/clt-alliance-guide-html')
const { getSnacketOsClient } = require('../src/ev-engine/clt-alliance-upload')

const WIDTH_IN = 8.5
const HEIGHT_IN = 11
const DPI = 300
const STORAGE_PATH = 'guide/coffee-connect-guide.pdf'

async function main() {
  const html = buildGuideHtml()
  const outDir = path.join(__dirname, 'out')
  fs.mkdirSync(outDir, { recursive: true })
  const pngPath = path.join(outDir, 'clt-alliance-guide.png')
  const pdfPath = path.join(outDir, 'clt-alliance-guide.pdf')

  await renderHtmlStringToPng({ html, cssWidthIn: WIDTH_IN, cssHeightIn: HEIGHT_IN, dpi: DPI, outputPngPath: pngPath })
  await buildPrintPdf({ pngPath, pageWidthIn: WIDTH_IN, pageHeightIn: HEIGHT_IN, outputPdfPath: pdfPath })
  console.log('PNG:', pngPath)
  console.log('PDF:', pdfPath)

  const supabase = getSnacketOsClient()
  const pdfBuffer = fs.readFileSync(pdfPath)
  const { error } = await supabase.storage
    .from('clt-alliance-generator')
    .upload(STORAGE_PATH, pdfBuffer, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`guide PDF upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from('clt-alliance-generator')
    .getPublicUrl(STORAGE_PATH)
  console.log('Public URL:', publicUrl)
}

main().catch(err => { console.error(err); process.exit(1) })
