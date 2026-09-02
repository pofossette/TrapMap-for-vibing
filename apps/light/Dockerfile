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

COPY packages/db/package.json ./packages/db/
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/db/src ./packages/db/src

COPY packages/ai-providers/package.json ./packages/ai-providers/
COPY packages/ai-providers/tsconfig.json ./packages/ai-providers/
COPY packages/ai-providers/src ./packages/ai-providers/src

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

COPY packages/service-identity-access/package.json ./packages/service-identity-access/
COPY packages/service-identity-access/tsconfig.json ./packages/service-identity-access/
COPY packages/service-identity-access/src ./packages/service-identity-access/src

COPY packages/service-job-runtime/package.json ./packages/service-job-runtime/
COPY packages/service-job-runtime/tsconfig.json ./packages/service-job-runtime/
COPY packages/service-job-runtime/src ./packages/service-job-runtime/src

COPY packages/service-cron/package.json ./packages/service-cron/
COPY packages/service-cron/tsconfig.json ./packages/service-cron/
COPY packages/service-cron/src ./packages/service-cron/src

COPY packages/host-local/package.json ./packages/host-local/
COPY packages/host-local/tsconfig.json ./packages/host-local/
COPY packages/host-local/src ./packages/host-local/src

COPY apps/light/package.json ./apps/light/
COPY apps/light/tsconfig.json ./apps/light/
COPY apps/light/src ./apps/light/src

RUN pnpm install --frozen-lockfile

FROM deps AS build

WORKDIR /app

RUN pnpm exec tsc -b \
  packages/contracts/tsconfig.json \
  packages/backend-core/tsconfig.json \
  packages/db/tsconfig.json \
  packages/service-knowledge-read/tsconfig.json \
  packages/service-candidate-ingestion/tsconfig.json \
  packages/service-governance-review/tsconfig.json \
  packages/service-knowledge-write/tsconfig.json \
  packages/service-job-runtime/tsconfig.json \
  packages/service-cron/tsconfig.json \
  packages/host-local/tsconfig.json \
  apps/light/tsconfig.json

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

COPY packages/db/package.json ./packages/db/
COPY packages/db/tsconfig.json ./packages/db/
COPY --from=build /app/packages/db/dist ./packages/db/dist

COPY packages/ai-providers/package.json ./packages/ai-providers/
COPY packages/ai-providers/tsconfig.json ./packages/ai-providers/
COPY --from=build /app/packages/ai-providers/dist ./packages/ai-providers/dist

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

COPY packages/service-identity-access/package.json ./packages/service-identity-access/
COPY packages/service-identity-access/tsconfig.json ./packages/service-identity-access/
COPY --from=build /app/packages/service-identity-access/dist ./packages/service-identity-access/dist

COPY packages/service-job-runtime/package.json ./packages/service-job-runtime/
COPY packages/service-job-runtime/tsconfig.json ./packages/service-job-runtime/
COPY --from=build /app/packages/service-job-runtime/dist ./packages/service-job-runtime/dist

COPY packages/service-cron/package.json ./packages/service-cron/
COPY packages/service-cron/tsconfig.json ./packages/service-cron/
COPY --from=build /app/packages/service-cron/dist ./packages/service-cron/dist

COPY packages/host-local/package.json ./packages/host-local/
COPY packages/host-local/tsconfig.json ./packages/host-local/
COPY --from=build /app/packages/host-local/dist ./packages/host-local/dist

COPY apps/light/package.json ./apps/light/
COPY apps/light/tsconfig.json ./apps/light/
COPY --from=build /app/apps/light/dist ./apps/light/dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

WORKDIR /app/apps/light

CMD ["node", "dist/index.js"]
