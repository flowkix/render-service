// Load Supabase credentials from .secrets
const fs = require('fs')
const envContent = fs.readFileSync('C:/Users/kuikd/Projects/FLOWKIX/.secrets/supabase.env', 'utf8')
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) process.env[k.trim()] = v.join('=').trim()
})
if (!process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
}
process.env.SUPABASE_URL = 'https://nrawezmnyivbmatrugdv.supabase.co'
// Use a Windows font for local FFmpeg (drawtext)
process.env.FONT_PATH = 'C:/Windows/Fonts/arial.ttf'

const { renderReel } = require('./src/render')

renderReel({
  reel_id: '5f1a21fb-2cbc-42c9-92ef-6944dfb6b7bb',
  scenes: [
    {
      src: 'https://nrawezmnyivbmatrugdv.supabase.co/storage/v1/object/public/assets/a1b2c3d4-0001-0001-0001-000000000001/ai-generated/ai-generated-reel_clip-1781028187613-g3txy6.png',
      type: 'image',
      duration: 4,
      text: 'SNACKET — Activate Your Brand'
    },
    {
      src: 'https://nrawezmnyivbmatrugdv.supabase.co/storage/v1/object/public/assets/a1b2c3d4-0001-0001-0001-000000000001/ai-generated/ai-generated-reel_clip-1781026385843-9mxihn.png',
      type: 'image',
      duration: 4,
      text: 'Custom activations for your market'
    }
  ],
  supabase_bucket: 'assets',
  output_path: 'reels/test-render-001.mp4'
}).then(() => {
  console.log('Test completed')
  process.exit(0)
}).catch(err => {
  console.error('Test failed:', err.message)
  process.exit(1)
})
