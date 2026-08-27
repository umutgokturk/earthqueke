# İSTANBUL LIVE SEISMIC — API image (REST + WebSocket, optional embedded ingestion)
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/gis/package.json packages/gis/
COPY packages/database/package.json packages/database/
COPY packages/ui/package.json packages/ui/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN npm run build -w @ils/database -w @ils/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/worker/package.json apps/worker/
COPY --from=build /repo/packages/types/package.json packages/types/
COPY --from=build /repo/packages/config/package.json packages/config/
COPY --from=build /repo/packages/gis/package.json packages/gis/
COPY --from=build /repo/packages/database/package.json packages/database/
RUN npm ci --omit=dev --no-audit --no-fund --workspace @ils/api --workspace @ils/database --workspace @ils/worker \
 && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/packages/database/dist packages/database/dist
COPY --from=build /repo/packages/database/migrations packages/database/migrations
COPY docker/api-entry.sh /app/api-entry.sh
RUN chmod +x /app/api-entry.sh
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["/app/api-entry.sh"]
