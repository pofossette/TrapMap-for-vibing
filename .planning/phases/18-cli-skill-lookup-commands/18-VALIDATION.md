---
phase: 18
slug: cli-skill-lookup-commands
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/*/vitest.config.ts` where present; otherwise package `vitest run` scripts |
| **Quick run command** | `pnpm --filter @trapmap/contracts test -- --run packages/contracts/src/index.test.ts && pnpm --filter @trapmap/contracts typecheck && pnpm --filter @trapmap/server test -- --run packages/server/src/lib/retrieval/skill-lookup.test.ts packages/server/src/routes/retrieval.test.ts && pnpm --filter @trapmap/server typecheck && pnpm --filter @trapmap/cli test -- --run packages/cli/src/commands/skill.test.ts && pnpm --filter @trapmap/cli typecheck` |
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
| 18-01-01 | 01 | 1 | SKED-01 | T-18-01 / T-18-02 | Shared lookup schemas bound input size and keep lookup results metadata-only | contract | `pnpm --filter @trapmap/contracts test -- --run packages/contracts/src/index.test.ts && pnpm --filter @trapmap/contracts typecheck` | OK | OK |
| 18-01-02 | 01 | 1 | SKED-01 | T-18-01 / T-18-02 | Contract tests reject capsule-style response drift and preserve one JSON lookup shape | contract | `pnpm --filter @trapmap/contracts test -- --run packages/contracts/src/index.test.ts && pnpm --filter @trapmap/contracts typecheck` | OK | OK |
| 18-02-01 | 02 | 2 | SKED-01 | T-18-04 / T-18-05 / T-18-06 | Server search returns only approved, team-visible, level-eligible unique artifacts | unit + route | `pnpm --filter @trapmap/server test -- --run packages/server/src/lib/retrieval/skill-lookup.test.ts packages/server/src/routes/retrieval.test.ts && pnpm --filter @trapmap/server typecheck` | OK | OK |
| 18-02-02 | 02 | 2 | SKED-01 | T-18-04 / T-18-06 | CLI prints stable text output and raw JSON while preserving command registration and typing | CLI | `pnpm --filter @trapmap/cli test -- --run packages/cli/src/commands/skill.test.ts && pnpm --filter @trapmap/cli typecheck` | OK | OK |

*Status: OK = verified present and passing*

---

## Wave 0 Requirements

- [x] `packages/server/src/lib/retrieval/skill-lookup.test.ts` — helper tests for governance filtering, artifact dedupe, and ranking projection
- [x] `packages/cli/src/commands/skill.test.ts` — CLI tests for endpoint path, text output, JSON output, and discoverability

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `trapmap skill --help` and `trapmap api:list` surface review | SKED-01 | Fast automated tests can prove registration and output snapshots, but help/discoverability readability is still best confirmed manually once the command exists | Run `pnpm --filter @trapmap/cli dev -- skill --help` and `pnpm --filter @trapmap/cli dev -- api:list`; confirm `skill search-by-content` is visible without removing legacy commands |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
