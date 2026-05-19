# Stage 1: Dependencies
FROM node:22-alpine AS deps

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace root files for dependency caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy contracts package (server depends on it)
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src

# Copy server package
COPY packages/server/package.json ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/server/src ./packages/server/src

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build

WORKDIR /app

# Build TypeScript (only contracts + server, not CLI)
RUN pnpm exec tsc -b packages/contracts/tsconfig.json packages/server/tsconfig.json

# Stage 3: Production
FROM node:22-alpine AS production

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy contracts package (built)
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist

# Copy server package (built)
COPY packages/server/package.json ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/
COPY --from=build /app/packages/server/dist ./packages/server/dist

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/packages/server

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

# Run the server
CMD ["node", "dist/index.js"]
