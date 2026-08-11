# ============================================================
# Frontend DROP — Next.js 13 (Pages Router), output standalone
# A URL da API é resolvida por hostname em runtime (lib/api.ts),
# então NÃO precisa de NEXT_PUBLIC_API_URL no build. Só a chave
# do Google Maps é inlinada em build time (variável NEXT_PUBLIC).
# ============================================================

# ---------- deps ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# ---------- build ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Chave do Google Maps (pública, vai pro bundle do browser).
# Passe como Build Variable no Coolify; sem ela o mapa não carrega.
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
# Chave do MapTiler (Drop Maps) — pública, inlinada no build. Setar como Build
# Variable no Coolify; sem ela o mapa mostra o aviso "configure a chave".
ARG NEXT_PUBLIC_MAPTILER_KEY
ENV NEXT_PUBLIC_MAPTILER_KEY=$NEXT_PUBLIC_MAPTILER_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Standalone server precisa escutar em todas as interfaces (proxy do Coolify)
ENV HOSTNAME=0.0.0.0

# Artefatos do build standalone
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
