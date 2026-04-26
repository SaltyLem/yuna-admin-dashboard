FROM node:22-alpine

# Puppeteer 用 Chromium + 日本語フォント (sub copy / catch の表示に必須).
# alpine の bundled Chromium は musl 非対応で起動失敗するので、system
# chromium-browser を使う.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-cjk \
    font-noto-emoji

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

CMD ["npm", "run", "dev"]
