---
phase: 22
slug: rag-logger-with-file-rotation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-20
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/*/vitest.config.ts` where present; otherwise package `vitest run` scripts |
| **Quick run command** | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/rag-log.test.ts packages/server/src/lib/log-rotation.test.ts packages/server/src/lib/user-ops-log.test.ts` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the touched package's targeted test command plus package-local `typecheck`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | LOG-02 | N/A | RagLogEntry captures mode, pipeline steps, latency, result count | unit | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/rag-log.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 22-01-02 | 01 | 1 | LOG-03 | N/A | LOG_RAG_ENABLED env var controls RAG logging independently; default disabled | unit | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/rag-log.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 22-02-01 | 02 | 2 | LOG-04 | N/A | RotationConfig with maxFileSizeBytes and maxBackupFiles, appendWithRotation and rotateFile functions | unit | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/log-rotation.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 22-02-02 | 02 | 2 | LOG-02 | N/A | RAG logging integrated in orchestrator with timedStep helper for pipeline timing | unit + route | `pnpm --filter @trapmap/server test -- --run packages/server/src/routes/retrieval.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 22-02-03 | 02 | 2 | LOG-04 | N/A | Both loggers (user-ops, RAG) updated to use shared rotation module | unit | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/log-rotation.test.ts packages/server/src/lib/user-ops-log.test.ts packages/server/src/lib/rag-log.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |

*Status: OK = verified present and passing*

---

## Wave 0 Requirements

- [x] `packages/server/src/lib/rag-log.test.ts` -- unit tests for config loading, entry formatting, file writing, disabled mode, query ID generation
- [x] `packages/server/src/lib/log-rotation.test.ts` -- unit tests for rotation config, size-based rotation, numbered backups, max backup limit
- [x] `packages/server/src/lib/user-ops-log.test.ts` -- unit tests for updated rotation integration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Verify RAG log files created in logs/rag/ when enabled | LOG-02 | Requires file system inspection after retrieval calls | Set LOG_RAG_ENABLED=true, perform retrieval, check logs/rag/ directory |
| Verify rotation creates numbered backups when file exceeds size | LOG-04 | Requires generating large log output | Set LOG_MAX_FILE_SIZE_MB=1, generate many log entries, verify .1, .2 backup files |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
