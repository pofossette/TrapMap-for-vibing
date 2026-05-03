---
phase: 61
slug: candidate-pipeline-independent-table
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `pnpm --filter @trapmap/server test -- --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @trapmap/server test`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | WRITE-01-1 | T-61-01 / — | Parameterized queries via pg driver | integration | `vitest run src/lib/candidates/pg-repository.test.ts` | ❌ W0 | ⬜ pending |
| 61-01-02 | 01 | 1 | WRITE-01-2 | T-61-02 / — | Row-level SELECT FOR UPDATE on candidate rows | unit | `vitest run src/lib/candidates/pg-repository.test.ts` | ❌ W0 | ⬜ pending |
| 61-02-01 | 02 | 1 | WRITE-01-3 | — / — | N/A | unit | `vitest run src/lib/candidates/processor.test.ts` | ❌ W0 | ⬜ pending |
| 61-02-02 | 02 | 1 | WRITE-01-4 | T-61-03 / — | Dual-write primary-first ordering | integration | `vitest run src/lib/candidates/repository.test.ts` | ❌ W0 | ⬜ pending |
| 61-03-01 | 03 | 1 | WRITE-01-5 | — / — | N/A | regression | `vitest run src/routes/candidates.test.ts` | ✅ | ⬜ pending |
| 61-03-02 | 03 | 1 | WRITE-01-6 | — / — | N/A | integration | `vitest run src/lib/persistence/migrate-candidates.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/candidates/pg-repository.test.ts` — stubs for WRITE-01-1, WRITE-01-2
- [ ] `packages/server/src/lib/candidates/repository.test.ts` — stubs for WRITE-01-4 (dual-write)
- [ ] `packages/server/src/lib/candidates/processor.test.ts` — stubs for WRITE-01-3 (no transact)
- [ ] `packages/server/src/lib/persistence/migrate-candidates.test.ts` — stubs for WRITE-01-6

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | All phase behaviors have automated verification. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
