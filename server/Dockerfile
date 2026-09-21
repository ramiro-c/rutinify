# Imagen mínima para el backend de sync (BET-2026-001).
# Cero dependencias: solo Node 20+ y server/sync-server.mjs.
FROM node:20-alpine

WORKDIR /srv/sync
COPY server/sync-server.mjs ./sync-server.mjs

ENV SYNC_PORT=8787 \
    SYNC_DATA_PATH=/data/sync-state.json

VOLUME ["/data"]
EXPOSE 8787

CMD ["node", "sync-server.mjs"]
