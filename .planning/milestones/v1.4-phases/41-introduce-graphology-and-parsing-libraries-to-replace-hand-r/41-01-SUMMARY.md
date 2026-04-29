---
phase: 41
plan: 01
subsystem: dependency-boundaries
tags: [graphology, parsing, nanoid, wrappers, ids]
requires:
  - phase: 40
    provides: "Shared parsing and MIME wrappers already adopted by CLI and server callsites"
provides:
  - "Shared server-side nanoid wrapper for prefixed identifiers"
  - "Query and duplicate-case IDs routed through one internal helper"
  - "Phase 41 dependency boundary completed without pulling Phase 42 runtime migration into scope"
affects: [phase-42, rag-log, duplicate-detection]
tech-stack:
  added: [nanoid]
  patterns: [shared-wrapper, package-local-dependency, behavior-preserving-migration]
key-files:
  modified:
    - packages/server/package.json
    - packages/server/src/lib/ids.ts
    - packages/server/src/lib/ids.test.ts
    - packages/server/src/lib/rag-log.ts
    - packages/server/src/lib/rag-log.test.ts
    - packages/server/src/lib/candidates/detector.ts
    - pnpm-lock.yaml
requirements-completed: [P41-01, P41-02, P41-03]
completed: 2026-04-25
---

# Phase 41 Plan 01 Summary

Completed the remaining Phase 41 wrapper work by adding `nanoid` as an explicit server dependency and introducing a package-local ID helper in `packages/server/src/lib/ids.ts`. Query IDs and duplicate-case IDs now come from one shared prefixed generator instead of duplicating `Date.now()` plus `Math.random()` logic at each callsite.

This finishes the dependency-boundary part of the phase without reopening the larger graph runtime migration that belongs to Phase 42. Graphology and parsing wrappers already present in the worktree stay intact; this change closes the remaining safer-ID gap called out in the phase context.

No commit was created in this session because the repository already had unrelated in-flight changes. Verification: `pnpm --filter @trapmap/server test -- src/lib/ids.test.ts src/lib/rag-log.test.ts` (the package test script executed the full server Vitest suite, 40 files / 633 tests passed); `pnpm --filter @trapmap/server typecheck`.
