// Set font path for local Windows
process.env.FONT_PATH = 'C:/Windows/Fonts/arial.ttf'
const path = require('path')
const fs = require('fs')
const os = require('os')
const { encodeVideo } = require('./src/ffmpeg-utils')

// Just verify the module loads without error
console.log('✅ ffmpeg-utils loaded')
console.log('Module exports:', Object.keys(require('./src/ffmpeg-utils')))
