
FROM node:22-alpine3.23 AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Build tools, package managers and caches never enter the runtime image.
RUN apk add --no-cache ca-certificates binutils \
    && strip --strip-unneeded /usr/local/bin/node \
    && mkdir -p /data /tmp \
    && chmod 1777 /tmp

FROM scratch AS runtime

COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /lib/ld-musl-*.so.1 /lib/
COPY --from=dependencies /usr/lib/libstdc++.so.* /usr/lib/
COPY --from=dependencies /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=dependencies /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=dependencies /data /data
COPY --from=dependencies /tmp /tmp

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY server ./server
COPY dist ./dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV STORAGE_DRIVER=sqlite
ENV ADMIN_USER=admin

VOLUME ["/data"]
EXPOSE 3000

CMD ["/usr/local/bin/node", "--use-system-ca", "server/index.mjs"]
