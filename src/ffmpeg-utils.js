const ffmpeg = require('fluent-ffmpeg')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')

// Font bundled in Docker at /fonts/BarlowCondensed-Bold.ttf
// Fallback to DejaVu on local dev (apt: fonts-dejavu-core)
const FONT_PATH = process.env.FONT_PATH || '/fonts/BarlowCondensed-Bold.ttf'

// Escape text for FFmpeg drawtext filter value (no surrounding quotes)
// Colons, backslashes, single quotes, and special Unicode chars must be escaped
function escapeDrawtext(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')   // backslash first
    .replace(/'/g, "’")  // replace typographic single-quote / apostrophe variant
    .replace(/[''`]/g, '')    // strip remaining ASCII single quotes (unsafe in filtergraph)
    .replace(/:/g, '\\:')     // colon separator
    .replace(/[^\x20-\x7E]/g, (ch) => {  // non-ASCII: replace em-dash etc. with ASCII equiv
      const map = { '—': '-', '–': '-', '‘': "'", '’': "'", 'é': 'e', 'á': 'a', 'ó': 'o', 'ú': 'u', 'í': 'i' }
      return map[ch] || ''
    })
    .replace(/\n/g, ' ')
    .slice(0, 200) // safety cap
}

// Build the full filter_complex string for N scenes
// Each scene: { localPath, type: 'image'|'video', duration, text }
// Returns { filterComplex, outputLabel, audioLabel }
function buildFilterComplex(scenes, hasAudio) {
  const parts = []
  const FADE_DUR = 0.5
  const FONT_SIZE = 56
  const TEXT_Y = 1640 // px from top in 1920px frame (bottom-third)
  const TEXT_SHADOW = 'shadowcolor=black@0.9:shadowx=2:shadowy=2'

  // Step 1: scale + pad + fps each input
  scenes.forEach((scene, i) => {
    let scaleFilter = `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`

    if (scene.text && scene.text.trim()) {
      const escaped = escapeDrawtext(scene.text.trim())
      // Font path: on Windows, drive letter colon must be escaped as \\: in filtergraph
      // Forward slashes only, then escape the drive-letter colon only (C: → C\\:)
      const fontEscaped = FONT_PATH.replace(/\\/g, '/').replace(/^([A-Za-z]):\//,  '$1\\\\:/')
      scaleFilter += `,drawtext=fontfile=${fontEscaped}:text=${escaped}:` +
        `fontsize=${FONT_SIZE}:fontcolor=white:${TEXT_SHADOW}:` +
        `x=(w-text_w)/2:y=${TEXT_Y}`
    }

    scaleFilter += `[scaled${i}]`
    parts.push(scaleFilter)
  })

  // Step 2: xfade transitions between scaled outputs
  let prevLabel = 'scaled0'
  let timeOffset = 0

  scenes.forEach((scene, i) => {
    if (i === 0) {
      timeOffset = scene.duration
      return
    }
    const outLabel = i === scenes.length - 1 ? 'vout' : `xf${i}`
    const offset = Math.max(0, timeOffset - FADE_DUR)
    parts.push(`[${prevLabel}][scaled${i}]xfade=transition=fade:duration=${FADE_DUR}:offset=${offset}[${outLabel}]`)
    prevLabel = outLabel
    timeOffset += scene.duration
  })

  // If only 1 scene, rename scaled0 → vout
  if (scenes.length === 1) {
    parts.push(`[scaled0]copy[vout]`)
  }

  // Step 3: optional audio mix (loop music under video)
  let audioMap = null
  if (hasAudio) {
    const audioIdx = scenes.length // audio is the last input
    const totalDur = scenes.reduce((acc, s) => acc + s.duration, 0)
    parts.push(
      `[${audioIdx}:a]aloop=loop=-1:size=2e+09,atrim=duration=${totalDur},afade=t=out:st=${totalDur - 1}:d=1,volume=0.3[aout]`
    )
    audioMap = '[aout]'
  }

  return {
    filterComplex: parts.join(';'),
    outputLabel: '[vout]',
    audioLabel: audioMap
  }
}

// Run the full FFmpeg encode. Returns path to output MP4.
function encodeVideo(scenes, audioPath) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(os.tmpdir(), `rs_out_${randomUUID()}.mp4`)
    const hasAudio = !!audioPath
    const { filterComplex, outputLabel, audioLabel } = buildFilterComplex(scenes, hasAudio)

    const cmd = ffmpeg()

    // Add video inputs
    scenes.forEach(scene => {
      if (scene.type === 'image') {
        cmd.addInput(scene.localPath)
          .inputOptions(['-loop 1', `-t ${scene.duration}`])
      } else {
        // video clip — use actual file, FFmpeg reads duration from metadata
        cmd.addInput(scene.localPath)
      }
    })

    // Add audio input
    if (hasAudio) {
      cmd.addInput(audioPath)
    }

    // Pass filter_complex as two separate args to avoid fluent-ffmpeg's internal
    // string parser, which misinterprets output labels like [scaled3] and folds
    // the rest of the filtergraph into the preceding filter's option list.
    cmd
      .outputOptions([
        '-filter_complex', filterComplex,
        `-map ${outputLabel}`,
        ...(audioLabel ? [`-map ${audioLabel}`] : []),
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        ...(audioLabel ? ['-c:a aac -b:a 128k'] : ['-an'])
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err, stdout, stderr) => {
        reject(new Error(`FFmpeg error: ${err.message}\n${stderr}`))
      })
      .run()
  })
}

module.exports = { encodeVideo }
