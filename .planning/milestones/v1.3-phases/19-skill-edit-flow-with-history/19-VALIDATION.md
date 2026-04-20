---
phase: 19
slug: skill-edit-flow-with-history
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-20
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/*/vitest.config.ts` where present; otherwise package `vitest run` scripts |
| **Quick run command** | `pnpm --filter @trapmap/contracts test && pnpm --filter @trapmap/server test -- --run packages/server/src/lib/artifacts/edit.test.ts && pnpm --filter @trapmap/cli test` |
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
| 19-01-01 | 01 | 1 | SKED-02 | T-19-01 / T-19-03 | skillEditRequestSchema requires at least one update field, schema-level validation | contract | `pnpm --filter @trapmap/contracts test && pnpm --filter @trapmap/contracts typecheck` | OK | OK |
| 19-01-02 | 01 | 1 | SKED-04 | T-19-02 / T-19-03 | History response returns metadata-only summaries, not full file manifests | contract | `pnpm --filter @trapmap/contracts test && pnpm --filter @trapmap/contracts typecheck` | OK | OK |
| 19-02-01 | 02 | 2 | SKED-02 | T-19-04 / T-19-05 / T-19-06 / T-19-07 / T-19-08 | Server edit endpoint enforces auth, team access, security level, owner-or-higher, audit events | unit + route | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/artifacts/edit.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 19-02-02 | 02 | 2 | SKED-04 | T-19-09 | History view uses same governance filters as export | unit + route | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/artifacts/edit.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 19-03-01 | 03 | 3 | SKED-02 | T-19-10 / T-19-11 / T-19-12 / T-19-13 | CLI edit command requires session token, file content passed to server for validation | CLI | `pnpm --filter @trapmap/cli test && pnpm --filter @trapmap/cli typecheck` | OK | OK |
| 19-03-02 | 03 | 3 | SKED-04 | T-19-14 / T-19-13 | CLI history command requires knowledge:export permission, deterministic output | CLI | `pnpm --filter @trapmap/cli test && pnpm --filter @trapmap/cli typecheck` | OK | OK |

*Status: OK = verified present and passing*

---

## Wave 0 Requirements

- [x] `packages/server/src/lib/artifacts/edit.test.ts` -- helper tests for edit submission, revision append, history retrieval, and governance filtering
- [x] `packages/cli/src/commands/skill.test.ts` -- CLI tests for edit and history commands

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `trapmap skill edit <id> --title "new"` succeeds against live server | SKED-02 | Requires running server and authenticated session | Start server, login, submit a skill, then edit it via CLI |
| `trapmap skill history <id>` shows revision list | SKED-04 | Requires running server with edited artifact | After edit, run history command and verify revision list |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
