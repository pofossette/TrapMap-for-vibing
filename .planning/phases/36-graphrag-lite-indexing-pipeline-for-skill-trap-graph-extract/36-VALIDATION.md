---
phase: 36
slug: graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-24
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `packages/server/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @trapmap/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/indexing/pipeline.test.ts src/lib/indexing/events.test.ts` |
| **Full suite command** | `pnpm --filter @trapmap/server test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @trapmap/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/indexing/pipeline.test.ts src/lib/indexing/events.test.ts`
- **After every plan wave:** Run `pnpm --filter @trapmap/server test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | P36-01 | T-36-01 | Only approved trap revisions persist durable graph docs and adapter state | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/pipeline.test.ts src/lib/indexing/adapters/graph.test.ts` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 1 | P36-02 | T-36-02 | Skill indexing reads derived capsule/profile text only and excludes activation-only content | integration | `pnpm --filter @trapmap/server test -- src/lib/artifacts/derive.test.ts src/routes/operations.test.ts` | ❌ W0 | ⬜ pending |
| 36-03-01 | 03 | 2 | P36-03 | T-36-03 | Update, deactivate, and reapprove flows remove or rebuild graph state without stale edges | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/events.test.ts src/routes/review.test.ts src/routes/operations.test.ts` | ❌ W0 | ⬜ pending |
| 36-04-01 | 04 | 2 | P36-04 | T-36-04 | Hard dependency projections reject cycles while soft edges remain outside DAG validation | unit | `pnpm --filter @trapmap/server test -- src/lib/indexing/graph-lite/*.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/indexing/graph-lite/*.test.ts` — cover durable graph document builders, graphology assembly, DAG validation, and subgraph/path helpers
- [ ] `packages/server/src/lib/indexing/skill-events.test.ts` or equivalent — cover skill lifecycle indexing hooks
- [ ] `packages/server/src/routes/operations.test.ts` additions — assert post-commit indexing on skill approve, update, and deactivate paths
- [ ] `packages/server/src/lib/indexing/reconcile.test.ts` additions — verify cross-domain graph reconciliation across traps and skills

---

## Manual-Only Verifications

All phase behaviors should have automated verification. No manual-only checks are expected for this phase.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
