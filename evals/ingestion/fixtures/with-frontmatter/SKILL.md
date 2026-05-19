---
name: docker-deploy
description: Production Docker deployment best practices
labels:
  - docker
  - deployment
  - production
  - container
---

# Docker Deployment Best Practices

## Situation

When deploying containerized applications to production, teams often encounter issues with image size, security vulnerabilities, and configuration drift between environments. Docker multi-stage builds and proper layer caching are essential for reliable deployments.

## Problem

Large Docker images increase deployment time and attack surface. Without proper layer caching, builds are slow and unpredictable. Environment variable mismatches between staging and production cause silent failures that are hard to debug.

## Goal

Implement a secure, optimized Docker deployment pipeline with multi-stage builds, minimal final images, and validated environment configuration across all deployment targets.

## Image Optimization

Use multi-stage builds to separate build dependencies from runtime. The builder stage installs dev dependencies and compiles assets, while the final stage copies only production artifacts onto a minimal base image like `node:20-alpine`.

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

## Health Checks

Always define a HEALTHCHECK in production Dockerfiles. Without health checks, orchestrators cannot detect when a container is running but unresponsive. Set appropriate intervals and timeouts based on your application's startup characteristics.
