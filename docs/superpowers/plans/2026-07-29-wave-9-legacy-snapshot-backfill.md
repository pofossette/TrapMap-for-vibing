# Wave 9 Legacy Snapshot Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every supported `store_snapshot` bucket into its owner-local PostgreSQL tables, prove the result, and then delete the compatibility snapshot state.

**Architecture:** `host-distributed` provides a temporary, one-shot coordinator that loads `store_snapshot.main` through a narrow source adapter and invokes existing owner-local backfill ports in dependency order. The coordinator fails closed and reports per-bucket evidence; graph documents are rebuilt from authoritative owner tables rather than copied. Once a representative database succeeds, a Wave 9 migration and retirement cleanup remove the temporary surface and all runtime compatibility-state consumers.

**Tech Stack:** TypeScript, Zod, PostgreSQL/`pg`, Drizzle SQL migrations, Vitest, pnpm, Docker Compose.

## Global Constraints

- The command reads only `store_snapshot` row `key = 'main'` through a parameterized query and never serves runtime traffic.
- Services do not import other service implementations; `host-distributed` is the only cross-owner composition root.
- A record is inserted when absent, skipped only when canonically equal, and rejected when the same identity differs or required data is malformed.
- `graphIndexDocuments`, `promptVersion`, and `rebuildState` are rebuilt or retired from authoritative owner data, never copied from legacy JSONB.
- No `store_snapshot`, `JsonStore`, `PostgresStore`, source adapter, temporary port, command, fixture, or allowlist survives Wave 9.
- Do not drop `store_snapshot` until focused tests and representative PostgreSQL backfill evidence are green; Docker/Compose remains a required final acceptance.
- Prefix shell commands with `rtk`; never stage `.superpowers/sdd/` workflow artifacts.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/host-distributed/src/legacy-snapshot/source.ts` | Parameterized singleton-row reader and strict Zod parser for the legacy source shape. |
| `packages/host-distributed/src/legacy-snapshot/coordinator.ts` | Dependency-ordered, fail-closed owner invocation and unified result contract. |
| `packages/host-distributed/src/legacy-snapshot/*.test.ts` | Source parsing, coordinator success/retry/rejection, and all-bucket fixture tests. |
| `packages/host-distributed/src/legacy-snapshot/run.ts` | Temporary direct-execution entrypoint that acquires/closes a pool and formats the evidence result. |
| `packages/host-distributed/src/legacy-snapshot/owners.ts` | Host-only assembly of existing owner backfill/rebuild functions. |
| `packages/service-*/src/*snapshot-backfill*.ts` | Existing owner-local adapters; change only when an explicit contract gap is demonstrated by a failing coordinator test. |
| `packages/service-identity-access/drizzle/0001_drop_store_snapshot.sql` and metadata | Owner-scoped destructive migration after recorded successful backfill. |
| `packages/server/src/lib/{store,persistence}` and direct consumers | Legacy state implementation/call-site deletion after no runtime consumer remains. |
| `scripts/__tests__/compatibility-retirement-guard.test.ts` | Wave-9 completion contract: no allowed compatibility symbols/temporary command remain. |
| `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md` | Factual evidence, exact commands, migration result and remaining Wave 10 scope. |

### Task 1: Define the Strict Legacy Source Contract

**Files:**
- Create: `packages/host-distributed/src/legacy-snapshot/source.ts`
- Create: `packages/host-distributed/src/legacy-snapshot/source.test.ts`
- Modify: `packages/host-distributed/package.json`

**Interfaces:**
- Produces `LegacySnapshotSource`, `LegacySnapshot`, and `loadLegacySnapshot(source): Promise<LegacySnapshot>`.
- `LegacySnapshot` contains only `identityAudit`, `knowledge`, `artifacts`, `artifactFilePayloads`, `candidateIngestion`, and `governance` views; it does not expose a generic aggregate `transact` API.
- Consumed by Task 2 coordinator.

- [ ] **Step 1: Write the failing source-contract tests**

```ts
it('loads the singleton row and exposes typed owner bucket views', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ data: completeSnapshot }] });
  await expect(loadLegacySnapshot(createLegacySnapshotSource({ query }))).resolves.toMatchObject({
    identityAudit: { users: [expect.objectContaining({ id: 'user_1' })] },
    candidateIngestion: { candidateSubmissions: [expect.any(Object)] },
  });
  expect(query).toHaveBeenCalledWith(
    'SELECT data FROM store_snapshot WHERE key = $1',
    ['main'],
  );
});

it.each([
  [{ users: [] }, 'missing required legacy bucket: teams'],
  [{ ...completeSnapshot, unknownBucket: [] }, 'unknown legacy snapshot bucket: unknownBucket'],
])('rejects malformed legacy source data', async (data, message) => {
  await expect(loadLegacySnapshot(sourceReturning(data))).rejects.toThrow(message);
});
```

- [ ] **Step 2: Run the source test to verify it fails**

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/legacy-snapshot/source.test.ts`

Expected: FAIL because `source.ts` and `loadLegacySnapshot` do not exist.

- [ ] **Step 3: Implement the minimum parser and reader**

```ts
export interface LegacySnapshotSource {
  query<T extends { data: unknown }>(sql: string, values: readonly unknown[]): Promise<{ rows: T[] }>;
}

export async function loadLegacySnapshot(source: LegacySnapshotSource): Promise<LegacySnapshot> {
  const { rows } = await source.query<{ data: unknown }>(
    'SELECT data FROM store_snapshot WHERE key = $1',
    ['main'],
  );
  if (rows.length !== 1) throw new Error('legacy store_snapshot main row is required');
  return legacySnapshotSchema.parse(rows[0]!.data);
}
```

Define `legacySnapshotSchema` with exact known keys from `StoreData`; use `.strict()` at the top level and explicit record schemas for each owner view. Convert absent optional persisted arrays only where historical JSON compatibility explicitly permits them, otherwise reject with a bucket-specific message.

- [ ] **Step 4: Run the focused source tests**

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/legacy-snapshot/source.test.ts`

Expected: PASS with singleton query, complete source parsing, missing-bucket, unknown-bucket, and malformed-record rejection coverage.

- [ ] **Step 5: Commit the source contract**

```bash
rtk git add packages/host-distributed/src/legacy-snapshot/source.ts packages/host-distributed/src/legacy-snapshot/source.test.ts packages/host-distributed/package.json
rtk git commit -m "feat: add legacy snapshot source contract"
```

### Task 2: Compose Existing Owner Backfills in a Fail-Closed Coordinator

**Files:**
- Create: `packages/host-distributed/src/legacy-snapshot/coordinator.ts`
- Create: `packages/host-distributed/src/legacy-snapshot/coordinator.test.ts`
- Create: `packages/host-distributed/src/legacy-snapshot/owners.ts`
- Modify: `packages/host-distributed/src/index.ts`

**Interfaces:**
- Consumes `loadLegacySnapshot()` from Task 1 and existing `migrateIdentityAudit`, `migrateKnowledgeSnapshot`, `migrateSkillArtifacts`, `migrateArtifactFilePayloads`, `migrateCandidateIngestionSnapshot`, `migrateGovernanceSnapshot`, and `createKnowledgeReadGraphProjectionRebuilder` owner APIs.
- Produces `runLegacySnapshotBackfill(deps): Promise<LegacySnapshotBackfillResult>` and `assertLegacySnapshotBackfillSucceeded(result): void`.
- Task 3 consumes the result contract and host-only owner assembly.

- [ ] **Step 1: Write failing coordinator tests for ordered success and failure**

```ts
it('runs owner backfills in dependency order and accepts only fully verified results', async () => {
  const calls: string[] = [];
  const result = await runLegacySnapshotBackfill({
    source: sourceReturning(completeSnapshot),
    owners: fakeOwners(calls),
  });
  expect(calls).toEqual(['identity', 'knowledge', 'candidate', 'governance', 'graph-rebuild']);
  expect(result.succeeded).toBe(true);
  expect(result.buckets.every((bucket) => bucket.verified)).toBe(true);
});

it('fails closed and does not run later owners after a mismatch', async () => {
  await expect(runLegacySnapshotBackfill({
    source: sourceReturning(completeSnapshot),
    owners: fakeOwners([], { knowledgeError: 'destination record differs from snapshot' }),
  })).rejects.toThrow('knowledge backfill failed');
  expect(graphRebuild).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the coordinator test to verify it fails**

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/legacy-snapshot/coordinator.test.ts`

Expected: FAIL because `runLegacySnapshotBackfill` and the host-only owner bundle do not exist.

- [ ] **Step 3: Implement the coordinator result model and owner assembly**

```ts
export interface LegacySnapshotBackfillResult {
  succeeded: boolean;
  sourceCounts: Record<string, number>;
  buckets: Array<{ owner: string; bucket: string; inserted: number; skipped: number; destinationCount: number; verified: boolean }>;
}

export async function runLegacySnapshotBackfill(deps: LegacySnapshotBackfillDeps) {
  const snapshot = await loadLegacySnapshot(deps.source);
  const identity = await deps.owners.migrateIdentity(snapshot.identityAudit);
  assertOwnerResult('identity', identity);
  const knowledge = await deps.owners.migrateKnowledge(snapshot.knowledge, snapshot.artifacts, snapshot.artifactFilePayloads);
  assertOwnerResult('knowledge', knowledge);
  const candidate = await deps.owners.migrateCandidate(snapshot.candidateIngestion);
  assertOwnerResult('candidate', candidate);
  const governance = await deps.owners.migrateGovernance(snapshot.governance);
  assertOwnerResult('governance', governance);
  const graph = await deps.owners.rebuildGraphProjection();
  assertGraphRebuild(graph);
  return toBackfillResult(snapshot, identity, knowledge, candidate, governance, graph);
}
```

`owners.ts` may import concrete owner factories because it is host composition. Keep each adapter mapping local and translate existing owner-specific result shapes into the common result; do not add a cross-service shared backfill interface.

- [ ] **Step 4: Run focused coordinator and owner tests**

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/legacy-snapshot/source.test.ts src/legacy-snapshot/coordinator.test.ts`

Expected: PASS, including ordered invocation, source/destination counts, no later owner after failure, idempotent second run, and mismatch rejection.

- [ ] **Step 5: Commit the coordinator**

```bash
rtk git add packages/host-distributed/src/legacy-snapshot packages/host-distributed/src/index.ts
rtk git commit -m "feat: coordinate legacy snapshot backfill"
```

### Task 3: Close Owner Contract Gaps and Add the All-Bucket PostgreSQL Fixture

**Files:**
- Modify: `packages/service-identity-access/src/identity-audit-backfill.test.ts`
- Modify: `packages/service-knowledge-write/src/{knowledge-snapshot-backfill,wave9-artifact-backfill,wave9-artifact-payload-backfill}.test.ts`
- Modify: `packages/service-candidate-ingestion/src/snapshot-backfill.test.ts`
- Modify: `packages/service-governance-review/src/snapshot-backfill.test.ts`
- Modify: `packages/service-knowledge-read/src/graph-projection-backfill.test.ts`
- Create: `packages/host-distributed/src/legacy-snapshot/integration.test.ts`
- Modify: only owner backfill source modules that the new failing test proves cannot report required verification data.

**Interfaces:**
- Consumes Task 2 `runLegacySnapshotBackfill`.
- Produces owner results that unambiguously report inserted, skipped, error, source count, destination count, and verification status.
- Task 4 relies on this fixture as the pre-deletion proof.

- [ ] **Step 1: Write the failing integration fixture test**

```ts
it('migrates every legacy bucket and makes a second run a verified no-op', async () => {
  const database = await createMigratedOwnerDatabase();
  await seedLegacyStoreSnapshot(database.pool, completeSnapshotWithEveryBucket);

  const first = await runLegacySnapshotBackfill(createPostgresBackfillDeps(database.pool));
  expect(first.succeeded).toBe(true);
  expect(first.buckets).toEqual(expect.arrayContaining([
    expect.objectContaining({ bucket: 'users', destinationCount: 1, verified: true }),
    expect.objectContaining({ bucket: 'knowledgeEntries', destinationCount: 1, verified: true }),
    expect.objectContaining({ bucket: 'graphIndexDocuments', verified: true }),
  ]));

  const second = await runLegacySnapshotBackfill(createPostgresBackfillDeps(database.pool));
  expect(second.buckets.every((bucket) => bucket.inserted === 0 && bucket.verified)).toBe(true);
});

it('rejects a conflicting destination and malformed required field without overwrite', async () => {
  await seedConflictingKnowledgeRecord(database.pool);
  await expect(runLegacySnapshotBackfill(createPostgresBackfillDeps(database.pool))).rejects.toThrow(
    'destination record differs from snapshot',
  );
  await expect(loadLegacySnapshot(sourceReturning(snapshotMissingUserHandle))).rejects.toThrow('handle');
});
```

- [ ] **Step 2: Run the integration and owner tests to verify the contract gap**

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/legacy-snapshot/integration.test.ts`

Expected: FAIL until the common coordinator wiring and any demonstrated owner result normalization are complete.

- [ ] **Step 3: Make only proven owner-level corrections**

For each failure, preserve existing owner ownership and add the smallest explicit verification field or canonical comparison. Do not replace existing owner APIs with a shared repository. The graph test must invoke `createKnowledgeReadGraphProjectionRebuilder(pool)` and assert it builds from knowledge/artifact tables; it must not seed or copy `graphIndexDocuments` from the snapshot.

- [ ] **Step 4: Run the complete focused backfill verification**

Run: `rtk pnpm --filter @trapmap/service-identity-access test --run src/identity-audit-backfill.test.ts`

Run: `rtk pnpm --filter @trapmap/service-knowledge-write test --run src/knowledge-snapshot-backfill.test.ts src/wave9-artifact-backfill.test.ts src/wave9-artifact-payload-backfill.test.ts`

Run: `rtk pnpm --filter @trapmap/service-candidate-ingestion test --run src/snapshot-backfill.test.ts`

Run: `rtk pnpm --filter @trapmap/service-governance-review test --run src/snapshot-backfill.test.ts`

Run: `rtk pnpm --filter @trapmap/service-knowledge-read test --run src/graph-projection-backfill.test.ts`

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/legacy-snapshot/integration.test.ts`

Expected: PASS; every migrated bucket has matching source/destination evidence, conflict rejection, required-field rejection, idempotent rerun, and graph rebuild evidence.

- [ ] **Step 5: Commit fixture and owner corrections**

```bash
rtk git add packages/host-distributed/src/legacy-snapshot packages/service-identity-access/src packages/service-knowledge-write/src packages/service-candidate-ingestion/src packages/service-governance-review/src packages/service-knowledge-read/src
rtk git commit -m "test: prove legacy snapshot owner backfill"
```

### Task 4: Add the Temporary Operator Entrypoint and Record Representative Evidence

**Files:**
- Create: `packages/host-distributed/src/legacy-snapshot/run.ts`
- Modify: `packages/host-distributed/package.json`
- Modify: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`
- Test: `packages/host-distributed/src/legacy-snapshot/run.test.ts`

**Interfaces:**
- Consumes `runLegacySnapshotBackfill(createPostgresBackfillDeps(pool))` from Task 2.
- Produces a non-zero process exit on any rejected result and JSON-compatible operator evidence on success.
- Task 5 cannot start until this task's representative database evidence is written to the active detail.

- [ ] **Step 1: Write failing entrypoint tests**

```ts
it('requires DATABASE_URL, closes the pool, and emits the verified result', async () => {
  await expect(runLegacySnapshotBackfillCommand({ env: {} })).rejects.toThrow('DATABASE_URL is required');
  const result = await runLegacySnapshotBackfillCommand({ env: { DATABASE_URL: 'postgres://example' }, createPool, write });
  expect(result.succeeded).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"succeeded":true'));
});
```

- [ ] **Step 2: Run the entrypoint test to verify it fails**

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/legacy-snapshot/run.test.ts`

Expected: FAIL because the temporary command module does not exist.

- [ ] **Step 3: Implement direct execution with no permanent root script**

```ts
export async function runLegacySnapshotBackfillCommand(deps: CommandDeps): Promise<LegacySnapshotBackfillResult> {
  const databaseUrl = deps.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for legacy snapshot backfill');
  const pool = deps.createPool(databaseUrl);
  try {
    const result = await runLegacySnapshotBackfill(createPostgresBackfillDeps(pool));
    deps.write(`${JSON.stringify(result)}\n`);
    return result;
  } finally {
    await pool.end();
  }
}
```

Use a direct package entrypoint only for the cutover, document its exact invocation in the active detail, and delete it in Task 5. Do not add `backfill:legacy-snapshot` to the root `package.json`.

- [ ] **Step 4: Run the command and record factual evidence**

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/legacy-snapshot/run.test.ts src/legacy-snapshot/integration.test.ts`

Then, only with a configured representative development database:

Run: `rtk pnpm -C packages/host-distributed exec tsx src/legacy-snapshot/run.ts`

Expected: JSON result with `succeeded: true`, all buckets verified, and a process exit code of `0`. Record source counts, destination counts, timestamp, and exact command in the active detail. If no database is available, record that the deletion gate remains blocked and do not continue to Task 5.

- [ ] **Step 5: Commit entrypoint and evidence only when the representative run is green**

```bash
rtk git add packages/host-distributed/src/legacy-snapshot/run.ts packages/host-distributed/src/legacy-snapshot/run.test.ts packages/host-distributed/package.json docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md
rtk git commit -m "feat: run verified legacy snapshot backfill"
```

### Task 5: Drop the Snapshot Schema and Delete Legacy State

**Files:**
- Create: `packages/service-identity-access/drizzle/0001_drop_store_snapshot.sql`
- Create/Modify: corresponding `packages/service-identity-access/drizzle/meta/*` journal and snapshot metadata
- Delete: `packages/server/src/lib/store/`
- Delete: `packages/server/src/lib/persistence/{create-store.ts,postgres-store.ts,postgres-store.test.ts,schema/index.ts}`
- Modify: every direct production consumer identified by `rtk rg -n 'store_snapshot|JsonStore|PostgresStore|lib/store|persistence/postgres-store' packages scripts --glob '*.ts' --glob 'package.json'`
- Modify: `packages/service-identity-access/drizzle/0000_identity_access_baseline.sql` and metadata to remove the legacy table from an empty-database baseline
- Modify: `scripts/__tests__/compatibility-retirement-guard.test.ts`
- Modify: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`

**Interfaces:**
- Consumes Task 4 recorded successful representative backfill evidence.
- Produces a workspace with no production legacy state API, schema object, migration asset, temporary command, or Wave 9 allowlist entry.
- Wave 10 consumes the cleaned package graph but must not delete `packages/server` in this task.

- [ ] **Step 1: Tighten the retirement guard first**

```ts
it('has no remaining Wave-9 compatibility symbols or temporary backfill command', () => {
  expect(findCompatibilityViolations(repoRoot)).toEqual([]);
  expect(existsSync(join(repoRoot, 'packages/host-distributed/src/legacy-snapshot/run.ts'))).toBe(false);
  expect(existsSync(join(repoRoot, 'packages/host-distributed/src/legacy-snapshot/source.ts'))).toBe(false);
});
```

Remove every Wave 9 `allowlist` entry before deleting code, so the test is red for the existing state.

- [ ] **Step 2: Run the guard to verify it fails**

Run: `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`

Expected: FAIL and report every remaining `store_snapshot`, `JsonStore`, `PostgresStore`, temporary source, and temporary command surface.

- [ ] **Step 3: Delete only after rechecking Task 4 evidence**

Add the owner-scoped `DROP TABLE IF EXISTS store_snapshot;` migration and update Drizzle journal metadata. Remove the table from the identity baseline, delete legacy store modules/tests and the Task 1-4 temporary command/source/coordinator, then replace each production consumer with its owner-local port or projection. Delete obsolete fixtures/scripts only when their callers are deleted. Do not remove unrelated server code scheduled for Wave 10.

- [ ] **Step 4: Run focused deletion checks**

Run: `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`

Run: `rtk pnpm --filter @trapmap/service-identity-access test --run src/migrations.test.ts`

Run: `rtk pnpm --filter @trapmap/host-distributed test --run src/migrate.test.ts`

Run: `rtk pnpm typecheck`

Run: `rtk pnpm check:docs-drift`

Run: `rtk pnpm check:structure`

Run: `rtk pnpm exec fallow audit --base main`

Expected: guard has no Wave 9 exception, owner migrations reject stale metadata, typecheck/docs/structure pass, and Fallow reports no unauthorized cross-service implementation import. Record any tool-environment failure exactly rather than treating it as success.

- [ ] **Step 5: Commit the destructive retirement as one reviewed change**

```bash
rtk git add -A
rtk git restore --staged .superpowers/sdd
rtk git commit -m "refactor: retire legacy snapshot state"
```

### Task 6: Prove Empty-Database Deployment and Close Wave 9 Evidence

**Files:**
- Modify: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`
- Modify: any exact Docker/Compose fixture or deployment guard that still references the deleted compatibility state, as exposed by the failing acceptance.
- Test: existing migration, deployment, and Compose closeout scripts.

**Interfaces:**
- Consumes the Wave 9 deletion state from Task 5.
- Produces factual Wave 9 closeout evidence; Wave 10 remains unchecked until package retirement is independently complete.

- [ ] **Step 1: Run the empty-database migration and deployment acceptance**

Run: `rtk pnpm test:deployment-smoke`

Run: `rtk pnpm test:runtime-foundations`

Run: `rtk pnpm test:distributed-closeout`

Run: `rtk pnpm test:runtime-closeout:compose`

Expected: owner migrations create a usable empty database without `store_snapshot`, and the deployed composition starts with no legacy state dependency.

- [ ] **Step 2: Diagnose any failure before editing**

For each failure, identify the exact stale import, migration expectation, Docker reference, or environment blocker. Add a failing focused regression test before the minimal correction. Do not reintroduce a compatibility store or add a new allowlist entry.

- [ ] **Step 3: Run final Wave 9 verification**

Run: `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`

Run: `rtk pnpm typecheck`

Run: `rtk pnpm check:docs-drift`

Run: `rtk pnpm check:structure`

Run: `rtk pnpm exec fallow audit --base main`

Expected: all checks pass. If Docker is unavailable, record the exact socket failure and leave Wave 9 unchecked; do not claim empty-database acceptance.

- [ ] **Step 4: Update active detail and commit closeout evidence**

Record each command/result, the representative backfill result, and whether the empty-database acceptance passed. Mark only Wave 9 complete when every deletion and acceptance criterion is evidenced; retain the active detail because Wave 10 is still pending.

```bash
rtk git add docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md
rtk git commit -m "docs: record legacy snapshot retirement evidence"
```

## Plan Self-Review

- Spec coverage: Tasks 1-3 implement strict direct PostgreSQL input, owner-local writes, all-bucket coverage, idempotency/rejection, and graph rebuild; Task 4 records representative evidence; Tasks 5-6 enforce deletion and empty-database acceptance.
- Scope: `packages/server` is retained except for legacy state modules and consumers. Full package retirement remains Wave 10.
- Type consistency: the only cross-task public names are `LegacySnapshotSource`, `LegacySnapshot`, `loadLegacySnapshot`, `runLegacySnapshotBackfill`, and `LegacySnapshotBackfillResult`, defined in Tasks 1-2 and used consistently thereafter.
- Completeness scan: every validation and deletion condition names its test, command, or required evidence.
