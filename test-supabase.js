// Load env vars from .secrets/supabase.env
const fs = require('fs')
const envContent = fs.readFileSync('C:/Users/kuikd/Projects/FLOWKIX/.secrets/supabase.env', 'utf8')
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) process.env[k.trim()] = v.join('=').trim()
})
// Map key name if needed
if (!process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
}

const { markFailed } = require('./src/supabase')

async function main() {
  // Test with a dummy reel_id that doesn't exist — should not throw, Supabase silently no-ops
  try {
    await markFailed('00000000-0000-0000-0000-000000000000', 'test error message')
    console.log('✅ Supabase client initialized and connected')
  } catch (err) {
    console.error('❌ Supabase error:', err.message)
    process.exit(1)
  }
}

main()
