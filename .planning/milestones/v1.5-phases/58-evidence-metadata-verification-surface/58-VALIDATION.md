---
phase: 58
slug: evidence-metadata-verification-surface
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-02
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/contracts build` | ✅ | ⬜ pending |
| 58-01-02 | 01 | 1 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/contracts build` | ✅ | ⬜ pending |
| 58-01-03 | 01 | 1 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/contracts build` | ✅ | ⬜ pending |
| 58-01-04 | 01 | 1 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/contracts build` | ✅ | ⬜ pending |
| 58-01-05 | 01 | 1 | EVIDENCE-02 | — | N/A | unit | `pnpm --filter @trapmap/contracts build` | ✅ | ⬜ pending |
| 58-01-06 | 01 | 1 | EVIDENCE-02 | — | N/A | unit | `pnpm --filter @trapmap/contracts build` | ✅ | ⬜ pending |
| 58-01-07 | 01 | 1 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/contracts test -- --run` | ✅ | ⬜ pending |
| 58-02-01 | 02 | 2 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/server build` | ✅ | ⬜ pending |
| 58-02-02 | 02 | 2 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/server build` | ✅ | ⬜ pending |
| 58-02-03 | 02 | 2 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/server build` | ✅ | ⬜ pending |
| 58-02-04 | 02 | 2 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/server test -- lib/evidence/model.test.ts --run` | ✅ | ⬜ pending |
| 58-03-01 | 03 | 3 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/server build` | ✅ | ⬜ pending |
| 58-03-02 | 03 | 3 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/server build` | ✅ | ⬜ pending |
| 58-03-03 | 03 | 3 | EVIDENCE-02 | — | N/A | unit | `pnpm --filter @trapmap/server build` | ✅ | ⬜ pending |
| 58-03-04 | 03 | 3 | EVIDENCE-02 | — | N/A | unit | `pnpm --filter @trapmap/server build` | ✅ | ⬜ pending |
| 58-03-05 | 03 | 3 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/server test -- --run` | ✅ | ⬜ pending |
| 58-04-01 | 04 | 4 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/cli build` | ✅ | ⬜ pending |
| 58-04-02 | 04 | 4 | EVIDENCE-02 | — | N/A | unit | `pnpm --filter @trapmap/cli build` | ✅ | ⬜ pending |
| 58-04-03 | 04 | 4 | EVIDENCE-01 | — | N/A | unit | `pnpm --filter @trapmap/cli test -- --run` | ✅ | ⬜ pending |
| 58-04-04 | 04 | 4 | EVIDENCE-02 | — | N/A | unit | `pnpm --filter @trapmap/cli build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All required test infrastructure exists:

- [x] `packages/contracts/src/domain/evidence.ts` — new file for evidence schemas (Task 58-01-01)
- [x] `packages/server/src/lib/evidence/model.ts` — evidence validation helpers (Task 58-02-03)
- [x] `packages/server/src/lib/evidence/model.test.ts` — evidence validation tests (Task 58-02-04)
- [x] Extend `packages/server/src/routes/review.test.ts` — evidence in review decision (Task 58-03-05)
- [x] Extend `packages/cli/src/commands/review.test.ts` — CLI evidence flags (Task 58-04-03)

*Existing infrastructure (vitest, zod) covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin view evidence filtering | EVIDENCE-02 | Requires running CLI admin view | Run `pnpm cli admin evidence list --filter evidenceLevel=verified-in-prod` and verify output |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
