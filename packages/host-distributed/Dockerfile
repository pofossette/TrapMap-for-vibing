FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src

COPY packages/server/package.json ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/server/src ./packages/server/src
COPY packages/server/drizzle ./packages/server/drizzle

COPY packages/backend-core/package.json ./packages/backend-core/
COPY packages/backend-core/tsconfig.json ./packages/backend-core/
COPY packages/backend-core/src ./packages/backend-core/src

COPY packages/client-core/package.json ./packages/client-core/
COPY packages/client-core/tsconfig.json ./packages/client-core/
COPY packages/client-core/src ./packages/client-core/src

COPY packages/runtime-infra/package.json ./packages/runtime-infra/
COPY packages/runtime-infra/tsconfig.json ./packages/runtime-infra/
COPY packages/runtime-infra/src ./packages/runtime-infra/src

COPY packages/service-identity-access/package.json ./packages/service-identity-access/
COPY packages/service-identity-access/tsconfig.json ./packages/service-identity-access/
COPY packages/service-identity-access/src ./packages/service-identity-access/src

COPY packages/service-knowledge-read/package.json ./packages/service-knowledge-read/
COPY packages/service-knowledge-read/tsconfig.json ./packages/service-knowledge-read/
COPY packages/service-knowledge-read/src ./packages/service-knowledge-read/src

COPY packages/service-knowledge-write/package.json ./packages/service-knowledge-write/
COPY packages/service-knowledge-write/tsconfig.json ./packages/service-knowledge-write/
COPY packages/service-knowledge-write/src ./packages/service-knowledge-write/src

COPY packages/service-candidate-ingestion/package.json ./packages/service-candidate-ingestion/
COPY packages/service-candidate-ingestion/tsconfig.json ./packages/service-candidate-ingestion/
COPY packages/service-candidate-ingestion/src ./packages/service-candidate-ingestion/src

COPY packages/service-governance-review/package.json ./packages/service-governance-review/
COPY packages/service-governance-review/tsconfig.json ./packages/service-governance-review/
COPY packages/service-governance-review/src ./packages/service-governance-review/src

COPY packages/service-job-runtime/package.json ./packages/service-job-runtime/
COPY packages/service-job-runtime/tsconfig.json ./packages/service-job-runtime/
COPY packages/service-job-runtime/src ./packages/service-job-runtime/src

COPY packages/host-distributed/package.json ./packages/host-distributed/
COPY packages/host-distributed/tsconfig.json ./packages/host-distributed/
COPY packages/host-distributed/src ./packages/host-distributed/src

RUN pnpm install --frozen-lockfile

FROM deps AS build

WORKDIR /app

RUN pnpm exec tsc -b \
  packages/contracts/tsconfig.json \
  packages/server/tsconfig.json \
  packages/backend-core/tsconfig.json \
  packages/client-core/tsconfig.json \
  packages/runtime-infra/tsconfig.json \
  packages/service-identity-access/tsconfig.json \
  packages/service-knowledge-read/tsconfig.json \
  packages/service-knowledge-write/tsconfig.json \
  packages/service-candidate-ingestion/tsconfig.json \
  packages/service-governance-review/tsconfig.json \
  packages/service-job-runtime/tsconfig.json \
  packages/host-distributed/tsconfig.json

FROM node:22-alpine AS production

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules

COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist

COPY packages/server/package.json ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/
COPY --from=deps /app/packages/server/drizzle ./packages/server/drizzle
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/server/dist ./packages/server/dist

COPY packages/backend-core/package.json ./packages/backend-core/
COPY packages/backend-core/tsconfig.json ./packages/backend-core/
COPY --from=deps /app/packages/backend-core/node_modules ./packages/backend-core/node_modules
COPY --from=build /app/packages/backend-core/dist ./packages/backend-core/dist

COPY packages/client-core/package.json ./packages/client-core/
COPY packages/client-core/tsconfig.json ./packages/client-core/
COPY --from=deps /app/packages/client-core/node_modules ./packages/client-core/node_modules
COPY --from=build /app/packages/client-core/dist ./packages/client-core/dist

COPY packages/runtime-infra/package.json ./packages/runtime-infra/
COPY packages/runtime-infra/tsconfig.json ./packages/runtime-infra/
COPY --from=deps /app/packages/runtime-infra/node_modules ./packages/runtime-infra/node_modules
COPY --from=build /app/packages/runtime-infra/dist ./packages/runtime-infra/dist

COPY packages/service-identity-access/package.json ./packages/service-identity-access/
COPY packages/service-identity-access/tsconfig.json ./packages/service-identity-access/
COPY --from=deps /app/packages/service-identity-access/node_modules ./packages/service-identity-access/node_modules
COPY --from=build /app/packages/service-identity-access/dist ./packages/service-identity-access/dist

COPY packages/service-knowledge-read/package.json ./packages/service-knowledge-read/
COPY packages/service-knowledge-read/tsconfig.json ./packages/service-knowledge-read/
COPY --from=deps /app/packages/service-knowledge-read/node_modules ./packages/service-knowledge-read/node_modules
COPY --from=build /app/packages/service-knowledge-read/dist ./packages/service-knowledge-read/dist

COPY packages/service-knowledge-write/package.json ./packages/service-knowledge-write/
COPY packages/service-knowledge-write/tsconfig.json ./packages/service-knowledge-write/
COPY --from=deps /app/packages/service-knowledge-write/node_modules ./packages/service-knowledge-write/node_modules
COPY --from=build /app/packages/service-knowledge-write/dist ./packages/service-knowledge-write/dist

COPY packages/service-candidate-ingestion/package.json ./packages/service-candidate-ingestion/
COPY packages/service-candidate-ingestion/tsconfig.json ./packages/service-candidate-ingestion/
COPY --from=deps /app/packages/service-candidate-ingestion/node_modules ./packages/service-candidate-ingestion/node_modules
COPY --from=build /app/packages/service-candidate-ingestion/dist ./packages/service-candidate-ingestion/dist

COPY packages/service-governance-review/package.json ./packages/service-governance-review/
COPY packages/service-governance-review/tsconfig.json ./packages/service-governance-review/
COPY --from=deps /app/packages/service-governance-review/node_modules ./packages/service-governance-review/node_modules
COPY --from=build /app/packages/service-governance-review/dist ./packages/service-governance-review/dist

COPY packages/service-job-runtime/package.json ./packages/service-job-runtime/
COPY packages/service-job-runtime/tsconfig.json ./packages/service-job-runtime/
COPY --from=deps /app/packages/service-job-runtime/node_modules ./packages/service-job-runtime/node_modules
COPY --from=build /app/packages/service-job-runtime/dist ./packages/service-job-runtime/dist

COPY packages/host-distributed/package.json ./packages/host-distributed/
COPY packages/host-distributed/tsconfig.json ./packages/host-distributed/
COPY --from=deps /app/packages/host-distributed/node_modules ./packages/host-distributed/node_modules
COPY --from=build /app/packages/host-distributed/dist ./packages/host-distributed/dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

EXPOSE 4000

WORKDIR /app/packages/host-distributed

CMD ["node", "dist/index.js", "--service", "gateway"]
