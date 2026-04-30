---
name: docker-deploy-trap
description: Common docker deployment pitfalls and their mitigations for production environments
labels:
  - docker
  - deployment
  - production
  - infrastructure
  - container
---

# Docker Deployment Pitfalls

## Stale Build Cache in Multi-stage Builds

When using docker multi-stage builds, the build cache can become stale if the base image is updated but the docker cache layer is not invalidated. This causes production deployments to use outdated dependencies or security patches, leading to crash and error in production.

Prerequisite: must understand docker layer caching and multi-stage build patterns.
Requires explicit `--no-cache` flag or base image pinning with digest.

To mitigate: pin base images by SHA256 digest instead of tags. Fix: use `docker build --pull` to force base image updates, and add `COPY package.json package-lock.json ./` before `RUN npm ci` to ensure dependency changes invalidate the cache.

This error is especially common in CI pipelines where docker builds are cached across commits. The container appears to build successfully but contains stale code or dependencies.

## OOM Kill from Missing Resource Limits

Kubernetes kills containers that exceed memory limits with an OOM error. When docker containers run without explicit memory limits in kubernetes, they can consume all node memory and get killed. The pod restarts with a CrashLoopBackOff status.

Requires setting requests and limits in the kubernetes deployment manifest. Fix: add `resources.limits.memory` and `resources.requests.memory` to all container specs. Test resource behavior in staging before production deployment.

## Environment Variable Mismatch Across Environments

When docker containers use different .env files between local development, staging, and production, configuration drift causes undefined behavior and crash. Common issues include missing DATABASE_URL, incorrect API endpoints, and mismatched feature flags.

To mitigate: use a single source of truth for configuration, validate environment variables at container startup. Fix: implement a startup validation script that checks all required environment variables before the main process starts.
