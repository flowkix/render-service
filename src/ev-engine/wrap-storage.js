'use strict'
const { getSnacketOsClient } = require('./clt-alliance-upload')

// Bucket is PRIVATE (Task 6 below) — this returns a storage PATH, not a public URL. HUB's
// compose route (which holds the SNACKET-OS service-role key) signs it before ever serving
// it to a browser. Never return this value directly to an unauthenticated caller.
async function uploadEvWrapRender(buffer, leadId, vehicleSlug, angle) {
  const supabase = getSnacketOsClient()
  const storagePath = `${leadId}/${vehicleSlug}-${angle}-${Date.now()}.jpg`
  const { error } = await supabase.storage
    .from('ev-wrap-renders')
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(`ev-wrap-renders upload failed: ${error.message}`)
  return storagePath
}

module.exports = { uploadEvWrapRender }
