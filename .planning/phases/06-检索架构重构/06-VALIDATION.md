---
phase: 6
slug: phase
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-04-14
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` not present at root; package scripts use inline `vitest run` |
| **Quick run command** | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | ARCH-01 | T-6-01 | Orchestrator preserves approval -> permission -> retrieval -> output ordering | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts` | ✅ | ⬜ pending |
| 6-01-02 | 01 | 1 | BOUND-03, BOUND-05 | T-6-02 | Server route still calls server retrieval entrypoint only after auth + permission resolution | integration | `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` | ✅ | ⬜ pending |
| 6-02-01 | 02 | 2 | ARCH-02, ARCH-03, ARCH-04 | T-6-03 | Extracted modules keep filtering and assembly behavior unchanged | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` | ✅ | ⬜ pending |
| 6-02-02 | 02 | 2 | ARCH-05, BOUND-04 | T-6-04 | Response buckets and business scope semantics remain unchanged | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` | ✅ | ⬜ pending |
| 6-03-01 | 03 | 2 | ARCH-06, BOUND-01, BOUND-02 | T-6-05 | Shared contract defines mode defaults; CLI passes contract-compliant mode values only | unit | `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/cli test` | ✅ | ⬜ pending |
| 6-03-02 | 03 | 2 | ARCH-05, BOUND-05 | T-6-06 | Semantic mode remains default and does not change current API output structure | full | `pnpm test && pnpm typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI output wording remains readable after adding mode support | BOUND-02 | Snapshot formatting is not fully asserted in tests | Run `pnpm --filter @skill-shareer/cli test`, then manually invoke retrieval help/output if command text changes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
