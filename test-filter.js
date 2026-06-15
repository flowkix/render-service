process.env.FONT_PATH = 'C:/Windows/Fonts/arial.ttf'

// Inline the buildFilterComplex for testing
const FONT_PATH = process.env.FONT_PATH
const FADE_DUR = 0.5

const scenes = [
  { localPath: '/tmp/a.png', type: 'image', duration: 4, text: 'Hello World' },
  { localPath: '/tmp/b.png', type: 'image', duration: 4, text: 'Scene Two' },
]

// Reproduce buildFilterComplex inline to test its output
const parts = []
scenes.forEach((scene, i) => {
  let f = `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`
  if (scene.text) {
    const escaped = scene.text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
    f += `,drawtext=fontfile=${FONT_PATH}:text='${escaped}':fontsize=56:fontcolor=white:shadowcolor=black@0.9:shadowx=2:shadowy=2:x=(w-text_w)/2:y=1640`
  }
  f += `[scaled${i}]`
  parts.push(f)
})

let prevLabel = 'scaled0'
let timeOffset = 0
scenes.forEach((scene, i) => {
  if (i === 0) { timeOffset = scene.duration; return }
  const outLabel = i === scenes.length - 1 ? 'vout' : `xf${i}`
  const offset = Math.max(0, timeOffset - FADE_DUR)
  parts.push(`[${prevLabel}][scaled${i}]xfade=transition=fade:duration=${FADE_DUR}:offset=${offset}[${outLabel}]`)
  prevLabel = outLabel
  timeOffset += scene.duration
})

const fc = parts.join(';')
console.log('filter_complex:')
console.log(fc)
console.log('')

// Verify expected structure
const checks = [
  ['has scale for scene 0', fc.includes('[0:v]scale=1080:1920')],
  ['has scale for scene 1', fc.includes('[1:v]scale=1080:1920')],
  ['has drawtext on scene 0', fc.includes('drawtext=fontfile=') && fc.includes("text='Hello World'")],
  ['has xfade', fc.includes('xfade=transition=fade')],
  ['xfade offset is 3.5 (4 - 0.5)', fc.includes('offset=3.5')],
  ['output label is [vout]', fc.includes('[vout]')],
]

let allPass = true
checks.forEach(([label, pass]) => {
  console.log(`${pass ? '✅' : '❌'} ${label}`)
  if (!pass) allPass = false
})

process.exit(allPass ? 0 : 1)
