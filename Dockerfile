FROM node:20-slim

# Skip Puppeteer's bundled Chromium download — we use system Chromium instead
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# FFmpeg + Sharp native deps (libvips) + font tooling + system Chromium + Ghostscript
# (Ghostscript post-compresses deck PDFs — deck-pdf.js's compressPdf — since Chromium's
# print-to-PDF embeds PNG-sourced photos near-losslessly, producing 10MB+ decks that
# felt "stuck" paging through in desktop PDF viewers; found+fixed 2026-09-10)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fontconfig \
    libvips42 \
    chromium \
    ghostscript \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Bundle Barlow Condensed font
RUN mkdir -p /fonts
COPY fonts/BarlowCondensed-Bold.ttf /fonts/BarlowCondensed-Bold.ttf

# Bundle SNACKET logo (dark background version for slides + CTA)
RUN mkdir -p /logo
COPY logo/snacket-logo.png /logo/snacket-logo.png

# Non-root user
RUN useradd -m -u 1001 appuser

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R appuser:appuser /app

USER appuser

ENV PORT=3001
ENV FONT_PATH=/fonts/BarlowCondensed-Bold.ttf
ENV LOGO_PATH=/logo/snacket-logo.png

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
