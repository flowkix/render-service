'use strict'
const { createClient } = require('@supabase/supabase-js')
const WebSocket = require('ws')

function getSnacketOsClient() {
  const url = process.env.SNACKET_OS_SUPABASE_URL || 'https://noielmbqxmrnkmysqyek.supabase.co'
  const key = process.env.SNACKET_OS_SUPABASE_KEY
  if (!key) throw new Error('SNACKET_OS_SUPABASE_KEY env var not set')
  // Railway runs Node 20, which lacks native WebSocket support that supabase-js's
  // Realtime client expects by default — same fix as src/supabase.js's getClient().
  return createClient(url, key, {
    realtime: { transport: WebSocket }
  })
}

// Uploads a generated PNG buffer to the public clt-alliance-generator bucket.
// Returns the public URL.
async function uploadCltAlliancePreview(buffer, leadId) {
  const supabase = getSnacketOsClient()
  const storagePath = `${leadId}.png`
  const { error } = await supabase.storage
    .from('clt-alliance-generator')
    .upload(storagePath, buffer, { contentType: 'image/png', upsert: true })
  if (error) throw new Error(`clt-alliance-generator upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from('clt-alliance-generator')
    .getPublicUrl(storagePath)
  return `${publicUrl}?v=${Date.now()}`
}

module.exports = { getSnacketOsClient, uploadCltAlliancePreview }
