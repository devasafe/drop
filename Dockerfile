# ============================================================
# Backend DROP — Express + Socket.io + Prisma (PostgreSQL)
# Multi-stage. Build compila TS + gera o Prisma Client;
# o runtime aplica as migrations e sobe o servidor.
# ============================================================

# ---------- build ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# openssl é exigido pelos engines do Prisma
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instala TODAS as deps (o build precisa de typescript/@types, que são devDependencies).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install --include=dev --legacy-peer-deps

# Gera o client tipado do Prisma a partir do schema
RUN npx prisma generate

# Compila o TypeScript (tsconfig.build.json exclui src/tests)
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Reaproveita o node_modules do build (traz o Prisma Client gerado), MAS remove as
# devDependencies (typescript, jest, eslint, ts-node-dev…) p/ a imagem final ficar
# bem menor — o export da imagem estava estourando memória/disco (OOM) na VPS.
# `prisma` (CLI, usado no migrate deploy) virou dependency, então sobrevive ao prune;
# `prisma generate` reconstrói o client caso o prune toque em .prisma.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist

# O server escuta em 0.0.0.0:PORT (default 4000). Coolify injeta as envs.
EXPOSE 4000

# Aplica migrations pendentes e sobe o servidor.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
