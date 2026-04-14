---
phase: 08
slug: 索引生命周期
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.workspace.ts` |
| **Quick run command** | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/operations.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/operations.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | IDX-01 | T-08-01 | Pipeline syncs one normalized document across adapters without bypassing lifecycle rules | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | IDX-02 | T-08-01 | Normalization is deterministic and hash-based for equivalent content | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/normalize.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 1 | IDX-03 | T-08-02 | Approval, update, and deactivate transitions emit the correct index sync actions | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/events.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 1 | IDX-04 | T-08-02 | Approved entries become indexed automatically after review completion | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval-workflow.test.ts src/lib/indexing/pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 08-03-01 | 03 | 2 | IDX-05 | T-08-03 | Content-changing updates refresh index state without exposing stale content | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/indexing/pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 08-03-02 | 03 | 2 | IDX-06 | T-08-03 | Deactivated entries are removed from all index representations | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/indexing/pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-01 | 04 | 2 | IDX-07 | T-08-04 | Vector adapter upserts fresh vectors and skips stale rewrites | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/vector.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-02 | 04 | 2 | IDX-08 | T-08-04 | Keyword adapter materializes and removes persisted keyword state idempotently | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/keyword.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/indexing/pipeline.test.ts` — pipeline orchestration, idempotency, reconciliation
- [ ] `packages/server/src/lib/indexing/normalize.test.ts` — canonical text, token, and hash behavior
- [ ] `packages/server/src/lib/indexing/events.test.ts` — lifecycle trigger mapping
- [ ] `packages/server/src/lib/indexing/adapters/vector.test.ts` — vector adapter freshness and removal
- [ ] `packages/server/src/lib/indexing/adapters/keyword.test.ts` — keyword adapter upsert/remove semantics
- [ ] Extend `packages/server/src/lib/retrieval-workflow.test.ts` — assert approval-triggered index build
- [ ] Extend `packages/server/src/routes/operations.test.ts` — assert update/deactivate index side effects

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reconciliation behavior after simulated sync failure | IDX-03, IDX-04, IDX-05, IDX-06 | Failure injection is easier to reason about manually than through current route fixtures alone | Simulate a post-transaction sync failure, rerun reconciliation, then confirm approved content is restored and deactivated content remains absent |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
