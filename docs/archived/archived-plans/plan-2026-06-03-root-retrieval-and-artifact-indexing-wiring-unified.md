# Retrieval And Artifact Indexing Wiring Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the current "implemented but not wired" debt around skill retrieval and indexing so artifact lifecycle, PG capsule indexes, old skill lookup entrypoints, and operator repair paths all use the same production wiring.

**Architecture:** Treat this as a wiring-and-convergence project, not a greenfield feature. Reuse the existing capsule recall channels, capsule PG index tables, artifact indexing seam, graph reconciliation, and retrieval eval framework; the work is to route all artifact lifecycle transitions and retrieval entrypoints through those seams consistently, then expose the missing repair/health operations through stable operator paths.

**Tech Stack:** TypeScript, Fastify, Vitest, Drizzle, PostgreSQL, pgvector, existing retrieval/ingestion eval runners.

---

## Archive Note

- [x] Previous root plan archived to `docs/archived/archived-plans/plan-2026-06-03-root-duplicate-validation-layering-archived.md`
- [x] Active tracking file remains `plan.md`

## Audited "Done But Not Wired" Findings

- [x] `packages/server/src/lib/retrieval/capsules/repositories/index-sync.ts` already implements `createCapsuleIndexSync()` and `syncArtifactCapsules()`, but no production lifecycle path calls it.
- [x] `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts` already implements `rebuildAllCapsuleIndexes()`, `rebuildCapsuleIndexForArtifact()`, `verifyCapsuleIndexHealth()`, and `cleanupOrphanCapsuleIndexes()`, but they are only exercised in tests and documentation, not through a stable operator route/CLI path.
- [x] `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-keyword.ts` and `pg-capsule-vector.ts` are already wired into `searchKnowledgeV2()` through feature flags, but they depend on derived index rows that are not write-synced from artifact lifecycle events.
- [x] `packages/server/src/lib/retrieval/capsules/skill-lookup.ts` still uses direct in-memory `rankCapsules()` and does not reuse the v2 capsule coordinator or PG capsule recall path.
- [x] `packages/server/src/lib/indexing/skill-events.ts` and the route callers in `skill-review.ts`, `skill-edit.ts`, and `artifacts-activate.ts` only fan out `artifactGraphIndexAdapter`; capsule keyword/vector index adapters are missing from the same lifecycle seam.
- [x] `determineSkillIndexAction()` only performs `upsert` for `nextState === 'approved'` and `remove` for `nextState === 'deactivated'`, so transitions from `approved` to `agent-pass`, `agent-rejected`, or `rejected` leave stale artifact-side indexes behind until a later reconcile.
- [x] `removeCapsuleIndex()` exists in `index-sync.ts` but is only used in tests, which means deleted/removed capsules have no production cleanup path.
- [x] `ensureCapsuleVectorIndex()` exists in `pg-capsule-vector.ts`, but startup only calls trap-side `ensureVectorIndex()`; capsule HNSW index creation is not ensured by bootstrap.
- [x] Existing retrieval eval contracts only model `/v1/retrieval/search`, `/v2/retrieval/search`, and `/v3/retrieval/search`; there is no endpoint-level eval slice for `/v1/retrieval/skills/search-by-content`.

## Confirmed Separate Follow-Up Debt

- [x] Candidate duplicate LLM adjudication is implemented but not wired end-to-end:
  - `packages/server/src/bootstrap/bootstrap-workers.ts` constructs candidate processing services without `chat`
  - `packages/server/src/lib/candidates/processor.ts` does not define `chat` on `CandidateProcessorServices`
  - `processor.ts` calls `createPgDuplicateDetector({ pool, featureFlag })` without `chat`
  - `processor.ts` calls `detectDuplicates(detectionInput)` without the optional `chat`
  - result: `packages/server/src/lib/candidates/{detector,pg-detector}.ts` have LLM paths, but production candidate processing never injects `ChatProvider`, so `useLLM` stays false
- [x] This is intentionally not pulled into the phases below because it is a separate subsystem from retrieval/artifact indexing. If executed, it should become a second plan centered on `packages/server/src/lib/candidates/`.

## Execution Index

- [ ] Phase 0: Freeze scope, evidence, and invariants
- [ ] Phase 1: Unify artifact lifecycle indexing and stale-index removal
- [ ] Phase 2: Wire capsule PG index sync into the artifact indexing seam
- [ ] Phase 3: Migrate old skill retrieval entrypoints onto the shared capsule recall path
- [ ] Phase 4: Expose operator rebuild/health/repair entrypoints for capsule indexes
- [ ] Phase 5: Expand docs, tests, and evals to lock the wiring in place

## File Structure

### Lifecycle and indexing seam

- `packages/server/src/lib/indexing/skill-events.ts`
  - artifact lifecycle action selection and post-commit indexing runner
- `packages/server/src/lib/indexing/artifact-pipeline.ts`
  - shared artifact adapter registration/fan-out seam
- `packages/server/src/lib/indexing/adapters/artifact-graph.ts`
  - existing graph adapter to preserve
- `packages/server/src/lib/lifecycle/`
  - optional shared artifact-domain event types/subscribers if artifact lifecycle is normalized onto the event bus

### Capsule PG index maintenance

- `packages/server/src/lib/retrieval/capsules/repositories/index-sync.ts`
  - sync and cleanup for keyword/vector capsule index rows
- `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts`
  - full rebuild, targeted rebuild, health reconcile, orphan cleanup
- `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-keyword.ts`
  - PG keyword recall over `skill_artifact_capsule_keywords`
- `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-vector.ts`
  - PG vector recall and HNSW index creation for `skill_artifact_capsule_embeddings`
- `packages/server/src/bootstrap/bootstrap-repositories.ts`
  - startup ensure hooks for indexes and adapter registration

### Retrieval entrypoints

- `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
  - current v2 capsule coordinator wiring
- `packages/server/src/lib/retrieval/capsules/capsule-recall-coordinator.ts`
  - shared channel execution, merge, rerank
- `packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
  - old artifact-first search entrypoint that currently bypasses the coordinator
- `packages/server/src/routes/retrieval.ts`
  - HTTP route contract for `/v1/retrieval/skills/search-by-content`

### Artifact lifecycle routes likely touched

- `packages/server/src/routes/operations/skill-review.ts`
- `packages/server/src/routes/operations/skill-edit.ts`
- `packages/server/src/routes/operations/artifacts-activate.ts`
- `packages/server/src/routes/operations/artifacts-import.ts`

### Validation, docs, and eval

- `packages/server/src/routes/operations/*.test.ts`
- `packages/server/src/__tests__/lib/retrieval/capsule-index-sync.test.ts`
- `packages/server/src/__tests__/lib/retrieval/capsule-index-rebuild.test.ts`
- `packages/server/src/lib/indexing/skill-events.test.ts`
- `packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts`
- `packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts`
- `packages/server/src/routes/retrieval.test.ts`
- `docs/architecture/components/RETRIEVAL.md`
- `docs/architecture/components/INDEXING.md`
- `docs/operations/ENVIRONMENT.md`
- `docs/operations/TESTING.md`
- `docs/reference/api-surface.md`
- `packages/contracts/src/domain/evals/retrieval.ts`
- `evals/retrieval/lib/{adapters,normalize,assertions,governance}.ts`
- `evals/retrieval/datasets/{smoke,core}/`

## Example Target Shapes

### Unified artifact index adapter contract

```ts
export interface ArtifactIndexAdapter {
  kind: 'graph' | 'capsule-keyword' | 'capsule-semantic';
  sync(input: {
    data: StoreData;
    artifact: SkillArtifactRecord;
    graphQueryBackend?: GraphQueryBackend;
  }): Promise<{ success: boolean; performedWork: boolean; error?: string | null }>;
  remove(input: {
    data: StoreData;
    artifactId: string;
    graphQueryBackend?: GraphQueryBackend;
  }): Promise<void>;
}
```

### Artifact lifecycle index action

```ts
export type SkillIndexAction = 'upsert' | 'remove' | 'noop';

export function determineSkillIndexAction(
  previousState: LifecycleState,
  nextState: LifecycleState,
): SkillIndexAction {
  if (nextState === 'approved') return 'upsert';
  if (previousState === 'approved' && nextState !== 'approved') return 'remove';
  if (nextState === 'deactivated') return 'remove';
  return 'noop';
}
```

### Shared coordinator result for skill lookup

```ts
const recall = await coordinator.execute({
  artifacts,
  intent,
  governanceFilters,
  maxResults: parsed.maxResults,
});

const artifactFirst = dedupeByArtifactId(recall.capsuleCandidates);
```

## Phase 0: Freeze Scope, Evidence, and Invariants

- [ ] Convert this audit into the execution source of truth and explicitly reject non-goals.
- [ ] Capture which missing wiring is correctness-critical versus operator/perf-only.
- [ ] Lock the affected lifecycle transitions and retrieval entrypoints before changing code.

**Completion standard**

- Every item in "Audited "Done But Not Wired" Findings" is either accepted into a phase below or explicitly marked out-of-scope with rationale.
- The plan distinguishes correctness risks from optional operator ergonomics:
  - correctness: stale artifact visibility, stale graph/capsule indexes after lifecycle regressions, old skill lookup bypassing indexed recall
  - operator/perf: stable rebuild route, startup ensure for capsule HNSW index, endpoint-level eval expansion
- No later phase needs to rename the core seams: `runSkillIndexEvent()`, `createCapsuleIndexSync()`, `searchSkillsByContent()`, `rebuildAllCapsuleIndexes()`, `verifyCapsuleIndexHealth()`.

**Document updates**

- [ ] Update `plan.md` with any scope refinements discovered during implementation.
- [ ] If a debt item is intentionally deferred, add a short deferred-debt note to `docs/architecture/components/RETRIEVAL.md` or `docs/architecture/components/INDEXING.md`.

**Test and eval updates**

- [ ] Record the baseline command set for this plan:
  - `pnpm test -- --run packages/server/src/lib/indexing/skill-events.test.ts packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts packages/server/src/routes/retrieval.test.ts packages/server/src/routes/operations/skill-review.test.ts packages/server/src/routes/operations/skill-edit.test.ts packages/server/src/routes/operations/artifacts-activate.test.ts`
  - `pnpm typecheck`
  - `pnpm check`
  - `pnpm eval:retrieval:dry-run`
- [ ] Record which of the audited findings are currently covered only by unit tests and which have no end-to-end assertion.

**Example evidence note**

```md
- `searchKnowledgeV2()` already registers PG keyword/semantic channels behind
  `RETRIEVAL_CAPSULE_PG_KEYWORD` and `RETRIEVAL_CAPSULE_PG_SEMANTIC`.
- `searchSkillsByContent()` still calls `rankCapsules()` directly and therefore
  bypasses those PG-backed channels.
```

## Phase 1: Unify Artifact Lifecycle Indexing And Stale-Index Removal

- [ ] Stop treating skill indexing as three hand-wired route callbacks.
- [ ] Make artifact lifecycle transitions remove indexes whenever an artifact leaves `approved`, not only when it becomes `deactivated`.
- [ ] Ensure all artifact state transitions that affect retrieval visibility go through one shared indexing seam.

**Completion standard**

- An artifact transition from `approved` to `agent-pass`, `agent-rejected`, `rejected`, or `deactivated` removes graph and capsule-derived retrieval indexes in the same post-commit flow.
- An artifact transition into `approved` rebuilds all required retrieval indexes through the same seam.
- The implementation no longer relies on each route remembering to pass `adapters: [artifactGraphIndexAdapter]` manually.

**Document updates**

- [ ] Update `docs/architecture/components/INDEXING.md` to describe the artifact lifecycle indexing trigger matrix.
- [ ] Update `docs/architecture/components/RETRIEVAL.md` to state which artifact lifecycle states are allowed to retain capsule PG index rows.

**Test and eval updates**

- [ ] Extend `packages/server/src/lib/indexing/skill-events.test.ts` with cases for:
  - `approved -> agent-pass` yields `remove`
  - `approved -> agent-rejected` yields `remove`
  - `approved -> rejected` yields `remove`
  - `agent-pass -> approved` yields `upsert`
- [ ] Extend route tests in:
  - `packages/server/src/routes/operations/skill-edit.test.ts`
  - `packages/server/src/routes/operations/skill-review.test.ts`
  - `packages/server/src/routes/operations/artifacts-activate.test.ts`
  to assert that stale retrieval-visible indexes do not survive lifecycle regressions.
- [ ] If artifact import can create immediately approved fixtures in any path, add a regression test for that entrypoint too.

**Example structure or code**

```ts
const ARTIFACT_REMOVING_STATES = new Set<LifecycleState>([
  'agent-pass',
  'agent-rejected',
  'rejected',
  'deactivated',
]);

if (previousState === 'approved' && ARTIFACT_REMOVING_STATES.has(nextState)) {
  return 'remove';
}
```

## Phase 2: Wire Capsule PG Index Sync Into The Artifact Indexing Seam

- [ ] Promote capsule keyword/vector sync from "library capability" to "artifact lifecycle side effect".
- [ ] Add removal of stale capsule rows for deleted/removed capsules, not just upsert of current ones.
- [ ] Ensure startup creates any missing capsule vector index required by the PG semantic channel.

**Completion standard**

- Approving an artifact with derived capsules writes `skill_artifact_capsule_keywords` and `skill_artifact_capsule_embeddings` rows without requiring a manual rebuild job.
- Editing an approved artifact so that capsules change removes obsolete capsule rows and upserts only the current revision's rows.
- The PG semantic path does not rely on a manually created HNSW index; bootstrap ensures it the same way trap-side vector search already does.

**Document updates**

- [ ] Update `docs/architecture/components/RETRIEVAL.md` so "Artifact publish / approve -> syncArtifactCapsules()" becomes true for the production path, not just the intended architecture.
- [ ] Update `docs/operations/ENVIRONMENT.md` with the exact meaning of `RETRIEVAL_CAPSULE_PG_KEYWORD` and `RETRIEVAL_CAPSULE_PG_SEMANTIC`, including the requirement that lifecycle sync must be enabled for them to be useful.
- [ ] Update `docs/reference/PERFORMANCE.md` if startup now ensures capsule HNSW indexes automatically.

**Test and eval updates**

- [ ] Extend `packages/server/src/__tests__/lib/retrieval/capsule-index-sync.test.ts` to cover:
  - resync after capsule removal
  - status after artifact leaves approved state
  - sync invoked from lifecycle path, not just direct helper call
- [ ] Add an integration-level test that enables `RETRIEVAL_CAPSULE_PG_KEYWORD` or `RETRIEVAL_CAPSULE_PG_SEMANTIC` and verifies an approved artifact becomes searchable without running rebuild utilities manually.
- [ ] Add or extend startup/bootstrap tests to assert capsule vector index ensure logic is called in PG mode.

**Example structure or code**

```ts
export const capsuleKeywordArtifactAdapter: ArtifactIndexAdapter = {
  kind: 'capsule-keyword',
  async sync({ artifact }) {
    const result = await capsuleIndexSync.syncArtifactCapsules(artifact);
    return {
      success: result.keyword.every((row) => row.status === 'synced'),
      performedWork: result.keyword.length > 0,
      error: result.keyword.find((row) => row.status === 'failed')?.lastError ?? null,
    };
  },
  async remove({ artifactId, data }) {
    const artifact = data.skillArtifacts?.find((entry) => entry.id === artifactId);
    const capsuleIds = artifact?.latestRevision.derived?.capsules.map((c) => c.capsuleId) ?? [];
    for (const capsuleId of capsuleIds) {
      await capsuleIndexSync.removeCapsuleIndex(capsuleId);
    }
  },
};
```

## Phase 3: Migrate Old Skill Retrieval Entrypoints Onto The Shared Capsule Recall Path

- [ ] Stop maintaining a second, in-memory-only skill retrieval implementation in `searchSkillsByContent()`.
- [ ] Reuse the same coordinator/channel strategy as v2 so PG capsule indexes benefit both entrypoints.
- [ ] Keep the artifact-first response contract while delegating recall to the shared capsule pipeline.

**Completion standard**

- `/v1/retrieval/skills/search-by-content` uses the shared capsule recall coordinator and can benefit from PG keyword/vector channels when enabled.
- The route still returns the current artifact-first contract (`matches[]`), but candidate generation no longer bypasses v2 recall infrastructure.
- Governance semantics remain identical to today; only the recall/ranking implementation changes.

**Document updates**

- [ ] Update `docs/architecture/components/RETRIEVAL.md` to show the relationship between `searchKnowledgeV2()` and `searchSkillsByContent()`.
- [ ] Update `docs/reference/api-surface.md` and any CLI-facing retrieval docs if the endpoint behavior or performance characteristics change.
- [ ] Update `docs/architecture/CLI.md` if `skill search-by-content` now shares v2 recall/index behavior.

**Test and eval updates**

- [ ] Rewrite `packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts` around shared coordinator behavior:
  - artifact-first dedupe remains stable
  - PG-enabled path works
  - in-memory fallback still works when PG path is disabled or empty
- [ ] Extend `packages/server/src/routes/retrieval.test.ts` with:
  - one case proving search-by-content uses indexed recall when capsule PG flags are enabled
  - one case proving lifecycle-regressed artifacts are not surfaced
- [ ] Decide whether to extend `packages/contracts/src/domain/evals/retrieval.ts` to admit `/v1/retrieval/skills/search-by-content`; if yes, add smoke/core cases and normalize/governance support. If no, add a dedicated non-eval smoke harness and document that boundary.

**Example structure or code**

```ts
const recall = await sharedCapsuleCoordinator.execute({
  artifacts: governedArtifacts,
  intent,
  governanceFilters,
  maxResults: parsed.maxResults * 3,
});

const matches = dedupeArtifactsFromCapsuleCandidates(
  governedArtifacts,
  recall.capsuleCandidates,
  parsed.maxResults,
);
```

## Phase 4: Expose Operator Rebuild, Health, And Repair Entrypoints For Capsule Indexes

- [ ] Stop leaving capsule rebuild/health APIs as test-only library helpers.
- [ ] Provide one stable operator surface for rebuild, health report, and orphan cleanup.
- [ ] Keep the surface narrow and internal-only; avoid inventing broad public API.

**Completion standard**

- Operators can trigger full rebuild, single-artifact rebuild, health report, and orphan cleanup without ad hoc scripting against library internals.
- The chosen surface is documented and covered by tests:
  - stable admin route
  - or stable internal CLI/script
  - or both
- Existing docs no longer describe this capability as merely theoretical.

**Document updates**

- [ ] Update `docs/operations/ENVIRONMENT.md` to replace the current "not exposed as stable CLI" caveat with the real operator path, or explicitly document the chosen internal-only path.
- [ ] Update `docs/operations/TESTING.md` with concrete commands for rebuild/health verification.
- [ ] Update `docs/architecture/components/RETRIEVAL.md` operator section to point to the real execution path.

**Test and eval updates**

- [ ] Add route or script tests for:
  - full rebuild success
  - targeted artifact rebuild
  - health report with missing/failed/orphan rows
  - orphan cleanup removal counts
- [ ] Add one operator smoke path that seeds drift, runs repair, then proves retrieval works again.
- [ ] If this becomes an HTTP operator route, add governance/auth coverage for admin-only access.

**Example structure or code**

```ts
app.post('/v1/operations/retrieval/capsule-index/rebuild', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'system:operate');

  const artifacts = await app.skillShareer.repos.artifact.listByFilter({});
  return rebuildAllCapsuleIndexes({
    pool: app.skillShareer.store.getPool(),
    artifacts,
  });
});
```

## Phase 5: Expand Docs, Tests, And Evals To Lock The Wiring In Place

- [ ] Remove the remaining doc drift between intended retrieval architecture and actual production wiring.
- [ ] Add regression coverage so future refactors cannot silently fall back to real-time in-memory skill recall again.
- [ ] Record rollout and verification commands for PG-enabled retrieval paths.

**Completion standard**

- Retrieval architecture docs match the actual runtime:
  - v2 and search-by-content both describe whether they use shared capsule recall
  - capsule PG indexes are documented as write-synced lifecycle-derived data
  - operator repair path is documented and real
- Tests fail if artifact lifecycle stops removing stale retrieval indexes.
- Eval coverage or smoke coverage exists for every user-visible retrieval surface affected by this plan.

**Document updates**

- [ ] `docs/architecture/components/RETRIEVAL.md`
- [ ] `docs/architecture/components/INDEXING.md`
- [ ] `docs/operations/ENVIRONMENT.md`
- [ ] `docs/operations/TESTING.md`
- [ ] `docs/reference/api-surface.md`
- [ ] `docs/README.md` if command discoverability or architecture entrypoints need updating

**Test and eval updates**

- [ ] Run and record at minimum:
  - `pnpm test -- --run packages/server/src/lib/indexing/skill-events.test.ts packages/server/src/__tests__/lib/retrieval/capsule-index-sync.test.ts packages/server/src/__tests__/lib/retrieval/capsule-index-rebuild.test.ts packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts packages/server/src/routes/retrieval.test.ts packages/server/src/routes/operations/skill-review.test.ts packages/server/src/routes/operations/skill-edit.test.ts packages/server/src/routes/operations/artifacts-activate.test.ts`
  - `pnpm typecheck`
  - `pnpm check`
  - `pnpm eval:retrieval:dry-run`
- [ ] If retrieval eval contracts are extended to include search-by-content:
  - add smoke dataset coverage
  - add core dataset coverage for governance + artifact-first ranking
  - update `evals/retrieval/lib/{adapters,normalize,assertions,governance}.ts`
- [ ] If search-by-content stays outside retrieval eval contracts, add a dedicated smoke script or route integration test and document why.

**Example verification matrix**

```md
| Surface | In-memory fallback | PG indexed path | Lifecycle stale-removal assertion |
| --- | --- | --- | --- |
| `/v2/retrieval/search` | yes | yes | yes |
| `/v1/retrieval/skills/search-by-content` | yes | yes | yes |
| Capsule rebuild operator path | n/a | yes | yes |
```

## Phase Completion Checklist

### Task completion

- [ ] All checkboxes for the phase are completed
- [ ] Actual completion date is recorded in this file

### Code quality

- [ ] `pnpm typecheck` passes
- [ ] `pnpm check` passes
- [ ] The smallest relevant `pnpm test -- --run ...` set passes

### Retrieval/indexing verification

- [ ] PG-enabled capsule retrieval path is exercised where the phase changes it
- [ ] Lifecycle transitions that leave `approved` no longer leak stale retrieval-visible indexes
- [ ] Any added operator rebuild/repair path is exercised end-to-end where applicable

### Documentation sync

- [ ] Retrieval/indexing architecture docs are updated
- [ ] Testing/operations docs are updated
- [ ] API/eval docs are updated if contracts or operator surfaces changed

### Sign-off

- Implementer: ___________
- Date: ___________
