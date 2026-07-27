const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const FONT_FILES = [
  { pkg: '@fontsource/barlow-condensed', weight: '700' },
  { pkg: '@fontsource/barlow-condensed', weight: '800' },
  { pkg: '@fontsource/barlow-condensed', weight: '900' },
  { pkg: '@fontsource/barlow', weight: '400' },
  { pkg: '@fontsource/barlow', weight: '600' },
  { pkg: '@fontsource/barlow', weight: '700' },
]

let cachedCss = null

function loadFontFaceCss() {
  if (cachedCss) return cachedCss

  const blocks = FONT_FILES.map(({ pkg, weight }) => {
    const pkgDir = path.dirname(require.resolve(`${pkg}/${weight}.css`))
    const cssPath = path.join(pkgDir, `${weight}.css`)
    let css = fs.readFileSync(cssPath, 'utf8')
    // Rewrite `url(./files/xyz.woff2)` -> `url(file:///absolute/path/xyz.woff2)`
    css = css.replace(/url\(\.\/files\/([^)]+)\)/g, (_match, filename) => {
      const absPath = path.join(pkgDir, 'files', filename)
      return `url(${pathToFileURL(absPath).href})`
    })
    return css
  })

  cachedCss = blocks.join('\n')
  return cachedCss
}

module.exports = { loadFontFaceCss }
