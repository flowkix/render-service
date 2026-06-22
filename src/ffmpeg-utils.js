const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')

const FADE_DUR = 0.5

// Lanczos removed from BASE_SCALE — some Railway FFmpeg builds silently reject the flags
// option inside filter_complex; bilinear is universally supported and visually fine at
// 1080×1920 target resolution.
const BASE_SCALE = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30'

// White bold text, black outline, bottom-center — mirrors slide-gen overlay style
const DRAWTEXT_STYLE = 'fontsize=46:fontcolor=white:borderw=4:bordercolor=black@0.75:x=(w-text_w)/2:y=h*0.85-text_h:line_spacing=10'

// Word-wrap text at maxCharsPerLine (preserves existing \n), max 2 lines — 36×2=72 chars available
function wrapText(text, maxCharsPerLine = 36, maxLines = 2) {
  const segments = text.split('\n')
  const lines = []
  for (const segment of segments) {
    if (lines.length >= maxLines) break
    const words = segment.split(/\s+/).filter(Boolean)
    let current = ''
    for (const word of words) {
      if (lines.length >= maxLines) break
      if (current.length === 0) {
        current = word
      } else if (current.length + 1 + word.length <= maxCharsPerLine) {
        current += ' ' + word
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current && lines.length < maxLines) lines.push(current)
  }
  return lines.slice(0, maxLines).join('\n')
}

// Write word-wrapped text to a temp file so FFmpeg drawtext doesn't need shell quoting/escaping
function writeTempText(text) {
  const tf = path.join(os.tmpdir(), `rs_txt_${randomUUID()}.txt`)
  fs.writeFileSync(tf, wrapText(text), 'utf8')
  return tf
}

// Build drawtext filter segment for a video clip that has overlay text.
// Uses textfile= to bypass all quoting issues with special chars.
function drawtextSegment(textFile) {
  return `,drawtext=textfile='${textFile}':${DRAWTEXT_STYLE}`
}

// Assemble slides/clips into an MP4 with xfade transitions.
// slides: [{ localPath: string, duration: number, isVideo: boolean, text?: string }]
// isVideo=true  → raw video clip; input uses -stream_loop -1 so any clip length is padded
//                 to slide.duration without the `loop` filter (which has HEVC issues)
// isVideo=false → pre-rendered PNG from slide-gen, looped with -loop 1
// text (isVideo only) → optional overlay text burned in via FFmpeg drawtext
function encodeVideo(slides, audioPath = null) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(os.tmpdir(), `rs_out_${randomUUID()}.mp4`)
    const textTempFiles = []  // cleaned up after FFmpeg exits

    // Hard cap: each xfade now uses corrected offsets so every transition produces
    // a real FADE_DUR overlap. Actual [vout] = sum(durations) - (N-1)*FADE_DUR.
    const totalDuration = slides.length <= 1
      ? (slides[0]?.duration ?? 4)
      : slides.reduce((sum, s) => sum + s.duration, 0) - (slides.length - 1) * FADE_DUR

    const args = []

    // Build input args.
    // Images: -loop 1 -t D  (FFmpeg loops the still image for D seconds)
    // Videos: -stream_loop -1 -t D  (demuxer-level loop — reliable with ANY codec incl. HEVC)
    //   -stream_loop loops at the packet level before decoding, avoiding the `loop` filter's
    //   frame-buffer issues with HEVC B-frames. -t caps the total input duration.
    slides.forEach(slide => {
      if (slide.isVideo) {
        // Extra 0.5s buffer above target duration so trim has headroom to produce exactly D s.
        const tCap = String(slide.duration + 0.5)
        args.push('-stream_loop', '-1', '-t', tCap, '-i', slide.localPath)
      } else {
        args.push('-loop', '1', '-t', String(slide.duration), '-i', slide.localPath)
      }
    })

    let filterComplex, outputLabel

    if (slides.length === 1) {
      const s = slides[0]
      if (s.isVideo) {
        const d = s.duration
        // Simple: scale → normalize PTS → trim to exact duration → reset PTS
        // No loop filter needed — input is already looped via -stream_loop -1
        let f = `[0:v]${BASE_SCALE},setpts=PTS-STARTPTS,trim=duration=${d},setpts=PTS-STARTPTS`
        if (s.text) {
          const tf = writeTempText(s.text)
          textTempFiles.push(tf)
          f += drawtextSegment(tf)
        }
        filterComplex = `${f}[vout]`
      } else {
        // Ken Burns: zoom 1.0→1.1 (mild — avoids bilinear upscale blur of larger zooms).
        // Max zoom capped at 1.1× so the crop is only 982px → 1080px (9% upscale vs 31%
        // at the previous 1.3× cap), keeping the image crystal-clear throughout the slide.
        const d = Math.max(1, Math.round(s.duration * 30))
        const kb = [
          `zoompan=z='min(zoom+0.0008,1.1)'`,
          `x='iw/2-(iw/zoom/2)'`,
          `y='ih/2-(ih/zoom/2)'`,
          `d=${d}`,
          `s=1080x1920`,
          `fps=30`
        ].join(':')
        let f = `[0:v]${kb},setsar=1`
        if (s.text) {
          const tf = writeTempText(s.text)
          textTempFiles.push(tf)
          f += drawtextSegment(tf)
        }
        filterComplex = `${f}[vout]`
      }
      outputLabel = '[vout]'
    } else {
      const parts = []

      slides.forEach((slide, i) => {
        if (slide.isVideo) {
          const d = slide.duration
          // Input is already looped via -stream_loop -1; just scale → normalize → trim → reset.
          // trim=duration ensures exactly d seconds even if stream_loop produced slightly more.
          let f = `[${i}:v]${BASE_SCALE},setpts=PTS-STARTPTS,trim=duration=${d},setpts=PTS-STARTPTS`
          if (slide.text) {
            const tf = writeTempText(slide.text)
            textTempFiles.push(tf)
            f += drawtextSegment(tf)
          }
          parts.push(`${f}[s${i}]`)
        } else {
          // Ken Burns: zoom 1.0→1.1 — subtle motion without bilinear upscale blur.
          const d = Math.max(1, Math.round(slide.duration * 30))
          const kb = [
            `zoompan=z='min(zoom+0.0008,1.1)'`,
            `x='iw/2-(iw/zoom/2)'`,
            `y='ih/2-(ih/zoom/2)'`,
            `d=${d}`,
            `s=1080x1920`,
            `fps=30`
          ].join(':')
          let f = `[${i}:v]${kb},setsar=1`
          if (slide.text) {
            const tf = writeTempText(slide.text)
            textTempFiles.push(tf)
            f += drawtextSegment(tf)
          }
          parts.push(`${f}[s${i}]`)
        }
      })

      // Chain xfade transitions.
      // actualOffset tracks real accumulated [vout] duration after each xfade.
      // xfade output length = offset + B.duration. Using actualOffset (not naive sum)
      // guarantees offset < prev_stream_duration so xfade always includes B content.
      let prevLabel = 's0'
      let actualOffset = slides[0].duration

      slides.forEach((slide, i) => {
        if (i === 0) return
        const outLabel = i === slides.length - 1 ? 'vout' : `x${i}`
        const offset = Math.max(0, actualOffset - FADE_DUR)
        parts.push(
          `[${prevLabel}][s${i}]xfade=transition=fade:duration=${FADE_DUR}:offset=${offset}[${outLabel}]`
        )
        prevLabel = outLabel
        actualOffset = offset + slide.duration
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
      args.push('-map', `${slides.length}:a`)
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
      args.push('-c:a', 'aac', '-b:a', '192k')
      args.push('-t', totalDuration.toFixed(3))
    } else {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
      args.push('-an')
      args.push('-t', totalDuration.toFixed(3))
    }

    args.push(outputPath)

    console.log(`[ffmpeg] spawn slides=${slides.length} fc_len=${filterComplex.length}`)

    const proc = spawn('ffmpeg', args)
    // Capture both beginning and end of stderr so filter errors (early) and encoding
    // errors (late) are both visible in the stored error_message.
    let stderrHead = ''
    let stderrTail = ''
    proc.stderr.on('data', d => {
      const chunk = d.toString()
      if (stderrHead.length < 800) stderrHead += chunk
      stderrTail += chunk
      if (stderrTail.length > 1500) stderrTail = stderrTail.slice(-1500)
    })
    const cleanupTextFiles = () => textTempFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })
    proc.on('close', code => {
      cleanupTextFiles()
      if (code === 0) resolve(outputPath)
      else {
        const head = stderrHead.slice(0, 800)
        const tail = stderrTail.slice(-700)
        const combined = head === tail ? head : `${head}\n...\n${tail}`
        reject(new Error(`FFmpeg exit ${code}:\n${combined}`))
      }
    })
    proc.on('error', err => {
      cleanupTextFiles()
      reject(new Error(`FFmpeg spawn error: ${err.message}`))
    })
  })
}

module.exports = { encodeVideo }
