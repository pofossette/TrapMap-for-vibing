---
phase: 26
slug: retrieval-metrics-runner-and-governance-checks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm exec vitest run evals/retrieval/**/*.test.ts packages/server/src/lib/retrieval.test.ts packages/server/src/lib/retrieval/assembly.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run evals/retrieval/**/*.test.ts packages/server/src/lib/retrieval.test.ts packages/server/src/lib/retrieval/assembly.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | REVAL-01 | T-26-01 | Runner executes cases through explicit adapters without bypassing shared contracts | integration | `pnpm exec vitest run evals/retrieval/**/*.test.ts` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 1 | REVAL-03 | T-26-02 | Ranking metrics compute deterministically from normalized hits | unit | `pnpm exec vitest run evals/retrieval/**/*.test.ts` | ❌ W0 | ⬜ pending |
| 26-02-01 | 02 | 2 | REVAL-04 | T-26-03 | Governance failures surface explicitly, remain separate from ranking metrics, and cover explicit fallback behavior for the known v1 route defect | integration | `pnpm exec vitest run evals/retrieval/**/*.test.ts packages/server/src/lib/retrieval.test.ts packages/server/src/lib/retrieval/assembly.test.ts` | ❌ W0 | ⬜ pending |
| 26-02-02 | 02 | 2 | REVAL-01, REVAL-03, REVAL-04 | T-26-04 | JSON and terminal reports stay stable, sorted, and regression-friendly | integration | `pnpm exec vitest run evals/retrieval/**/*.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `evals/retrieval/runner/**/*.test.ts` or equivalent colocated tests for adapters, normalizers, metrics, and report formatting
- [ ] Coverage for the current v1 route-governance defect path so fallback behavior is explicit rather than silent
- [ ] Stable fixture helpers for building evaluation execution context from Phase 25 scenarios

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Terminal report readability for maintainers | REVAL-01, REVAL-03, REVAL-04 | JSON tests cannot judge whether the output is scannable in normal terminal use | Run the root retrieval-eval script for smoke and core tiers, confirm the summary separates ranking metrics, governance failures, and adapter warnings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
