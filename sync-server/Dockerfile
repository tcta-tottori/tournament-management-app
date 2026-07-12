# 観戦用 WebSocket 中継サーバー
# Render 以外（Railway / Fly.io / 自前VPS 等）へデプロイする場合に使用。
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.mjs ./
# 多くのホストは PORT を環境変数で注入する。未指定なら 8787。
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
