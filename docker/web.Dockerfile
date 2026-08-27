# İSTANBUL LIVE SEISMIC — Next.js frontend image (standalone output)
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
COPY apps/web ./apps/web
# Browser-facing env baked at build time (override per deployment)
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws
ARG NEXT_PUBLIC_MAPTILER_KEY=
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_MAPTILER_KEY=$NEXT_PUBLIC_MAPTILER_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @ils/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build /repo/apps/web/public apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
