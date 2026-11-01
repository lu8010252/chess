FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server ./server
COPY public ./public

ENV NODE_ENV=production \
    PORT=8787 \
    TZ=Asia/Shanghai

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/ >/dev/null || exit 1

CMD ["node", "server/index.js"]
