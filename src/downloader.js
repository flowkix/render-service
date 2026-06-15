const axios = require('axios')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Download a URL to a temp file. Returns local file path.
// Retries once on failure. Cleans up partial file on error.
async function downloadFile(url, ext) {
  const tmpPath = path.join(os.tmpdir(), `rs_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await axios.get(url, { responseType: 'stream', timeout: 30000 })
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tmpPath)
        resp.data.pipe(writer)
        resp.data.once('error', err => { writer.destroy(); reject(err) })
        writer.once('finish', resolve)
        writer.once('error', err => { resp.data.destroy(); reject(err) })
      })
      return tmpPath
    } catch (err) {
      try { fs.unlinkSync(tmpPath) } catch (_) {}
      if (attempt === 2) throw new Error(`Download failed (${url}): ${err.message}`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
}

// Detect file extension from URL path
function extFromUrl(url) {
  const u = new URL(url)
  const p = u.pathname.toLowerCase()
  if (p.match(/\.(mp4|mov|webm|avi)$/)) return '.mp4'
  if (p.match(/\.(jpg|jpeg)$/)) return '.jpg'
  if (p.match(/\.(png)$/)) return '.png'
  if (p.match(/\.(gif)$/)) return '.gif'
  if (p.match(/\.(webp)$/)) return '.webp'
  if (p.match(/\.(mp3|m4a|aac|wav)$/)) return '.mp3'
  return '.bin'
}

function isVideoExt(ext) {
  return ['.mp4', '.mov', '.webm', '.avi'].includes(ext)
}

module.exports = { downloadFile, extFromUrl, isVideoExt }
