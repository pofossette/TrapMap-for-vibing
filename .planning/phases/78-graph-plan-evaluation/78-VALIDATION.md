---
phase: 78
slug: graph-plan-evaluation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | evals/retrieval/vitest.config.ts (or workspace vitest.config) |
| **Quick run command** | `pnpm --filter evals test normalize.test.ts` |
| **Full suite command** | `pnpm eval:retrieval --tier smoke --endpoint /v3/retrieval/search --verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter evals test normalize.test.ts`
- **After every plan wave:** Run `pnpm eval:retrieval --tier smoke --endpoint /v3/retrieval/search --verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 78-01 | 01 | 1 | GPEVAL-01 | — | N/A | unit | `pnpm build && grep "graphPlanExpectationsSchema" packages/contracts/src/domain/evals/retrieval.ts` | ⬜ W0 | ⬜ pending |
| 78-02 | 01 | 1 | GPEVAL-01 | — | N/A | unit | `pnpm --filter evals test normalize.test.ts` | ⬜ W0 | ⬜ pending |
| 78-03 | 01 | 1 | GPEVAL-03 | — | N/A | unit | `grep "assertGraphPlanStructure" evals/retrieval/lib/assertions.ts` | ⬜ W0 | ⬜ pending |
| 78-04 | 01 | 1 | GPEVAL-02 | — | N/A | unit | `grep "coreGraphPlanOrchestrationScenario" evals/retrieval/scenarios/core/retrieval-core-scenarios.ts` | ⬜ W0 | ⬜ pending |
| 78-05 | 01 | 1 | GPEVAL-01, GPEVAL-02 | — | N/A | unit | `pnpm eval:retrieval --tier smoke --endpoint /v3/retrieval/search --verbose` | ⬜ W0 | ⬜ pending |
| 78-06 | 01 | 1 | GPEVAL-03 | — | N/A | unit | `pnpm eval:retrieval --tier core --endpoint /v3/retrieval/search --verbose` | ⬜ W0 | ⬜ pending |
| 78-07 | 01 | 1 | GPEVAL-01 | — | N/A | unit | `pnpm --filter evals test normalize.test.ts` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `evals/retrieval/lib/normalize.test.ts` — existing test file with graph-plan test cases
- [ ] `packages/contracts` built for type imports

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Report output formatting | GPEVAL-03 | Visual verification of console output | Run eval with --verbose and check graph-plan failure formatting |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
