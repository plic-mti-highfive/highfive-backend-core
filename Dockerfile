# =================
# STAGE 1 : Builder
# =================
FROM node:22-alpine AS builder

# Meme version de pnpm que la CI (pnpm/action-setup version: 9).
RUN corepack enable pnpm && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# Plus aucun registre prive : le contrat de donnees vit desormais dans
# `src/contracts/` (voir docs/REFACTO-V2.md), plus dans un paquet publie.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ================
# STAGE 2 : Runner
# ================
FROM node:22-alpine AS runner

RUN apk add --no-cache curl
RUN corepack enable pnpm && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
# Le contrat est servi tel quel sur /api/docs : il fait partie du livrable.
# `schemas/` porte les 99 JSON Schema vers lesquels il renvoie ; sans eux, la
# documentation s'affiche avec des schemas non resolus.
COPY openapi.yaml ./openapi.yaml
COPY schemas ./schemas
# scripts/seed.mjs n'a aucune dependance (fetch natif) : embarque tel quel
# pour que l'infra puisse le lancer comme un job ponctuel apres demarrage.
COPY scripts ./scripts

EXPOSE 3000

CMD ["node", "dist/main.js"]
