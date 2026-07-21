'use strict'
const axios = require('axios')
const fs = require('fs')

const MAX_INLINE_PAYLOAD_BYTES = 8_000_000 // proven Gemini practical limit (base64 total)

async function fetchBuffer(source) {
  if (Buffer.isBuffer(source)) return source
  if (/^https?:\/\//i.test(source)) {
    const resp = await axios.get(source, { responseType: 'arraybuffer', timeout: 30000 })
    return Buffer.from(resp.data)
  }
  return fs.promises.readFile(source)
}

function sniffMime(buffer, hint = '') {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer.length >= 12 && buffer.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  if (/\.png$/i.test(hint)) return 'image/png'
  if (/\.jpe?g$/i.test(hint)) return 'image/jpeg'
  if (/\.webp$/i.test(hint)) return 'image/webp'
  return 'image/png'
}

// Total base64 payload guard — throws before the API rejects or silently truncates
function assertPayloadWithinLimit(buffers, maxBytes = MAX_INLINE_PAYLOAD_BYTES) {
  const totalBase64 = buffers.reduce((sum, b) => sum + Math.ceil(b.length / 3) * 4, 0)
  if (totalBase64 > maxBytes) {
    throw new Error(
      `Inline payload ${(totalBase64 / 1e6).toFixed(1)}MB base64 exceeds ${(maxBytes / 1e6).toFixed(1)}MB limit — downscale inputs first`
    )
  }
  return totalBase64
}

module.exports = { fetchBuffer, sniffMime, assertPayloadWithinLimit, MAX_INLINE_PAYLOAD_BYTES }
