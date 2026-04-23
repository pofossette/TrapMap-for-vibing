---
phase: 29
slug: rag-mode-routing
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-23
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- --run packages/contracts/src packages/server/src/lib/retrieval evals/retrieval` |
| **Full suite command** | `pnpm test -- --run packages/server/src/lib/retrieval packages/server/src/routes/retrieval evals/retrieval` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run packages/contracts/src packages/server/src/lib/retrieval evals/retrieval`
- **After every plan wave:** Run `pnpm test -- --run packages/server/src/lib/retrieval packages/server/src/routes/retrieval evals/retrieval`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | EOPS-03 | T-29-01 / T-29-02 | Routing contracts accept only canonical mode/trace fields and preserve backward compatibility. | unit | `pnpm test -- --run packages/contracts/src` | ✅ | ⬜ pending |
| 29-01-02 | 01 | 1 | EOPS-03 | T-29-01 / T-29-03 | Router selection stays deterministic and emits explicit routing reasons. | unit | `pnpm test -- --run packages/server/src/lib/retrieval` | ✅ | ⬜ pending |
| 29-02-01 | 02 | 2 | EOPS-03, REVAL-04 | T-29-04 / T-29-05 | Governance remains pre-recall across every routed strategy. | integration | `pnpm test -- --run packages/server/src/lib/retrieval packages/server/src/routes/retrieval` | ✅ | ⬜ pending |
| 29-02-02 | 02 | 2 | EOPS-03 | T-29-02 / T-29-03 | v1/v2 route behavior keeps compatibility while exposing route/mode traces. | integration | `pnpm test -- --run packages/server/src/routes/retrieval` | ✅ | ⬜ pending |
| 29-03-01 | 03 | 3 | EOPS-03 | T-29-06 | Evaluation output records stable internal mode IDs, fallback reasons, and baseline policy fields. | unit | `pnpm test -- --run evals/retrieval` | ✅ | ⬜ pending |
| 29-03-02 | 03 | 3 | EOPS-03 | T-29-07 / T-29-08 / T-29-09 | Baseline write/compare flow and policy exits are explicit and test-covered. | unit | `pnpm test -- --run evals/retrieval` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Baseline threshold choice matches stakeholder intent | EOPS-03 | Numeric regression tolerance is a product/ops policy choice, not only a code concern | Review the final baseline JSON/markdown artifact and confirm allowed deltas per mode before locking policy |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
