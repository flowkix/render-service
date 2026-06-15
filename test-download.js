const { downloadFile, extFromUrl, isVideoExt } = require('./src/downloader')
const fs = require('fs')

async function main() {
  // Test with a real public PNG from Supabase
  const url = 'https://nrawezmnyivbmatrugdv.supabase.co/storage/v1/object/public/assets/a1b2c3d4-0001-0001-0001-000000000001/ai-generated/ai-generated-reel_clip-1781028187613-g3txy6.png'
  const ext = extFromUrl(url)
  console.log('ext:', ext, '| isVideo:', isVideoExt(ext))

  const localPath = await downloadFile(url, ext)
  const stats = fs.statSync(localPath)
  console.log('Downloaded to:', localPath, '| size:', stats.size, 'bytes')

  if (stats.size < 1000) throw new Error('File too small — download likely failed')

  fs.unlinkSync(localPath)
  console.log('✅ Download test passed')
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
