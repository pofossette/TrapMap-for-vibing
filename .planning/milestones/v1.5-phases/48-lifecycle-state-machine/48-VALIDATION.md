---
phase: 48
slug: lifecycle-state-machine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-02
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.5 |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `pnpm --filter @trapmap/server test -- --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @trapmap/server test -- --reporter=verbose`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | DECAY-01 | — | N/A | unit | `pnpm --filter @trapmap/server test -- lib/decay/config.test.ts` | ❌ W0 | ⬜ pending |
| 48-01-02 | 01 | 1 | DECAY-01 | — | N/A | unit | `pnpm --filter @trapmap/server test -- lib/decay/state-machine.test.ts` | ❌ W0 | ⬜ pending |
| 48-02-01 | 02 | 1 | DECAY-04 | T-48-01 | Admin-only config via env vars; Zod range validation (min 1, max 3650) | unit | `pnpm --filter @trapmap/server test -- lib/governance/eligibility.test.ts` | ❌ W0 (extend) | ⬜ pending |
| 48-02-02 | 02 | 1 | DECAY-04 | — | N/A | unit | `pnpm --filter @trapmap/server test -- lib/retrieval/rerank.test.ts` | ❌ W0 (extend) | ⬜ pending |
| 48-03-01 | 03 | 1 | DECAY-01 | T-48-02 | Require knowledge:update permission for supersede | unit | `pnpm --filter @trapmap/server test -- lib/decay/supersede.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/decay/state-machine.test.ts` — stubs for DECAY-01 state transitions
- [ ] `packages/server/src/lib/decay/config.test.ts` — stubs for DECAY-01 config loading
- [ ] `packages/server/src/lib/decay/supersede.test.ts` — stubs for DECAY-01 manual supersede
- [ ] Extend `packages/server/src/lib/governance/eligibility.test.ts` — new test cases for DECAY-04 hard decay
- [ ] Extend `packages/server/src/lib/retrieval/rerank.test.ts` — new test cases for DECAY-04 soft decay
- [ ] `packages/contracts/src/domain/decay.ts` — new file for decay schemas

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | All phase behaviors have automated verification. |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
