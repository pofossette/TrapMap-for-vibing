---
name: ci-pipeline-trap
description: CI/CD pipeline pitfalls including flaky tests, cache invalidation, and timeout cascades
labels:
  - ci
  - cd
  - github
  - docker
  - testing
  - pipeline
  - vitest
---

# CI/CD Pipeline Pitfalls

## Flaky Test Timing in CI

Tests that depend on timing (setTimeout, animation frames, debounce) fail intermittently in CI due to slower container resources. A test that passes consistently in local development with 100ms timeout fails randomly in CI where the container is under load. The failure is not reproducible locally, making debugging extremely difficult.

Prerequisite: must understand test timing and deterministic testing patterns.
Requires using fake timers and avoiding real waits in tests.

To mitigate: use vitest fake timers (vi.useFakeTimers) instead of real waits. Fix: replace all setTimeout delays with vi.advanceTimersByTime, use waitFor utility for async assertions, and set appropriate retry counts for genuinely flaky tests in CI.

## Docker Layer Cache Invalidation

CI pipelines that cache docker layers suffer from cache invalidation when the base image or dependencies change. The cache serves stale layers, and the CI builds an image with outdated dependencies. This causes runtime errors in production that cannot be reproduced in local development because the local docker cache is different.

Fix: use multi-stage builds with explicit cache targets, pull the latest base image before building, and hash the lockfile as part of the cache key.

## Test Container Startup Race Condition

When CI starts a database container and immediately runs tests, the tests fail because the database is not ready to accept connections. The error is "cannot connect to database" or "connection refused". This is a race condition between container startup and test execution.

Requires a health check wait strategy. Fix: add a health check to the docker-compose service definition and wait for it before running tests. Use wait-for-it or a similar tool to poll the database port.
