FROM node:20-slim

# FFmpeg + font dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    fonts-liberation \
    fontconfig \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Download Barlow Condensed Bold from Google Fonts
RUN mkdir -p /fonts && \
    wget -q "https://fonts.gstatic.com/s/barlowcondensed/v12/HTxxL3I-JCGChYJ8VI-L6OO_au7B6xTT3g.ttf" \
    -O /fonts/BarlowCondensed-Bold.ttf

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV PORT=3001
ENV FONT_PATH=/fonts/BarlowCondensed-Bold.ttf

EXPOSE 3001
CMD ["node", "server.js"]
