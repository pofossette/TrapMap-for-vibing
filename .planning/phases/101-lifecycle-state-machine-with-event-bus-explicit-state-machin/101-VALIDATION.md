---
phase: 101
slug: lifecycle-state-machine-with-event-bus-explicit-state-machin
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 101 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | root vitest config |
| **Quick run command** | `npx vitest run packages/server/src/lib/lifecycle/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds (lifecycle dir), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run packages/server/src/lib/lifecycle/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 01 | 1 | (TBD) | — | N/A | unit | `npx vitest run packages/server/src/lib/lifecycle/state-machine.test.ts` | ✅ (30 tests) | ⬜ pending |
| 01-02 | 01 | 1 | (TBD) | — | N/A | unit | `npx vitest run packages/server/src/lib/lifecycle/event-bus.test.ts` | ❌ W0 | ⬜ pending |
| 02-01 | 02 | 1 | (TBD) | — | N/A | unit | `npx vitest run packages/server/src/lib/lifecycle/subscribers/` | ❌ W0 | ⬜ pending |
| 03-01 | 03 | 2 | (TBD) | — | N/A | integration | `npx vitest run packages/server/src/routes/review.test.ts` | ✅ (extend) | ⬜ pending |
| 03-02 | 03 | 2 | (TBD) | — | N/A | integration | `npx vitest run packages/server/src/routes/knowledge.test.ts` | ✅ (extend) | ⬜ pending |
| 03-03 | 03 | 2 | (TBD) | — | N/A | regression | `npx vitest run packages/server/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/lifecycle/event-bus.ts` — LifecycleEventBus class
- [ ] `packages/server/src/lib/lifecycle/event-bus.test.ts` — Event bus unit tests (order, error isolation, async)
- [ ] `packages/server/src/lib/lifecycle/transitions.ts` — Transition table with event metadata
- [ ] `packages/server/src/lib/lifecycle/types.ts` — DomainEvent type definition
- [ ] `packages/server/src/lib/lifecycle/subscribers/indexing.ts` — Indexing subscriber
- [ ] `packages/server/src/lib/lifecycle/subscribers/audit.ts` — Audit subscriber
- [ ] `packages/server/src/lib/lifecycle/subscribers/conflict.ts` — Conflict detection subscriber
- [ ] `packages/server/src/lib/lifecycle/subscribers/subscribers.test.ts` — Subscriber unit tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Error isolation — one subscriber failure doesn't block others | (TBD) | Timing-dependent; hard to test deterministically | Trigger a failing subscriber, verify other subscribers still execute |
| Event ordering — subscribers fire in registration order | (TBD) | Ordering guarantee is a design invariant | Register 3 subscribers, verify execution order via spy |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
