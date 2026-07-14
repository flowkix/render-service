const fs = require('fs')
const path = require('path')
const { downloadFile, extFromUrl } = require('./src/downloader')
const { generateCarouselSlide } = require('./src/slide-gen')

const PHOTO_URL = 'https://nrawezmnyivbmatrugdv.supabase.co/storage/v1/object/public/snacket-assets/real-photos/hero/01-snacket-web.jpg'

async function main() {
  const srcPath = await downloadFile(PHOTO_URL, extFromUrl(PHOTO_URL))
  const outPath = await generateCarouselSlide(srcPath, {
    title: 'Every surface is a brand moment.',
    body: "Here's how the NitroCafe EV is built for yours — real activations, real reach.",
    cta: 'See it in person →',
  })

  const destPath = path.join(__dirname, 'test-carousel-output.png')
  fs.copyFileSync(outPath, destPath)
  fs.unlinkSync(srcPath)
  fs.unlinkSync(outPath)

  console.log('Test completed —', destPath)
}

main().catch(err => {
  console.error('Test failed:', err.message)
  process.exit(1)
})
