---
phase: "27"
slug: summary-evaluation-and-judge-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test evals/summary --run` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test evals/summary --run`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | SEVAL-01 | — | N/A | unit | `pnpm test evals/summary --run` | ❌ W0 | ⬜ pending |
| 27-01-02 | 01 | 1 | SEVAL-01 | — | N/A | unit | `pnpm test evals/summary --run` | ❌ W0 | ⬜ pending |
| 27-02-01 | 02 | 2 | SEVAL-02 | — | N/A | unit | `pnpm test evals/summary --run` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 2 | SEVAL-02 | — | N/A | integration | `pnpm test evals/summary --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `evals/summary/__tests__/fixtures.test.ts` — test fixtures for summary cases
- [ ] `evals/summary/__tests__/runner.test.ts` — runner unit tests
- [ ] `evals/summary/__tests__/judge.test.ts` — judge logic tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM judge responses | SEVAL-02 | External API dependency | Run eval with OpenAI key, inspect report |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
