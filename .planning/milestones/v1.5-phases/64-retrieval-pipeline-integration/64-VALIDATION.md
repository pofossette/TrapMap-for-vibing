---
phase: 64
slug: retrieval-pipeline-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/server/vitest.config.ts` |
| **Quick run command** | `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts src/lib/conflict/enrich.test.ts` |
| **Full suite command** | `cd packages/server && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts src/lib/conflict/enrich.test.ts`
- **After every plan wave:** Run `cd packages/server && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 64-01-01 | 01 | 1 | DECAY-02 | — | N/A | unit | `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts` | ✅ | ⬜ pending |
| 64-01-02 | 01 | 1 | DECAY-02 | — | N/A | unit | `cd packages/server && npx vitest run src/lib/retrieval/rerank.test.ts` | ✅ | ⬜ pending |
| 64-02-01 | 02 | 1 | CONFLICT-02 | T-64-01 | Governance filter respects teamId | unit | `cd packages/server && npx vitest run src/lib/conflict/enrich.test.ts` | ✅ | ⬜ pending |
| 64-02-02 | 02 | 1 | CONFLICT-02 | — | N/A | unit | `cd packages/server && npx vitest run src/lib/conflict/enrich.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Orchestrator-level integration test: verify `searchKnowledge` returns matches with conflict hints when conflicts exist -- covers CONFLICT-02 E2E
- [ ] Orchestrator-level integration test: verify `searchKnowledge` returns lower scores for volatile vs evergreen entries -- covers DECAY-02 E2E

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI output shows conflict type and context for conflicting entries | CONFLICT-02 | Requires live CLI invocation with seeded data | Run retrieval CLI command, verify conflict display in output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
