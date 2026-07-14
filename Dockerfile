# =================
# STAGE 1 : Builder
# =================
FROM node:22-alpine AS builder

# Meme version de pnpm que la CI (pnpm/action-setup version: 9). Sans epingle,
# corepack tire la derniere version, dont la politique minimumReleaseAge rejette
# toute dependance publiee depuis moins de 24h — ce qui casse le build juste
# apres la publication d'une nouvelle version de shared-types.
RUN corepack enable pnpm && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=secret,id=github_token \
    echo "@plic-mti-highfive:registry=https://npm.pkg.github.com/" > .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/github_token)" >> .npmrc && \
    pnpm install --frozen-lockfile && \
    rm .npmrc

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

RUN --mount=type=secret,id=github_token \
    echo "@plic-mti-highfive:registry=https://npm.pkg.github.com/" > .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/github_token)" >> .npmrc && \
    pnpm install --prod --frozen-lockfile && \
    rm .npmrc

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]