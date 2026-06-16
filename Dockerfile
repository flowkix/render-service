FROM node:20-slim

# FFmpeg + Sharp native deps (libvips) + font tooling
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fontconfig \
    libvips42 \
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
