const express = require('express')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')
const { renderReel } = require('./src/render')
const { getClient } = require('./src/supabase')
const { downloadFile, extFromUrl } = require('./src/downloader')

const app = express()
app.use(express.json({ limit: '1mb' }))

let supabaseStatus = 'checking'

async function checkSupabase() {
  try {
    const sb = getClient()
    const { error } = await sb.from('content_calendar').select('id').limit(1)
    if (error) {
      supabaseStatus = `FAILED: ${error.message}`
      console.error('[server] Supabase FAILED:', error.message)
    } else {
      supabaseStatus = 'connected'
      console.log('[server] Supabase OK')
      return // stop retrying
    }
  } catch (err) {
    supabaseStatus = `FAILED: ${err.message}`
    console.error('[server] Supabase check threw:', err.message)
  }
  // Retry every 10s until connected
  setTimeout(checkSupabase, 10000)
}

app.get('/health', (_, res) => res.json({
  ok: supabaseStatus === 'connected',
  ts: Date.now(),
  supabase: supabaseStatus,
  version: 'v2'
}))

// Extract first frame from any video URL. Returns JPEG bytes.
app.post('/thumbnail', async (req, res) => {
  const { video_url } = req.body
  if (!video_url) return res.status(400).json({ ok: false, error: 'video_url required' })

  let videoPath = null
  const outPath = path.join(os.tmpdir(), `thumb_${randomUUID()}.jpg`)
  try {
    const ext = extFromUrl(video_url)
    videoPath = await downloadFile(video_url, ext)

    await new Promise((resolve, reject) => {
      // Extract frame at 0.1s; fallback to frame 0 if video shorter than that
      const proc = spawn('ffmpeg', [
        '-i', videoPath,
        '-ss', '0.1',
        '-vframes', '1',
        '-vf', 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080',
        '-f', 'image2',
        '-update', '1',
        '-y', outPath,
      ])
      let stderr = ''
      proc.stderr.on('data', d => { stderr += d.toString() })
      proc.on('close', code => {
        if (code === 0) resolve()
        else reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-500)}`))
      })
      proc.on('error', err => reject(new Error(`FFmpeg spawn: ${err.message}`)))
    })

    const jpeg = fs.readFileSync(outPath)
    res.set('Content-Type', 'image/jpeg').send(jpeg)
  } catch (err) {
    console.error('[thumbnail]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    if (videoPath) try { fs.unlinkSync(videoPath) } catch (_) {}
    try { fs.unlinkSync(outPath) } catch (_) {}
  }
})

app.post('/render', async (req, res) => {
  if (supabaseStatus !== 'connected') {
    return res.status(503).json({ ok: false, error: `Supabase not connected: ${supabaseStatus}` })
  }
  const { reel_id, scenes, audio_url, supabase_bucket, output_path } = req.body
  if (!reel_id || !Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ ok: false, error: 'reel_id and scenes[] required' })
  }
  res.status(202).json({ ok: true, reel_id, status: 'rendering' })
  renderReel({ reel_id, scenes, audio_url, supabase_bucket, output_path }).catch(err => {
    console.error('[render] fatal error for', reel_id, err.message)
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`render-service v2 listening on ${PORT}`)
  checkSupabase()
})
