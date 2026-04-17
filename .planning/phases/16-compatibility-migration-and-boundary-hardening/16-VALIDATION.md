---
phase: 16
slug: compatibility-migration-and-boundary-hardening
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts -t migration` |
| **Full suite command** | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts && pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/routes/retrieval.test.ts src/lib/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts src/commands/retrieval.test.ts` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the focused package test command for the touched task scope.
- **After every plan wave:** Run the full suite command.
- **Before `/gsd-verify-work`:** Full suite plus package `tsc --noEmit` checks must be green.
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | ARTF-04, COMP-03 | T-16-01 / T-16-02 | Migration normalizes legacy entries into minimal artifacts without widening scope or lowering level | unit + route | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts -t migration` | ✅ | ⬜ pending |
| 16-01-02 | 01 | 1 | COMP-01 | T-16-03 | Shared contracts define migration/status payloads for CLI and server | contract | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` | ✅ | ⬜ pending |
| 16-01-03 | 01 | 1 | ARTF-04, COMP-03 | T-16-03 | CLI migration command reports migrated artifact IDs, skip reasons, and remaining legacy count in human and JSON modes | cli | `pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts -t migration` | ✅ | ⬜ pending |
| 16-02-01 | 02 | 2 | COMP-02 | T-16-04 / T-16-05 | v1/v2 coexistence preserves review, team scope, level checks, and audit traces | integration | `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts -t coexistence` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 2 | COMP-04 | T-16-06 | No server path executes scripts or exposes script bodies while coexistence logic runs | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts -t script` | ✅ | ⬜ pending |
| 16-03-01 | 03 | 3 | COMP-03 | T-16-07 | Compatibility status reports identify unmigrated entries and runtime sunset blockers with stable JSON output | route + cli | `pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts -t status && pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts -t status` | ✅ | ⬜ pending |
| 16-03-02 | 03 | 3 | COMP-02, COMP-03 | T-16-08 | Sunset readiness stays blocked when unmigrated inventory or runtime governance blockers remain | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts -t blockers` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator-facing rollout judgment based on migration report | COMP-03 | Final sunset decisions are operational, not purely mechanical | Run the compatibility status command after all automated tests pass and confirm the report clearly lists remaining blockers or returns ready status with zero unmigrated entries |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or existing infrastructure coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-17
