FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src

COPY packages/backend-core/package.json ./packages/backend-core/
COPY packages/backend-core/tsconfig.json ./packages/backend-core/
COPY packages/backend-core/src ./packages/backend-core/src

COPY packages/service-knowledge-read/package.json ./packages/service-knowledge-read/
COPY packages/service-knowledge-read/tsconfig.json ./packages/service-knowledge-read/
COPY packages/service-knowledge-read/src ./packages/service-knowledge-read/src

COPY packages/service-candidate-ingestion/package.json ./packages/service-candidate-ingestion/
COPY packages/service-candidate-ingestion/tsconfig.json ./packages/service-candidate-ingestion/
COPY packages/service-candidate-ingestion/src ./packages/service-candidate-ingestion/src

COPY packages/service-governance-review/package.json ./packages/service-governance-review/
COPY packages/service-governance-review/tsconfig.json ./packages/service-governance-review/
COPY packages/service-governance-review/src ./packages/service-governance-review/src

COPY packages/service-knowledge-write/package.json ./packages/service-knowledge-write/
COPY packages/service-knowledge-write/tsconfig.json ./packages/service-knowledge-write/
COPY packages/service-knowledge-write/src ./packages/service-knowledge-write/src

COPY packages/host-local/package.json ./packages/host-local/
COPY packages/host-local/tsconfig.json ./packages/host-local/
COPY packages/host-local/src ./packages/host-local/src

RUN pnpm install --frozen-lockfile

FROM deps AS build

WORKDIR /app

RUN pnpm exec tsc -b \
  packages/contracts/tsconfig.json \
  packages/backend-core/tsconfig.json \
  packages/service-knowledge-read/tsconfig.json \
  packages/service-candidate-ingestion/tsconfig.json \
  packages/service-governance-review/tsconfig.json \
  packages/service-knowledge-write/tsconfig.json \
  packages/host-local/tsconfig.json

FROM node:22-alpine AS production

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules

COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist

COPY packages/backend-core/package.json ./packages/backend-core/
COPY packages/backend-core/tsconfig.json ./packages/backend-core/
COPY --from=build /app/packages/backend-core/dist ./packages/backend-core/dist

COPY packages/service-knowledge-read/package.json ./packages/service-knowledge-read/
COPY packages/service-knowledge-read/tsconfig.json ./packages/service-knowledge-read/
COPY --from=build /app/packages/service-knowledge-read/dist ./packages/service-knowledge-read/dist

COPY packages/service-candidate-ingestion/package.json ./packages/service-candidate-ingestion/
COPY packages/service-candidate-ingestion/tsconfig.json ./packages/service-candidate-ingestion/
COPY --from=build /app/packages/service-candidate-ingestion/dist ./packages/service-candidate-ingestion/dist

COPY packages/service-governance-review/package.json ./packages/service-governance-review/
COPY packages/service-governance-review/tsconfig.json ./packages/service-governance-review/
COPY --from=build /app/packages/service-governance-review/dist ./packages/service-governance-review/dist

COPY packages/service-knowledge-write/package.json ./packages/service-knowledge-write/
COPY packages/service-knowledge-write/tsconfig.json ./packages/service-knowledge-write/
COPY --from=build /app/packages/service-knowledge-write/dist ./packages/service-knowledge-write/dist

COPY packages/host-local/package.json ./packages/host-local/
COPY packages/host-local/tsconfig.json ./packages/host-local/
COPY --from=build /app/packages/host-local/dist ./packages/host-local/dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

WORKDIR /app/packages/host-local

CMD ["node", "dist/index.js"]
