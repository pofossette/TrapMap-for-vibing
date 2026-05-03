---
phase: 65
slug: feedback-lifecycle-decay-route-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | vitest.config.ts (project root) |
| **Quick run command** | `npx vitest run packages/server/src/routes/feedback.test.ts --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run packages/server/src/routes/feedback.test.ts packages/server/src/routes/decay.test.ts --reporter=verbose`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 65-01-01 | 01 | 1 | FEEDBACK-03 | T-65-01 | Correct type imports prevent runtime crashes | unit | `npx vitest run packages/contracts` | ✅ | ⬜ pending |
| 65-02-01 | 02 | 1 | FEEDBACK-03 | T-65-02 | Lifecycle triggers fire after batch, not during transaction | integration | `npx vitest run packages/server/src/routes/feedback.test.ts -t "lifecycle"` | ❌ W0 | ⬜ pending |
| 65-02-02 | 02 | 1 | FEEDBACK-03 | — | Dry-run does not trigger lifecycle transitions | integration | `npx vitest run packages/server/src/routes/feedback.test.ts -t "dry-run"` | ❌ W0 | ⬜ pending |
| 65-03-01 | 03 | 1 | DECAY-03 | — | All 6 undocumented routes now in documentedRoutes | integration | `npx vitest run packages/server/src/routes/operations.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/routes/feedback.test.ts` — E2E lifecycle trigger tests (3 outdated feedback -> stale transition)
- [ ] `packages/server/src/routes/feedback.test.ts` — Dry-run does not trigger lifecycle transitions test

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
