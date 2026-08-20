FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY README.md ./

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV STORAGE_DRIVER=sqlite
ENV ADMIN_USER=admin
ENV ADMIN_PASSWORD=adminadmin

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "--use-system-ca", "server/index.mjs"]
