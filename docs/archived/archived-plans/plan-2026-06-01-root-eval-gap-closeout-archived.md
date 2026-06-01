# Eval Gap Closure — Audited Closeout

> **Disposition:** closeout complete. The last pending blocker was the PG-first retrieval route harness, and it is now green.

## Persisted Evidence Snapshot

- `reports/eval/retrieval-core-postgres.json`: `28/28` pass
- `reports/eval/summary-core-postgres.json`: `7/7` pass
- `reports/eval/graph-extraction-smoke-live.txt`: live success, `Live 5 / Fallback 0`
- `reports/eval/ingestion-smoke-postgres.txt`: `5/5` pass

These evidence files were audited as already green at the start of this closeout. No full retrieval / summary / graph extraction / ingestion eval rerun was needed for this blocker.

## Blocker Closed

Previous pending item:

- targeted PG-first route harness in [`packages/server/src/routes/retrieval.test.ts`](packages/server/src/routes/retrieval.test.ts)

Root cause:

- the retrieval test helper only mutated `store_snapshot`-style fixture data
- PG-first auth and retrieval paths were resolving `session` / `user` / `membership` / retrieval fixtures through repository-backed tables
- several older route-harness sections in `retrieval.test.ts` were still manually seeding JSON snapshot data only

Fixes landed:

- `packages/server/src/lib/retrieval/__fixtures__/auth-store-helpers.ts`
  - `buildTestServer()` now keeps snapshot compatibility but also materializes seeded auth + retrieval fixtures into PG repos
  - added `seedTestData()` for incremental snapshot+repo-aware mutations in PG-first route tests
  - normalized seeded knowledge/artifact revision history for PG inserts
  - fixed seeded derived artifact data shape for PG structured revision tables
  - forced fallback AI config for this helper’s test servers so route harnesses do not depend on live provider latency
- `packages/server/src/routes/retrieval.test.ts`
  - moved remaining manual PG-first route harness mutations onto `seedTestData()`
  - adjusted invalid `requiredLevel > 10` harness values to valid PG-compatible values while preserving the governance assertions
  - switched the two remaining manual PG-first server setups to fallback AI config
- `packages/server/src/app.ts`
  - `app.close()` now closes the `PostgresStore` pool
- `packages/server/src/lib/persistence/postgres-store.ts`
  - made store close idempotent
- `packages/server/src/lib/queue/task-queue.ts`
  - worker `stop()` now waits for the run loop to settle before shutdown
- `packages/server/src/routes/retrieval.ts`
  - fire-and-forget usage analytics writes now swallow shutdown-time rejections

## Verification

Focused blocker rerun:

- `rtk zsh -lc 'set -a && source .env && set +a && pnpm --config.store-dir=/tmp/pnpm-store exec vitest run --maxWorkers 1 --minWorkers 1 packages/server/src/routes/retrieval.test.ts -t "v2-empty-with-summary-core|skill lookup with seeded artifacts|v2 label filter assertions"'`
- result: all 4 previously blocked cases passed

Targeted verification:

- `rtk zsh -lc 'set -a && source .env && set +a && pnpm --config.store-dir=/tmp/pnpm-store exec vitest run --maxWorkers 1 --minWorkers 1 evals/retrieval/lib/adapters.test.ts packages/server/src/lib/retrieval/read-model.test.ts packages/server/src/routes/retrieval.test.ts packages/server/src/lib/retrieval/response/summary.test.ts evals/summary/__tests__/runner-api.test.ts evals/graph-extraction/run.test.ts packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts'`
  - first pass exposed non-blocker shutdown / legacy harness issues
  - after the follow-up fixes above, the remaining changed surface was re-verified with:
- `rtk zsh -lc 'set -a && source .env && set +a && pnpm --config.store-dir=/tmp/pnpm-store exec vitest run --maxWorkers 1 --minWorkers 1 packages/server/src/routes/retrieval.test.ts -t "includes boundaryExplanation|penalizes entry with matching exclusion|boosts entry with matching context"'`
- `rtk zsh -lc 'set -a && source .env && set +a && pnpm --config.store-dir=/tmp/pnpm-store exec vitest run --maxWorkers 1 --minWorkers 1 packages/server/src/routes/retrieval.test.ts'`

Final audited state:

- `packages/server/src/routes/retrieval.test.ts`: `86/86` pass
- `evals/retrieval/lib/adapters.test.ts`: green in targeted verification
- `packages/server/src/lib/retrieval/read-model.test.ts`: green in targeted verification
- `packages/server/src/lib/retrieval/response/summary.test.ts`: green in targeted verification
- `evals/summary/__tests__/runner-api.test.ts`: green in targeted verification
- `evals/graph-extraction/run.test.ts`: green in targeted verification
- `packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts`: green in targeted verification

## Final Status

No known blocker remains in this closeout scope.
