const fs = require('fs')
const { downloadFile, extFromUrl, isVideoExt } = require('./downloader')
const { encodeVideo } = require('./ffmpeg-utils')
const { uploadVideo, markSuccess, markFailed } = require('./supabase')

async function renderReel({ reel_id, scenes, audio_url, supabase_bucket = 'assets', output_path }) {
  const downloadedFiles = []

  try {
    console.log(`[render] start reel=${reel_id} scenes=${scenes.length}`)

    // 1. Download all media
    const processedScenes = await Promise.all(scenes.map(async (scene, i) => {
      const ext = extFromUrl(scene.src)
      const localPath = await downloadFile(scene.src, ext)
      downloadedFiles.push(localPath)

      const type = isVideoExt(ext) ? 'video' : 'image'
      const duration = type === 'video'
        ? (scene.duration || 6)   // WF10 can pass duration; fallback 6s
        : (scene.duration || 4)   // images default 4s

      return {
        localPath,
        type,
        duration,
        text: scene.text || ''
      }
    }))

    // 2. Download audio if provided
    let audioPath = null
    if (audio_url) {
      const audioExt = extFromUrl(audio_url)
      audioPath = await downloadFile(audio_url, audioExt)
      downloadedFiles.push(audioPath)
    }

    // 3. Encode with FFmpeg
    const storagePath = output_path || `reels/${reel_id}.mp4`
    console.log(`[render] encoding reel=${reel_id}`)
    const outputMp4 = await encodeVideo(processedScenes, audioPath)
    downloadedFiles.push(outputMp4)

    // 4. Upload to Supabase
    console.log(`[render] uploading reel=${reel_id} to ${supabase_bucket}/${storagePath}`)
    const videoUrl = await uploadVideo(outputMp4, supabase_bucket, storagePath)

    // 5. Mark success in content_calendar
    await markSuccess(reel_id, videoUrl)
    console.log(`[render] done reel=${reel_id} url=${videoUrl}`)

  } catch (err) {
    console.error(`[render] FAILED reel=${reel_id}`, err.message)
    await markFailed(reel_id, err.message).catch(() => {})
  } finally {
    // Cleanup all temp files
    downloadedFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })
  }
}

module.exports = { renderReel }
