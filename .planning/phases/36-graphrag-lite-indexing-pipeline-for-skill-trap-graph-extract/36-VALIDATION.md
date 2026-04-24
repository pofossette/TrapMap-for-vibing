---
phase: 36
slug: graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| **Quick run command** | `pnpm --filter @trapmap/server test -- src/lib/indexing/graph-lite/documents.test.ts src/lib/indexing/graph-lite/graphology.test.ts` |
| **Full suite command** | `pnpm --filter @trapmap/server test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-local automated command from the map below
- **After every plan wave:** Run `pnpm --filter @trapmap/server test`
- **Before `/gsd-verify-work`:** Run `pnpm typecheck && pnpm --filter @trapmap/server test`
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | P36-04 | T-36-01 / T-36-02 | Durable graph documents persist typed nodes, edges, evidence, and governance metadata without indexing activation-only content | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/graph-lite/documents.test.ts` | ✅ | ⬜ pending |
| 36-01-02 | 01 | 1 | P36-04 | T-36-03 / T-36-04 | Graphology helpers validate hard-edge cycles and build bounded graph views from persisted documents | unit | `pnpm --filter @trapmap/server test -- src/lib/indexing/graph-lite/graphology.test.ts` | ✅ | ⬜ pending |
| 36-02-01 | 02 | 2 | P36-01 | T-36-05 | Trap extraction emits only the locked TrapMap graph vocabulary with explicit hard/soft evidence | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/adapters/graph.test.ts` | ✅ | ⬜ pending |
| 36-02-02 | 02 | 2 | P36-01 | T-36-06 / T-36-07 / T-36-08 | Approved trap revisions persist durable graph documents and graph-assisted recall reads store-backed state after restart | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/indexing/pipeline.test.ts src/lib/retrieval/recall/graph-assisted.test.ts` | ✅ | ⬜ pending |
| 36-03-01 | 03 | 2 | P36-02 | T-36-09 / T-36-10 | Skill graph documents derive only from approved profile/capsule text and preserve artifact governance metadata | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/skill-events.test.ts` | ❌ W0 | ⬜ pending |
| 36-03-02 | 03 | 2 | P36-02 | T-36-11 / T-36-12 | Skill approve, edit, deactivate, and reapprove transitions drive post-commit graph indexing and removal | integration | `pnpm --filter @trapmap/server test -- src/routes/operations.test.ts` | ✅ | ⬜ pending |
| 36-04-01 | 04 | 3 | P36-03 | T-36-13 / T-36-14 / T-36-16 | Reconciliation removes stale graph documents and rebuilds missing approved trap/skill graph state while rejecting invalid hard-edge graphs | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/events.test.ts src/routes/review.test.ts src/lib/indexing/reconcile.test.ts` | ❌ W0 | ⬜ pending |
| 36-04-02 | 04 | 3 | P36-04 | T-36-15 | Startup registration runs graph reconciliation after store readiness, keeps candidate recovery intact, and logs non-fatal repair failures | integration | `pnpm --filter @trapmap/server test -- src/app.test.ts src/lib/indexing/reconcile.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/server/src/lib/indexing/graph-lite/documents.test.ts` — durable graph document builder coverage
- [x] `packages/server/src/lib/indexing/graph-lite/graphology.test.ts` — graph assembly, DAG validation, and local expansion coverage
- [ ] `packages/server/src/lib/indexing/skill-events.test.ts` — skill lifecycle graph indexing coverage
- [ ] `packages/server/src/lib/indexing/reconcile.test.ts` — cross-domain graph reconciliation coverage
- [ ] `packages/server/src/app.test.ts` — startup hook registration, ordering, and non-fatal reconciliation failure coverage

---

## Manual-Only Verifications

All phase behaviors are expected to have automated verification. No manual-only checks are planned.

---

## Validation Sign-Off

- [x] All planned tasks have `<automated>` verification commands or explicit Wave 0 test creation
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 explicitly covers every missing test surface
- [x] No watch-mode flags
- [x] Feedback latency < 30s for task-level smoke loops
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-24
