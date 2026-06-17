const fs = require('fs')
const { downloadFile, extFromUrl } = require('./downloader')
const { generateSlide, generateCtaSlide } = require('./slide-gen')
const { encodeVideo } = require('./ffmpeg-utils')
const { uploadVideo, markSuccess, markFailed } = require('./supabase')

const TIMEOUT_MS = 5 * 60 * 1000  // 5 minutes

async function renderReel({ reel_id, scenes, audio_url, supabase_bucket = 'assets', output_path }) {
  const tempFiles = []
  let timedOut = false

  const timeoutHandle = setTimeout(async () => {
    timedOut = true
    console.error(`[render] TIMEOUT reel=${reel_id}`)
    try {
      await markFailed(reel_id, 'Render timed out after 5 minutes')
    } catch {}
    tempFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })
  }, TIMEOUT_MS)

  const t0 = Date.now()

  try {
    console.log(`[render] start reel=${reel_id} scenes=${scenes.length}`)

    const slides = []

    for (let i = 0; i < scenes.length; i++) {
      if (timedOut) return
      const scene = scenes[i]
      const ts = Date.now()
      console.log(`[render] slide ${i}/${scenes.length} type=${scene.type || 'image'} generating...`)

      if (scene.type === 'cta') {
        const slidePath = await generateCtaSlide(scene.text || '')
        tempFiles.push(slidePath)
        slides.push({ localPath: slidePath, duration: scene.duration || 3, isVideo: false })
      } else if (scene.type === 'video') {
        // Raw video clip — pass directly to FFmpeg, skip Sharp
        const ext = extFromUrl(scene.src) || '.mov'
        const clipPath = await downloadFile(scene.src, ext)
        tempFiles.push(clipPath)
        slides.push({ localPath: clipPath, duration: scene.duration || 6, isVideo: true, text: scene.text || '' })
      } else {
        // Image: process through slide-gen (Sharp)
        const srcPath = await downloadFile(scene.src, extFromUrl(scene.src))
        tempFiles.push(srcPath)
        const slidePath = await generateSlide(srcPath, scene.text || '')
        tempFiles.push(slidePath)
        slides.push({ localPath: slidePath, duration: scene.duration || 4, isVideo: false })
      }

      console.log(`[render] slide ${i}/${scenes.length} done (${elapsed(ts)}s)`)
    }

    if (timedOut) return
    const t1 = Date.now()
    console.log(`[render] all slides done (${elapsed(t0)}s)`)

    // Download audio if provided (Library or Jamendo URL)
    let audioPath = null
    if (audio_url) {
      console.log(`[render] downloading audio: ${audio_url}`)
      audioPath = await downloadFile(audio_url, '.mp3')
      tempFiles.push(audioPath)
      console.log(`[render] audio downloaded → ${audioPath}`)
    }

    console.log(`[render] encoding${audioPath ? ' +audio' : ''}...`)
    const outputMp4 = await encodeVideo(slides, audioPath)
    tempFiles.push(outputMp4)
    console.log(`[render] encode done (${elapsed(t1)}s)`)

    if (timedOut) return

    const storagePath = output_path || `reels/${reel_id}.mp4`
    console.log(`[render] uploading ${storagePath}`)
    const t2 = Date.now()
    const videoUrl = await uploadVideo(outputMp4, supabase_bucket, storagePath)
    console.log(`[render] upload done (${elapsed(t2)}s)`)

    await markSuccess(reel_id, videoUrl)
    clearTimeout(timeoutHandle)
    console.log(`[render] markSuccess OK — TOTAL ${elapsed(t0)}s ✓`)

  } catch (err) {
    clearTimeout(timeoutHandle)
    if (timedOut) return
    console.error(`[render] FAILED reel=${reel_id}`, err.message)

    try {
      await markFailed(reel_id, err.message)
    } catch (e1) {
      console.error(`[render] markFailed attempt 1 failed: ${e1.message}`)
      await new Promise(r => setTimeout(r, 2000))
      try {
        await markFailed(reel_id, 'Render failed (retry)')
      } catch (e2) {
        console.error(`[FATAL] DB unreachable for reel=${reel_id}: ${e2.message}`)
      }
    }
  } finally {
    tempFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })
  }
}

function elapsed(since) {
  return ((Date.now() - since) / 1000).toFixed(1)
}

module.exports = { renderReel }
