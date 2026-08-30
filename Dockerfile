# 一键容器化:构建后直接提供静态站点
#   docker build -t dagong-ledger .
#   docker run -p 5173:5173 dagong-ledger
FROM node:22-alpine

WORKDIR /app

COPY server.js package.json ./
COPY index.html sw.js manifest.webmanifest ./
COPY css ./css
COPY js ./js
COPY vendor ./vendor
COPY icons ./icons

ENV PORT=5173
EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:${PORT}/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
