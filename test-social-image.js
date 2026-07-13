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
    // Stress case: title near the real production worst case — WF7's Map Config node
    // truncates `hook` to ~70 chars before it reaches this endpoint, so this uses a
    // 65-char title (realistic upper bound, not an arbitrary long string). At 1200px
    // width this still wraps to 4 lines with the default title size, which is exactly
    // the scenario that pushed titleStartY above the top edge and clipped glyph tops
    // (confirmed via pixel-row brightness analysis) before the shrink-to-fit fix.
    name: 'linkedin-long',
    width: 1200,
    height: 627,
    title: 'Why Charlotte businesses are switching to mobile EV activations',
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
