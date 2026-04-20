---
phase: 21
slug: user-operations-logger
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-20
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/*/vitest.config.ts` where present; otherwise package `vitest run` scripts |
| **Quick run command** | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/user-ops-log.test.ts packages/server/src/routes/retrieval.test.ts` |
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
| 21-01-01 | 01 | 1 | LOG-01 | N/A | UserOpsLogEntry captures actorId, actorHandle, action, targetId, teamId, timestamp, metadata | unit | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/user-ops-log.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 21-01-02 | 01 | 1 | LOG-03 | N/A | LOG_USER_OPS_ENABLED env var controls logging independently; default disabled | unit | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/user-ops-log.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 21-02-01 | 02 | 2 | LOG-01 | N/A | All 15 routes instrumented with fire-and-forget logUserOperation calls | unit + route | `pnpm --filter @trapmap/server test -- --run packages/server/src/routes/retrieval.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 21-02-02 | 02 | 2 | LOG-03 | N/A | Logging disabled by default, enabled via LOG_USER_OPS_ENABLED=true | integration | `pnpm --filter @trapmap/server test -- --run packages/server/src/routes/retrieval.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |

*Status: OK = verified present and passing*

---

## Wave 0 Requirements

- [x] `packages/server/src/lib/user-ops-log.test.ts` -- unit tests for config loading, entry formatting, file writing, disabled mode, daily naming, error handling
- [x] `packages/server/src/routes/retrieval.test.ts` -- integration tests for logging behavior in route handlers

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Verify log files created in logs/user-ops/ when enabled | LOG-01 | Requires file system inspection after route calls | Set LOG_USER_OPS_ENABLED=true, make API calls, check logs/user-ops/ directory |
| Verify no log files created when disabled | LOG-03 | Requires checking absence of files | Leave LOG_USER_OPS_ENABLED=false (default), make API calls, verify no logs/user-ops/ files |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
