---
phase: 56
slug: cli-feedback-entry-points
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-02
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 |
| **Config file** | packages/cli/vitest.config.ts, packages/server/vitest.config.ts |
| **Quick run command** | `pnpm --filter @trapmap/cli test && pnpm --filter @trapmap/server test` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @trapmap/cli test && pnpm --filter @trapmap/server test`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | FEEDBACK-01 | T-56-01 | Zod validates all inputs; max lengths enforced | unit | `pnpm --filter @trapmap/contracts test -- domain/feedback.test.ts` | ❌ W0 | ⬜ pending |
| 56-02-01 | 02 | 1 | FEEDBACK-01 | — | N/A | unit | `pnpm --filter @trapmap/contracts test -- domain/parsing.test.ts` | ❌ W0 | ⬜ pending |
| 56-03-01 | 03 | 2 | FEEDBACK-01 | T-56-04 | Session-based auth; user ID from session, not body | unit | `pnpm --filter @trapmap/cli test -- commands/feedback.test.ts` | ❌ W0 | ⬜ pending |
| 56-04-01 | 04 | 2 | FEEDBACK-01 | T-56-02, T-56-03 | Input validated via Zod; no direct rendering | unit | `pnpm --filter @trapmap/server test -- routes/feedback.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/contracts/src/domain/feedback.ts` — stubs for FEEDBACK-01 schema validation
- [ ] `packages/contracts/src/domain/feedback.test.ts` — unit tests for feedback validation
- [ ] `packages/cli/src/commands/feedback.ts` — new feedback command
- [ ] `packages/cli/src/commands/feedback.test.ts` — unit tests for feedback command
- [ ] `packages/cli/src/lib/prompts.ts` — wrapper for @inquirer/prompts (testable)
- [ ] `packages/server/src/routes/feedback.ts` — new feedback route
- [ ] `packages/server/src/routes/feedback.test.ts` — unit tests for feedback route
- [ ] Extend `packages/contracts/src/domain/parsing.ts` — add feedbackPrompts parsing
- [ ] Extend `packages/contracts/src/domain/parsing.test.ts` — test feedbackPrompts parsing
- [ ] Extend `packages/server/src/lib/store.ts` — add FeedbackQueueItemRecord and feedbackQueue

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive prompt UX in terminal | FEEDBACK-01 | Non-TTY environments skip interactive mode; requires visual inspection | Run `trapmap feedback <id>` in terminal and verify prompt flow |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
