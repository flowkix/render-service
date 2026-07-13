const fs = require('fs')
const path = require('path')
const { downloadFile, extFromUrl } = require('./src/downloader')
const { generateOverlaySlide } = require('./src/slide-gen')

const PHOTO_URL = 'https://nrawezmnyivbmatrugdv.supabase.co/storage/v1/object/public/snacket-assets/real-photos/hero/01-snacket-web.jpg'

const CASES = [
  {
    name: 'linkedin',
    width: 1200,
    height: 627,
    title: 'Every surface is a brand moment worth owning.',
    body: "Here's how Charlotte brands are using mobile activations to show up where their audience already is.",
    cta: '',
  },
  {
    name: 'blog',
    width: 1200,
    height: 630,
    title: 'The wrap that turns heads.',
    body: 'Full vehicle canvas, high-visibility, high-impact — electric, mobile, impossible to ignore.',
    cta: 'Read the full story →',
  },
  {
    // Stress case: long title that wraps to ~3 lines at 1200px width (wrap ~24 chars/line),
    // combined with a 2-line body and no cta, at LinkedIn dimensions. This is the scenario
    // most likely to push the title's start position above the top edge of a short canvas.
    name: 'linkedin-long',
    width: 1200,
    height: 627,
    title: 'Why Charlotte businesses are switching to mobile electric vehicle activations this year',
    body: 'Lower cost per impression, zero emissions, and a presence your competitors cannot match at events.',
    cta: '',
  },
]

async function main() {
  const srcPath = await downloadFile(PHOTO_URL, extFromUrl(PHOTO_URL))
  for (const c of CASES) {
    const outPath = await generateOverlaySlide(srcPath, c, { width: c.width, height: c.height })
    const destPath = path.join(__dirname, `test-social-${c.name}-output.png`)
    fs.copyFileSync(outPath, destPath)
    fs.unlinkSync(outPath)
    console.log(`${c.name}: ${destPath}`)
  }
  fs.unlinkSync(srcPath)
  console.log('Test completed')
}

main().catch(err => {
  console.error('Test failed:', err.message)
  process.exit(1)
})
