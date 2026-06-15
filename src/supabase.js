const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required')
  return createClient(url, key)
}

// Upload a local MP4 file to Supabase Storage
// Returns the public URL
async function uploadVideo(localPath, bucket, storagePath) {
  const supabase = getClient()
  const fileStream = fs.createReadStream(localPath)
  const { size } = fs.statSync(localPath)

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileStream, {
      contentType: 'video/mp4',
      duplex: 'half',
      upsert: true,
      headers: { 'content-length': String(size) }
    })

  if (error) throw new Error(`Supabase upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath)

  return publicUrl
}

// Mark render as succeeded — write video_url, set status to approved
async function markSuccess(reelId, videoUrl) {
  const supabase = getClient()
  const { error } = await supabase
    .from('content_calendar')
    .update({ video_url: videoUrl, status: 'approved' })
    .eq('id', reelId)

  if (error) throw new Error(`Supabase markSuccess failed: ${error.message}`)
}

// Mark render as failed — set status=failed + error_message (best-effort, does not throw)
async function markFailed(reelId, errorMessage) {
  const supabase = getClient()
  const { error } = await supabase
    .from('content_calendar')
    .update({ status: 'failed', error_message: errorMessage.slice(0, 500) })
    .eq('id', reelId)
  if (error) console.error(`[supabase] markFailed warning for ${reelId}: ${error.message}`)
}

module.exports = { uploadVideo, markSuccess, markFailed }
