---
phase: 56
slug: cli-feedback-entry-points
status: draft
nyquist_compliant: true
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
| 56-01-01 | 01 | 1 | FEEDBACK-01 | T-56-01 | Zod validates all inputs; max lengths enforced | unit | `pnpm --filter @trapmap/contracts test -- domain/feedback.test.ts` | ✅ | ⬜ pending |
| 56-01-02 | 01 | 1 | FEEDBACK-01 | T-56-01 | Schema tests verify validation boundaries | unit | `pnpm --filter @trapmap/contracts test -- domain/feedback.test.ts` | ✅ | ⬜ pending |
| 56-02-01 | 02 | 1 | FEEDBACK-01 | T-56-03 | Graceful degradation for malformed frontmatter | unit | `pnpm --filter @trapmap/contracts test -- domain/parsing.test.ts` | ✅ | ⬜ pending |
| 56-02-02 | 02 | 1 | FEEDBACK-01 | T-56-03 | Parsing tests verify malformed input handling | unit | `pnpm --filter @trapmap/contracts test -- domain/parsing.test.ts` | ✅ | ⬜ pending |
| 56-03-01 | 03 | 2 | FEEDBACK-01 | T-56-04 | Session-based auth; user ID from session | unit | `pnpm --filter @trapmap/server typecheck` | ✅ | ⬜ pending |
| 56-03-02 | 03 | 2 | FEEDBACK-01 | T-56-04, T-56-06 | Input validated via Zod; 401 for unauthenticated | unit | `pnpm --filter @trapmap/server test -- routes/feedback.test.ts` | ✅ | ⬜ pending |
| 56-03-03 | 03 | 2 | FEEDBACK-01 | T-56-04, T-56-06 | Route tests verify auth and validation | unit | `pnpm --filter @trapmap/server test -- routes/feedback.test.ts` | ✅ | ⬜ pending |
| 56-04-01 | 04 | 2 | FEEDBACK-01 | T-56-08 | Non-interactive mode support via flags | unit | `pnpm --filter @trapmap/cli test -- commands/feedback.test.ts` | ✅ | ⬜ pending |
| 56-04-02 | 04 | 2 | FEEDBACK-01 | T-56-08 | TTY detection for interactive fallback | unit | `pnpm --filter @trapmap/cli test -- commands/feedback.test.ts` | ✅ | ⬜ pending |
| 56-04-03 | 04 | 2 | FEEDBACK-01 | T-56-07, T-56-08 | Input validation; TTY detection | unit | `pnpm --filter @trapmap/cli test -- commands/feedback.test.ts` | ✅ | ⬜ pending |
| 56-04-04 | 04 | 2 | FEEDBACK-01 | T-56-07, T-56-08 | Command tests verify validation and modes | unit | `pnpm --filter @trapmap/cli test -- commands/feedback.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 dependencies are addressed by the plan files:

- [x] `packages/contracts/src/domain/feedback.ts` — Plan 56-01 Task 01
- [x] `packages/contracts/src/domain/feedback.test.ts` — Plan 56-01 Task 02
- [x] `packages/contracts/src/domain/parsing.ts` (extend) — Plan 56-02 Task 01
- [x] `packages/contracts/src/domain/parsing.test.ts` (extend) — Plan 56-02 Task 02
- [x] `packages/server/src/lib/store.ts` (extend) — Plan 56-03 Task 01
- [x] `packages/server/src/routes/feedback.ts` — Plan 56-03 Task 02
- [x] `packages/server/src/routes/feedback.test.ts` — Plan 56-03 Task 03
- [x] `packages/cli/src/lib/prompts.ts` — Plan 56-04 Task 02
- [x] `packages/cli/src/commands/feedback.ts` — Plan 56-04 Task 03
- [x] `packages/cli/src/commands/feedback.test.ts` — Plan 56-04 Task 04
- [x] `packages/cli/src/index.ts` (extend) — Plan 56-04 Task 03
- [x] `packages/server/src/app.ts` (extend) — Plan 56-03 Task 02

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive prompt UX in terminal | FEEDBACK-01 | Non-TTY environments skip interactive mode; requires visual inspection | Run `trapmap feedback <id>` in terminal and verify prompt flow |
| Skill-defined custom prompts integration | FEEDBACK-01 | Requires full skill artifact submission and feedback flow | Create skill with feedbackPrompts, run feedback command, verify custom prompts appear |

---

## Must-Haves (Goal-Backward Verification)

Derived from Phase 56 success criteria:

| # | Success Criterion | Verification Command | Status |
|---|-------------------|---------------------|--------|
| 1 | CLI command `feedback <entry-id>` opens interactive prompt | `trapmap feedback trap_1` shows problem type selection | ⬜ |
| 2 | Feedback captures problem type from controlled vocabulary | `feedbackProblemTypeSchema` contains: incorrect, outdated, context-mismatch, incomplete, other | ⬜ |
| 3 | Feedback captures description (required) and context (optional) | `feedbackSubmissionSchema.description.min(10)` and `context.optional()` | ⬜ |
| 4 | Skill artifacts can define feedback prompts in frontmatter | `ParsedSkillMarkdown.feedbackPrompts` parsed from SKILL.md | ⬜ |
| 5 | Feedback submission creates entry in feedback queue | `POST /v1/feedback` returns 201 with `feedback.id` | ⬜ |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
