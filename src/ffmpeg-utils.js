const { spawn } = require('child_process')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')

const FADE_DUR = 0.5

const BASE_SCALE = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30'

// Assemble slides/clips into an MP4 with xfade transitions.
// slides: [{ localPath: string, duration: number, isVideo: boolean }]
// isVideo=true  → raw video clip, passed directly to FFmpeg (no Sharp)
// isVideo=false → pre-rendered image from slide-gen, looped with -loop 1
function encodeVideo(slides, audioPath = null) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(os.tmpdir(), `rs_out_${randomUUID()}.mp4`)
    const args = []

    // Images: -loop 1 -t D; video clips: just -i (duration trimmed in filter_complex)
    slides.forEach(slide => {
      if (slide.isVideo) {
        args.push('-i', slide.localPath)
      } else {
        args.push('-loop', '1', '-t', String(slide.duration), '-i', slide.localPath)
      }
    })

    let filterComplex, outputLabel

    if (slides.length === 1) {
      const s = slides[0]
      if (s.isVideo) {
        filterComplex = `[0:v]${BASE_SCALE},trim=duration=${s.duration},setpts=PTS-STARTPTS[vout]`
      } else {
        filterComplex = `[0:v]scale=1080:1920,setsar=1,fps=30[vout]`
      }
      outputLabel = '[vout]'
    } else {
      const parts = []

      // Normalize each input; video clips also get trim to enforce duration
      slides.forEach((slide, i) => {
        if (slide.isVideo) {
          parts.push(`[${i}:v]${BASE_SCALE},trim=duration=${slide.duration},setpts=PTS-STARTPTS[s${i}]`)
        } else {
          parts.push(`[${i}:v]${BASE_SCALE}[s${i}]`)
        }
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

    // Audio input after all slide inputs
    if (audioPath) {
      args.push('-i', audioPath)
    }

    args.push('-filter_complex', filterComplex)
    args.push('-map', outputLabel)

    if (audioPath) {
      // Audio input index = number of slide inputs
      args.push('-map', `${slides.length}:a`)
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
      args.push('-c:a', 'aac', '-b:a', '192k', '-shortest')
    } else {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
      args.push('-an')
    }

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
