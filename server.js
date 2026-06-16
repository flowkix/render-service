const express = require('express')
const { renderReel } = require('./src/render')
const { getClient } = require('./src/supabase')

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
