---
phase: 20
slug: skill-edit-review-workflow
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-20
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/*/vitest.config.ts` where present; otherwise package `vitest run` scripts |
| **Quick run command** | `pnpm --filter @trapmap/contracts test && pnpm --filter @trapmap/server test -- --run packages/server/src/routes/operations.test.ts && pnpm --filter @trapmap/cli test` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the touched package's targeted test command plus package-local `typecheck`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | SKED-03 | T-20-01 / T-20-02 / T-20-03 | Review queue and decision schemas enforce auth, real user, higher level | contract | `pnpm --filter @trapmap/contracts test && pnpm --filter @trapmap/contracts typecheck` | OK | OK |
| 20-01-02 | 01 | 1 | SKED-03 | T-20-04 / T-20-05 / T-20-06 | Server review endpoints enforce RBAC, team access, audit events | unit + route | `pnpm --filter @trapmap/server test -- --run packages/server/src/routes/operations.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 20-02-01 | 02 | 2 | SKED-03 | T-20-01 | CLI review commands require session token and knowledge:review permission | CLI | `pnpm --filter @trapmap/cli test && pnpm --filter @trapmap/cli typecheck` | OK | OK |

*Status: OK = verified present and passing*

---

## Wave 0 Requirements

- [x] `packages/server/src/routes/operations.test.ts` -- server route tests for review queue listing and review decisions
- [x] `packages/cli/src/commands/skill.test.ts` -- CLI tests for review:queue, review:approve, and review:reject commands

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `trapmap skill review:queue` lists pending reviews | SKED-03 | Requires running server with artifacts in agent-pass state | Submit an edit, then run review:queue command |
| `trapmap skill review:approve <id> --notes "ok"` transitions lifecycle | SKED-03 | Requires running server with pending review | After queue check, approve an artifact and verify lifecycle change |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
