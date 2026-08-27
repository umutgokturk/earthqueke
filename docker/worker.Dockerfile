# İSTANBUL LIVE SEISMIC — standalone ingestion worker image
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
COPY apps/worker ./apps/worker
RUN npm run build -w @ils/worker

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/apps/worker/package.json apps/worker/
COPY --from=build /repo/packages/types/package.json packages/types/
COPY --from=build /repo/packages/config/package.json packages/config/
COPY --from=build /repo/packages/gis/package.json packages/gis/
COPY --from=build /repo/packages/database/package.json packages/database/
RUN npm ci --omit=dev --no-audit --no-fund --workspace @ils/worker --workspace @ils/database \
 && npm cache clean --force
COPY --from=build /repo/apps/worker/dist apps/worker/dist
CMD ["node", "apps/worker/dist/main.js"]
