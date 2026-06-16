const { spawn } = require('child_process')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')

const FADE_DUR = 0.5

// Assemble pre-rendered slide images into an MP4 with xfade transitions.
// slides: [{ localPath: string, duration: number }]
// All text/logo composition is done by slide-gen.js before this function is called.
function encodeVideo(slides) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(os.tmpdir(), `rs_out_${randomUUID()}.mp4`)
    const args = []

    // Each image is looped for its duration
    slides.forEach(slide => {
      args.push('-loop', '1', '-t', String(slide.duration), '-i', slide.localPath)
    })

    let filterComplex, outputLabel

    if (slides.length === 1) {
      filterComplex = `[0:v]scale=1080:1920,setsar=1,fps=30[vout]`
      outputLabel = '[vout]'
    } else {
      const parts = []

      // Normalize each input to exact portrait resolution
      slides.forEach((_, i) => {
        parts.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
          `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[s${i}]`)
      })

      // Chain xfade transitions
      let prevLabel = 's0'
      let timeOffset = slides[0].duration

      slides.forEach((slide, i) => {
        if (i === 0) return
        const outLabel = i === slides.length - 1 ? 'vout' : `x${i}`
        const offset = Math.max(0, timeOffset - FADE_DUR)
        parts.push(
          `[${prevLabel}][s${i}]xfade=transition=fade:duration=${FADE_DUR}:offset=${offset}[${outLabel}]`
        )
        prevLabel = outLabel
        timeOffset += slide.duration
      })

      filterComplex = parts.join(';')
      outputLabel = '[vout]'
    }

    args.push('-filter_complex', filterComplex)
    args.push('-map', outputLabel)
    args.push(
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an'  // audio in Phase 2 only
    )
    args.push(outputPath)

    console.log(`[ffmpeg] spawn slides=${slides.length} fc_len=${filterComplex.length}`)

    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      if (code === 0) resolve(outputPath)
      else reject(new Error(`FFmpeg exit ${code}:\n${stderr.slice(-1000)}`))
    })
    proc.on('error', err => reject(new Error(`FFmpeg spawn error: ${err.message}`)))
  })
}

module.exports = { encodeVideo }
