---
phase: 40-replace-manual-frontmatter-and-mime-parsing-with-library-bac
plan: 01
subsystem: contracts
tags: [parsing, mime, gray-matter, mime-types]
requires:
  - phase: 39
    provides: "Stable shared package boundary used by both CLI and server"
provides:
  - "Shared library-backed SKILL frontmatter parsing"
  - "Shared MIME lookup with project-safe text/code overrides"
affects: [40-02, cli-import, server-import, skill-derivation]
tech-stack:
  added: [gray-matter, mime-types]
  patterns: [shared-wrapper, behavior-preserving-migration]
key-files:
  modified:
    - packages/contracts/package.json
    - packages/contracts/src/domain/parsing.ts
    - packages/contracts/src/domain/parsing.test.ts
    - packages/contracts/src/index.ts
    - pnpm-lock.yaml
requirements-completed: [P40-01, P40-02]
completed: 2026-04-25
---

# Phase 40 Plan 01 Summary

Added a shared parsing module to `@trapmap/contracts` so both sides of the monorepo can use the same `gray-matter` and `mime-types` wrappers instead of keeping separate regex and extension-table implementations. The helper normalizes SKILL metadata, keeps stable overrides for code-oriented file types like `.ts` and `.yaml`, and exposes a text-like MIME check so structured text formats such as JSON do not get treated as binary payloads.

No commit was created in this session because the repo already had unrelated in-flight work. Verification: `pnpm --filter @trapmap/contracts test -- src/domain/parsing.test.ts`; `pnpm --filter @trapmap/contracts typecheck`.
