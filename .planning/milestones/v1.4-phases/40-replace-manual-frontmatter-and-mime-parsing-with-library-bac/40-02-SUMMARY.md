---
phase: 40-replace-manual-frontmatter-and-mime-parsing-with-library-bac
plan: 02
subsystem: cli-server
tags: [cli, server, import-export, derivation]
requires:
  - phase: 40
    provides: "Shared parsing/MIME utilities in @trapmap/contracts"
provides:
  - "CLI import and artifact bundle flows use shared parsing/MIME helpers"
  - "Server legacy import and derivation frontmatter reads use the same parser"
affects: [phase-41, skill-import, artifact-derivation]
tech-stack:
  added: []
  patterns: [shared-parser-adoption, regression-backed-refactor]
key-files:
  modified:
    - packages/cli/src/commands/operations.ts
    - packages/cli/src/commands/operations.test.ts
    - packages/server/src/lib/import-export.ts
    - packages/server/src/lib/artifacts/derive.ts
    - packages/server/src/routes/operations.test.ts
requirements-completed: [P40-03, P40-04]
completed: 2026-04-25
---

# Phase 40 Plan 02 Summary

Replaced the targeted manual parsers in the CLI import path, the server legacy import path, and the derivation frontmatter reader with the shared contracts helper. The CLI now preserves YAML list labels from `SKILL.md`, the server legacy import tests cover quoted YAML values, and the old string-splitting logic is removed from the migrated callsites without changing the legacy requirement that imported skills still provide a frontmatter `name`.

No commit was created in this session because the repo already had unrelated in-flight work. Verification: `pnpm --filter @trapmap/cli test -- src/commands/operations.test.ts`; `pnpm --filter @trapmap/server test -- src/routes/operations.test.ts`; `pnpm --filter @trapmap/cli typecheck`; `pnpm --filter @trapmap/server typecheck`.
