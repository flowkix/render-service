const express = require('express')
const { renderReel } = require('./src/render')

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }))

app.post('/render', async (req, res) => {
  const { reel_id, scenes, audio_url, supabase_bucket, output_path } = req.body

  if (!reel_id || !Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ ok: false, error: 'reel_id and scenes[] required' })
  }

  // Respond 202 immediately — render runs async, updates Supabase when done
  res.status(202).json({ ok: true, reel_id, status: 'rendering' })

  renderReel({ reel_id, scenes, audio_url, supabase_bucket, output_path }).catch(err => {
    console.error('[render] fatal error for', reel_id, err.message)
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`render-service listening on ${PORT}`))
