---
phase: 89
slug: usage-analytics-statistics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (workspace-level) |
| **Config file** | vitest.config.ts (project root) |
| **Quick run command** | `pnpm vitest run --project server packages/server/src/lib/analytics/` |
| **Full suite command** | `pnpm vitest run --project server` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project server packages/server/src/lib/analytics/`
- **After every plan wave:** Run `pnpm vitest run --project server`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 89-01-01 | 01 | 1 | REQ-1 | T-89-01 / — | N/A | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | ❌ W0 | ⬜ pending |
| 89-02-01 | 02 | 1 | REQ-2 | — | Fire-and-forget void pattern | unit | `pnpm vitest run --project server packages/server/src/routes/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 89-03-01 | 03 | 1 | REQ-3 | — | N/A | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | ❌ W0 | ⬜ pending |
| 89-03-02 | 03 | 1 | REQ-4 | — | N/A | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | ❌ W0 | ⬜ pending |
| 89-03-03 | 03 | 1 | REQ-5 | — | N/A | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | ❌ W0 | ⬜ pending |
| 89-04-01 | 04 | 2 | REQ-6 | T-89-01 | requirePermission + team filter | unit | `pnpm vitest run --project server packages/server/src/routes/operations/stats.test.ts` | ❌ W0 | ⬜ pending |
| 89-05-01 | 05 | 2 | REQ-8 | — | Idempotent archive | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/analytics/pg-repository.test.ts` — stubs for REQ-1,3,4,5,8
- [ ] `packages/server/src/routes/operations/stats.test.ts` — stubs for REQ-6
- [ ] `packages/contracts/src/domain/common.ts` — add `stats:read` to permissionSchema

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| P95 query latency < 200ms | REQ-7 | Requires realistic data volume | Load test with 100K+ rows and measure query times |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
