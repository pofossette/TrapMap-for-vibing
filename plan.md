# PG-First Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the mixed `store_snapshot` / repository architecture in core server flows, so PG mode and JSON mode behave consistently and the repo structure stops producing mode-specific bugs.

**Architecture:** Keep the public HTTP contract stable while converging internal reads and writes onto `app.skillShareer.repos`. Restrict `SkillShareerStore` to explicit compatibility and migration paths, extract shared knowledge/trap workflows into application services, and add tests that exercise the same workflow in both JSON and PG-backed execution paths.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, Vitest, pnpm, tsx

---

## Plan Metadata

- Archived previous root plan to `docs/archived/archived-plans/plan-2026-05-27-server-complexity-doc-drift-convergence.md`
- This file remains the active working plan at `plan.md`
- Primary problem statements from the repository review:
  - PG repositories and `store_snapshot` are treated as parallel fact sources
  - `access-key -> login` is inconsistent in PG mode
  - `traps.ts` and `knowledge.ts` have diverged behavior
  - retrieval, skill lookup, and graph-plan compilation still read from snapshot compatibility data
  - service wiring exposes too many overlapping access paths (`store`, legacy flat repos, unified `repos`)

## Scope

- In scope:
  - server-side structural convergence
  - route/service deduplication
  - PG-first read/write consistency
  - documentation, test, and eval updates required to lock the new structure in place
- Out of scope:
  - ranking logic redesign
  - API contract redesign
  - broad renaming of `SkillShareer*` identifiers unless needed for touched files

## Phase Tracker

- [ ] Phase 1: Establish a canonical server data-access boundary
- [ ] Phase 2: Fix auth, member, and access-key correctness across storage modes
- [ ] Phase 3: Unify knowledge and trap workflows behind shared services
- [ ] Phase 4: Move retrieval and planning flows off `store_snapshot`
- [x] Phase 5: Shrink the compatibility surface and add structural guardrails

## File Structure

**Create**

- `packages/server/src/lib/actors/lookup.ts`
- `packages/server/src/lib/actors/lookup.test.ts`
- `packages/server/src/lib/knowledge/application-service.ts`
- `packages/server/src/lib/knowledge/application-service.test.ts`
- `packages/server/src/lib/retrieval/read-model.ts`
- `packages/server/src/lib/retrieval/read-model.test.ts`
- `packages/server/src/routes/members.test.ts`
- `packages/server/src/routes/traps.test.ts`
- `packages/server/src/__tests__/pg-first-compat.test.ts`
- `packages/server/src/__tests__/snapshot-usage-guard.test.ts`

**Modify**

- `packages/server/src/app.ts`
- `packages/server/src/lib/context.ts`
- `packages/server/src/lib/knowledge.ts`
- `packages/server/src/lib/auth/repository.ts`
- `packages/server/src/lib/auth/pg-repository.ts`
- `packages/server/src/lib/users/repository.ts`
- `packages/server/src/lib/users/pg-repository.ts`
- `packages/server/src/lib/teams/repository.ts`
- `packages/server/src/lib/teams/pg-repository.ts`
- `packages/server/src/lib/artifacts/repository.ts`
- `packages/server/src/routes/access-keys.ts`
- `packages/server/src/routes/auth.ts`
- `packages/server/src/routes/members.ts`
- `packages/server/src/routes/knowledge.ts`
- `packages/server/src/routes/traps.ts`
- `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- `packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
- `packages/server/src/routes/retrieval.ts`
- `docs/PACKAGES.md`
- `docs/guides/CODE_GUIDE.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/FLOW.md`
- `docs/reference/DATA_MODEL.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/reference/api-surface.md`
- `docs/operations/TESTING.md`

## Global Done Criteria

- [ ] Every touched workflow has the same observable behavior in JSON mode and PG mode
- [ ] New writes performed through routes used by production paths are readable by the next request without relying on `store_snapshot`
- [ ] No route in the core path mixes `repos.*` writes with `store.snapshot()` reads of the same aggregate for correctness
- [x] Phase-specific documentation is updated in the same change as the code
- [x] Phase-specific tests and required eval commands are updated and run

---

### Phase 1: Establish a canonical server data-access boundary

**Files:**

- Create: `packages/server/src/lib/actors/lookup.ts`
- Test: `packages/server/src/lib/actors/lookup.test.ts`
- Modify: `packages/server/src/lib/context.ts`
- Modify: `packages/server/src/lib/knowledge.ts`
- Modify: `packages/server/src/routes/knowledge.ts`
- Modify: `packages/server/src/routes/traps.ts`
- Modify: `docs/PACKAGES.md`
- Modify: `docs/reference/DATA_MODEL.md`

**Phase completion criteria:**

- `toKnowledgeEntry()` and related serializers can be fed from repository-backed actor lookup data instead of `store.snapshot()`
- touched routes stop using `store.snapshot()` only to resolve user handles or membership levels
- the codebase has one documented rule: route/business logic reads current aggregate state from `repos`, not from snapshot compatibility data

**Documentation updates required:**

- `docs/PACKAGES.md`: document `repos` as the canonical service boundary for server business logic
- `docs/reference/DATA_MODEL.md`: state explicitly which domains are still allowed to use compatibility snapshot data
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`: add a row for “server data-access boundary”

**Test / eval updates required:**

- add unit tests for actor lookup assembly in `packages/server/src/lib/actors/lookup.test.ts`
- update `packages/server/src/routes/knowledge.test.ts` so route serialization works without pre-populating snapshot user arrays
- run `rtk pnpm test -- --run packages/server/src/lib/actors/lookup.test.ts packages/server/src/routes/knowledge.test.ts`
- run `rtk pnpm typecheck`
- run `rtk pnpm eval:smoke`

**Necessary example structure or code:**

```ts
export interface ActorLookupSource {
  getUsersByIds(userIds: string[]): Promise<Array<{ id: string; handle: string }>>;
  getMembershipLevels(
    pairs: Array<{ userId: string; teamId: string }>,
  ): Promise<Map<string, number>>;
}

export async function buildUserLookupContextForKnowledge(
  source: ActorLookupSource,
  entries: KnowledgeRecord[],
): Promise<UserLookupContext> {
  // Collect actor ids from owner, revisions, review history, and lifecycle events.
}
```

- [ ] **Step 1.1: Add repository-friendly actor lookup primitives**

```ts
export interface UserRepository {
  getById(userId: string): Promise<UserRecord | null>;
  listByIds(userIds: string[]): Promise<UserRecord[]>;
}

export interface MembershipRepository {
  listByUserIds(userIds: string[]): Promise<MembershipRecord[]>;
}
```

Run: `rtk pnpm typecheck`  
Expected: FAIL until implementations are added.

- [ ] **Step 1.2: Implement `buildUserLookupContextForKnowledge()` and cover it with unit tests**

```ts
const context = await buildUserLookupContextForKnowledge(
  {
    getUsersByIds: async (ids) => ids.map((id) => ({ id, handle: `user-${id}` })),
    getMembershipLevels: async () => new Map([['user_1:team_1', 5]]),
  },
  [entry],
);

expect(context.users).toEqual([{ id: 'user_1', handle: 'user-user_1' }]);
```

- [ ] **Step 1.3: Replace route-level snapshot serialization calls in knowledge/trap reads with the new lookup path**

```ts
const lookup = await buildUserLookupContextForKnowledgeFromRepos(app.skillShareer.repos, [entry]);
return knowledgeEntryResponseSchema.parse({
  entry: toKnowledgeEntry(lookup, entry),
});
```

- [ ] **Step 1.4: Update package/data-model documentation and rerun the targeted checks**

Run: `rtk pnpm test -- --run packages/server/src/lib/actors/lookup.test.ts packages/server/src/routes/knowledge.test.ts`  
Expected: PASS

Run: `rtk pnpm eval:smoke`  
Expected: PASS

---

### Phase 2: Fix auth, member, and access-key correctness across storage modes

**Files:**

- Modify: `packages/server/src/lib/auth/repository.ts`
- Modify: `packages/server/src/lib/auth/pg-repository.ts`
- Modify: `packages/server/src/lib/users/repository.ts`
- Modify: `packages/server/src/lib/users/pg-repository.ts`
- Modify: `packages/server/src/lib/teams/repository.ts`
- Modify: `packages/server/src/lib/teams/pg-repository.ts`
- Modify: `packages/server/src/routes/access-keys.ts`
- Modify: `packages/server/src/routes/auth.ts`
- Modify: `packages/server/src/routes/members.ts`
- Test: `packages/server/src/routes/access-keys.test.ts`
- Test: `packages/server/src/routes/auth.test.ts`
- Create/Test: `packages/server/src/routes/members.test.ts`
- Create/Test: `packages/server/src/__tests__/pg-first-compat.test.ts`
- Modify: `docs/reference/api-surface.md`
- Modify: `docs/operations/TESTING.md`

**Phase completion criteria:**

- issuing an access key and then logging in with that key passes in PG mode and JSON mode
- `createMemberRequestSchema.securityLevel` is honored by both storage implementations
- access-key creation no longer writes directly to `store.transact()` in the production path

**Documentation updates required:**

- `docs/reference/api-surface.md`: clarify that `POST /v1/members` persists the requested `securityLevel`
- `docs/operations/TESTING.md`: add a required cross-mode auth regression test checklist
- `docs/PACKAGES.md`: note that auth routes use repository-only persistence in PG mode

**Test / eval updates required:**

- extend `access-keys.test.ts` with `issue -> login` assertions
- add `members.test.ts` covering create/update flows and `securityLevel`
- add `pg-first-compat.test.ts` for route-level JSON vs PG parity on auth/member flows
- run `rtk pnpm test -- --run packages/server/src/routes/access-keys.test.ts packages/server/src/routes/auth.test.ts packages/server/src/routes/members.test.ts packages/server/src/__tests__/pg-first-compat.test.ts`
- run `rtk pnpm eval:smoke`

**Necessary example structure or code:**

```ts
export interface AccessKeyRepository {
  nextId(): Promise<string>;
  insert(key: AccessKeyRecord): Promise<void>;
  getByTokenHash(tokenHash: string): Promise<AccessKeyRecord | null>;
}

const keyId = await repos.accessKey.nextId();
await repos.accessKey.insert({
  id: keyId,
  memberId,
  tokenHash: hashSecret(accessKey),
  tokenPreview: accessKey.slice(-8),
  issuedByUserId: issuer.id,
  teamId,
  level: membership.securityLevel,
  notes,
  revokedAt: null,
  createdAt,
  updatedAt: createdAt,
});
```

- [ ] **Step 2.1: Add `nextId()` and any missing batch read helpers to auth/user/team repositories**

```ts
export class PgAccessKeyRepository implements AccessKeyRepository {
  async nextId(): Promise<string> {
    const { rows } = await this.pool.query<{ nextval: string }>(
      "SELECT nextval('access_key_id_seq') AS nextval",
    );
    return `access_key_${rows[0]?.nextval ?? '1'}`;
  }
}
```

- [ ] **Step 2.2: Refactor `POST /v1/access-keys` to use `repos.membership` and `repos.accessKey` instead of `store.transact()`**

```ts
const membership = await app.skillShareer.repos.membership.getById(payload.memberId);
const accessKeyId = await app.skillShareer.repos.accessKey.nextId();
await app.skillShareer.repos.accessKey.insert(record);
```

- [ ] **Step 2.3: Make `POST /v1/members` persist the caller-provided `securityLevel`**

```ts
const membership = {
  id: membershipId,
  userId: user.id,
  teamId: payload.teamId,
  roleTemplate: payload.roleTemplate,
  securityLevel: payload.securityLevel,
  permissions: payload.permissions,
  notes: payload.notes ?? null,
  createdAt,
  updatedAt: createdAt,
};
```

- [ ] **Step 2.4: Add cross-mode route tests and run the auth/member regression suite**

Run: `rtk pnpm test -- --run packages/server/src/routes/access-keys.test.ts packages/server/src/routes/auth.test.ts packages/server/src/routes/members.test.ts packages/server/src/__tests__/pg-first-compat.test.ts`  
Expected: PASS

---

### Phase 3: Unify knowledge and trap workflows behind shared services

**Files:**

- Create: `packages/server/src/lib/knowledge/application-service.ts`
- Test: `packages/server/src/lib/knowledge/application-service.test.ts`
- Modify: `packages/server/src/routes/knowledge.ts`
- Modify: `packages/server/src/routes/traps.ts`
- Test: `packages/server/src/routes/knowledge.test.ts`
- Create/Test: `packages/server/src/routes/traps.test.ts`
- Modify: `docs/guides/CODE_GUIDE.md`
- Modify: `docs/architecture/ARCHITECTURE.md`

**Phase completion criteria:**

- trap submit/resubmit/supersede and knowledge submit/resubmit/supersede share one persistence workflow
- `traps.ts` no longer depends on optional legacy flat repos such as `app.skillShareer.knowledgeRepo`
- trap resubmission persists revision, governance, lifecycle, and response serialization consistently

**Documentation updates required:**

- `docs/guides/CODE_GUIDE.md`: describe shared knowledge/trap application services instead of route-local workflows
- `docs/architecture/ARCHITECTURE.md`: document the route -> application service -> repository flow
- `docs/PACKAGES.md`: note that `/v1/traps` is a specialized presentation layer over the same aggregate workflow

**Test / eval updates required:**

- add `application-service.test.ts` for submit/resubmit/supersede semantics
- add `traps.test.ts` covering PG-mode trap resubmission and lifecycle persistence
- update `knowledge.test.ts` to assert shared service behavior instead of route-local mutation details
- run `rtk pnpm test -- --run packages/server/src/lib/knowledge/application-service.test.ts packages/server/src/routes/knowledge.test.ts packages/server/src/routes/traps.test.ts`
- run `rtk pnpm eval:smoke`

**Necessary example structure or code:**

```ts
export interface KnowledgeApplicationService {
  submit(input: SubmitKnowledgeInput): Promise<KnowledgeRecord>;
  resubmit(input: ResubmitKnowledgeInput): Promise<KnowledgeRecord>;
  supersede(input: SupersedeKnowledgeInput): Promise<KnowledgeRecord>;
}

export type EntryKind = 'knowledge' | 'trap';
```

- [ ] **Step 3.1: Extract submit/resubmit/supersede workflows from routes into `application-service.ts`**

```ts
const updated = await knowledgeApplicationService.resubmit({
  kind: 'trap',
  entryId: trapId,
  actor: auth,
  payload,
});
```

- [ ] **Step 3.2: Update `knowledge.ts` and `traps.ts` to become thin HTTP layers**

```ts
app.post('/v1/traps/:trapId/resubmit', async (request) => {
  const updated = await knowledgeApplicationService.resubmit({ kind: 'trap', ...input });
  return knowledgeEntryResponseSchema.parse({ entry: toKnowledgeEntry(lookup, updated) });
});
```

- [ ] **Step 3.3: Add tests that assert trap and knowledge paths persist the same aggregate fields**

```ts
expect(updated.lifecycleState).toBe('agent-pass');
expect(updated.latestSubmissionId).toBeDefined();
expect(updated.history).toHaveLength(2);
```

- [ ] **Step 3.4: Update architecture/code-guide docs and rerun the shared workflow suite**

Run: `rtk pnpm test -- --run packages/server/src/lib/knowledge/application-service.test.ts packages/server/src/routes/knowledge.test.ts packages/server/src/routes/traps.test.ts`  
Expected: PASS

---

### Phase 4: Move retrieval and planning flows off `store_snapshot`

**Files:**

- Create: `packages/server/src/lib/retrieval/read-model.ts`
- Test: `packages/server/src/lib/retrieval/read-model.test.ts`
- Modify: `packages/server/src/lib/artifacts/repository.ts`
- Modify: `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
- Modify: `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
- Modify: `packages/server/src/routes/retrieval.ts`
- Modify: `packages/server/src/routes/retrieval.test.ts`
- Modify: `docs/architecture/FLOW.md`
- Modify: `docs/reference/DATA_MODEL.md`

**Phase completion criteria:**

- v1 retrieval, v2 retrieval, skill lookup, and graph-plan compilation read knowledge/artifact state from repositories, not from snapshot compatibility rows
- a repo-only insert in PG mode is visible to the next retrieval request without manual snapshot sync
- embedding cache update no longer mutates `data.knowledgeEntries` through `store.transact()` in the PG path

**Documentation updates required:**

- `docs/architecture/FLOW.md`: show retrieval read-model construction from repositories
- `docs/reference/DATA_MODEL.md`: state that retrieval consumes repository truth plus derived graph index tables
- `docs/PACKAGES.md`: update retrieval module description to remove snapshot wording

**Test / eval updates required:**

- add `read-model.test.ts` for repository-backed read-model assembly
- update `routes/retrieval.test.ts` to cover PG-mode visibility after repo inserts
- update `orchestrator.test.ts` and `plan-compiler.test.ts` to use repository-backed fixtures
- run `rtk pnpm test -- --run packages/server/src/lib/retrieval/read-model.test.ts packages/server/src/routes/retrieval.test.ts packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts`
- run `rtk pnpm eval:retrieval:smoke`
- run `rtk pnpm eval:smoke`

**Necessary example structure or code:**

```ts
export async function buildRetrievalReadModel(
  repos: SkillShareerRepos,
): Promise<{
  knowledgeEntries: KnowledgeRecord[];
  skillArtifacts: SkillArtifactRecord[];
}> {
  const [knowledgeEntries, skillArtifacts] = await Promise.all([
    repos.knowledge.listByFilter({}),
    repos.artifact.listByFilter({}),
  ]);

  return { knowledgeEntries, skillArtifacts };
}
```

- [ ] **Step 4.1: Introduce a repository-backed retrieval read model**

```ts
const data = await buildRetrievalReadModel(services.repos);
const eligibleEntries = filterEligibleEntries(data.knowledgeEntries, auth, parsed.filters);
```

- [ ] **Step 4.2: Replace snapshot reads in orchestrator, skill lookup, and plan compiler**

```ts
const artifacts = data.skillArtifacts;
const governedArtifacts = artifacts.filter((artifact) =>
  isArtifactGovernanceEligible(artifact, governanceFilters),
);
```

- [ ] **Step 4.3: Move embedding-cache updates behind repository-facing write methods**

```ts
await services.repos.knowledge.updateEmbeddingCache(entryId, {
  textHash,
  vector,
  createdAt: nowIso(),
  revision,
});
```

- [ ] **Step 4.4: Run retrieval-focused tests and smoke evals**

Run: `rtk pnpm test -- --run packages/server/src/lib/retrieval/read-model.test.ts packages/server/src/routes/retrieval.test.ts packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts`  
Expected: PASS

Run: `rtk pnpm eval:retrieval:smoke`  
Expected: PASS

---

### Phase 5: Shrink the compatibility surface and add structural guardrails

**Files:**

- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/lib/context.ts`
- Create/Test: `packages/server/src/__tests__/snapshot-usage-guard.test.ts`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `docs/operations/TESTING.md`
- Modify: `README.md`

**Phase completion criteria:**

- core route/service code uses `repos` as the default access path
- any remaining `store.snapshot()` or `store.transact()` usage is limited to an explicit allowlist of compatibility, migration, or diagnostic modules
- the server wiring no longer encourages new call sites to choose between legacy flat repos, unified repos, and raw store access

**Documentation updates required:**

- `docs/reference/SYSTEM_TRUTH_SOURCES.md`: define the allowlist for compatibility-only snapshot usage
- `docs/operations/TESTING.md`: add a structural regression checklist for snapshot usage and cross-mode parity
- `README.md`: note the PG-first convergence status and where compatibility boundaries still remain

**Test / eval updates required:**

- add `snapshot-usage-guard.test.ts` that scans server source and fails on non-allowlisted snapshot usage
- rerun the full focused verification set:
  - `rtk pnpm typecheck`
  - `rtk pnpm check`
  - `rtk pnpm test`
  - `rtk pnpm eval:smoke`
- if retrieval behavior changed materially, also run `rtk pnpm eval:core`

**Necessary example structure or code:**

```ts
const SNAPSHOT_ALLOWLIST = [
  'packages/server/src/lib/persistence/postgres-store.ts',
  'packages/server/src/lib/persistence/migrate-knowledge.ts',
  'packages/server/src/routes/operations/status.ts',
];

expect(disallowedSnapshotUsages).toEqual([]);
```

- [x] **Step 5.1: Remove or mark legacy flat repo properties as compatibility-only**

```ts
export interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;
  repos: SkillShareerRepos;
  ai: AiProviders;
  eventBus: LifecycleEventBus;
}
```

- [x] **Step 5.2: Add a guard test for non-allowlisted snapshot usage**

```ts
const snapshotMatches = await findSnapshotUsage();
const disallowedSnapshotUsages = snapshotMatches.filter(
  (match) => !SNAPSHOT_ALLOWLIST.includes(match.file),
);

expect(disallowedSnapshotUsages).toEqual([]);
```

- [x] **Step 5.3: Update top-level docs and testing instructions**

```md
- Core request handling reads and writes through `packages/server/src/lib/repos/`
- `store_snapshot` remains a compatibility surface only for migration and diagnostics
```

- [x] **Step 5.4: Run full verification and close the plan**

Run: `rtk pnpm typecheck`  
Expected: PASS

Run: `rtk pnpm check`  
Expected: PASS

Run: `rtk pnpm test`  
Expected: PASS

Run: `rtk pnpm eval:smoke`  
Expected: PASS

Run: `rtk git status --short`  
Expected: only intended plan-following changes remain

---

## Self-Review Checklist

- [ ] Every critical review finding maps to at least one phase in this plan
- [ ] Each phase has:
  - [ ] completion criteria
  - [ ] documentation updates
  - [ ] test / eval updates
  - [ ] example structure or code
- [ ] No phase depends on hand-waving about “clean up later”
- [ ] The default implementation direction is conservative: reuse existing repositories and test patterns before adding new abstractions

---

# Retrieval Eval Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the current retrieval/summary eval failures so v2 label filters constrain all capsule outputs, v1 low-`maxResults` ranking is stable for the core fixture, and CI baseline comparison/docs match the actual eval workflow.

**Architecture:** Keep the public retrieval contracts unchanged while tightening the internal filter and ranking paths. Push query metadata filters all the way through capsule recall, profile hint assembly, and summary generation; add deterministic ranking support for the failing v1 semantic case; then align eval documentation and baseline wiring with the code that CI actually runs.

**Tech Stack:** TypeScript, Fastify, Vitest, pnpm, tsx, Drizzle ORM, PostgreSQL

---

## Plan Metadata

- Triggering failures observed on 2026-05-27:
  - `v2-label-filter-core`: expected 1 filtered capsule but returned 2
  - `summary-core-label-filter`: summary leaked `Flask` because unfiltered Python capsule remained in v2 output
  - `v1-low-maxresults-core`: `maxResults=1` returned `knowledge_core_docker_networking` instead of `knowledge_core_docker_primary`
  - `eval:ci` always reported `No baseline available` because code and docs use different baseline paths
- Reports captured during analysis:
  - `reports/codex-eval-smoke.json`
  - `reports/codex-eval-core.json`
  - `reports/eval-report.json`
- Root-cause summary:
  - v2 capsule retrieval only carries governance filters, not query `labels/scopes`
  - PG capsule recall paths support scope filtering but not label filtering
  - v1 semantic top-1 ordering is too dependent on embedding similarity for the Docker fixture
  - eval documentation points to `reports/baseline-v2-*.json` while CI reads `reports/baselines/baseline-*.json`

## Scope

- In scope:
  - v2 capsule filter propagation for memory and PG recall paths
  - v2 profile hint and summary filtering correctness
  - v1 semantic ranking fix for the failing low-`maxResults` case
  - smoke/core regression coverage for these failure modes
  - eval baseline/doc workflow alignment
- Out of scope:
  - broad retrieval ranking redesign
  - LLM judge provider changes
  - graph extraction, dedup, or conflict metric redesign

## Phase Tracker

- [x] Phase 6: Propagate query filters through the v2 capsule retrieval path
- [x] Phase 7: Lock the v2 filter fix into route, orchestrator, and smoke/core eval coverage
- [x] Phase 8: Stabilize v1 low-`maxResults` semantic ranking for the Docker core fixture
- [ ] Phase 9: Align eval baseline paths and advanced-runner documentation with actual CI behavior

## File Structure

**Modify**

- `packages/server/src/lib/retrieval/types.ts`
- `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- `packages/server/src/lib/retrieval/capsules/capsule-recall.ts`
- `packages/server/src/lib/retrieval/capsules/channels/keyword.ts`
- `packages/server/src/lib/retrieval/capsules/channels/semantic.ts`
- `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-keyword.ts`
- `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-vector.ts`
- `packages/server/src/lib/retrieval/recall/semantic.ts`
- `packages/server/src/lib/retrieval/capsules/capsule-recall.test.ts`
- `packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts`
- `packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts`
- `packages/server/src/lib/retrieval/recall/semantic.test.ts`
- `packages/server/src/lib/retrieval/response/summary.test.ts`
- `packages/server/src/routes/retrieval.test.ts`
- `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts`
- `evals/retrieval/datasets/core/v1-retrieval-core.ts`
- `evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts`
- `evals/summary/datasets/smoke/summary-smoke.ts`
- `evals/summary/scenarios/smoke/summary-smoke-scenarios.ts`
- `evals/retrieval/README.md`
- `evals/summary/README.md`
- `evals/README.md`
- `evals/scripts/eval-ci.ts`
- `docs/operations/TESTING.md`
- `docs/architecture/components/RETRIEVAL.md`

## Global Done Criteria

- [ ] `filters.labels` and `filters.scopes` affect v2 capsules, `profileHints`, and summary citations/text in both memory and PG recall paths
- [ ] `v2-label-filter-core` and `summary-core-label-filter` pass without weakening their expectations
- [ ] `v1-low-maxresults-core` passes by improving ranking behavior, not by removing the assertion
- [ ] smoke-tier regression coverage exists for v2 label filtering so the bug is caught before core
- [ ] eval baseline comparison can discover the expected baseline file in CI and the docs show the same path/commands that CI uses

---

### Phase 6: Propagate query filters through the v2 capsule retrieval path

**Files:**

- Modify: `packages/server/src/lib/retrieval/types.ts`
- Modify: `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/capsule-recall.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/channels/keyword.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/channels/semantic.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-keyword.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-vector.ts`
- Test: `packages/server/src/lib/retrieval/capsules/capsule-recall.test.ts`
- Test: `packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts`

**Phase completion criteria:**

- `ArtifactGovernanceFilters` carries query `labels` and `scopes` in addition to governance fields
- in-memory capsule selection excludes artifacts/capsules that do not satisfy requested labels/scopes
- PG keyword recall filters by exact requested labels as well as scopes
- PG vector recall applies the same label constraints as the keyword path, without returning cross-label capsules

**Documentation updates required:**

- `docs/architecture/components/RETRIEVAL.md`: state that v2 query filters are applied before profile hints and summaries are assembled
- `evals/retrieval/README.md`: note that v2 label-filter cases assert the full capsule payload, not just top-1 relevance

**Test / eval updates required:**

- extend `capsule-recall.test.ts` with artifact/capsule label-filter coverage
- extend `recall-coordinator.test.ts` with a mixed-label multi-channel recall case
- run `rtk pnpm test -- --run packages/server/src/lib/retrieval/capsules/capsule-recall.test.ts packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts`
- run `rtk pnpm typecheck`

**Necessary example structure or code:**

```ts
export interface ArtifactGovernanceFilters {
  teamId: string | null;
  securityLevel: number;
  isSystemAdmin: boolean;
  scopes: Array<'global' | 'project'>;
  labels: string[];
}

function matchesArtifactMetadata(
  artifact: Pick<SkillArtifactRecord, 'scope' | 'labels'>,
  filters: ArtifactGovernanceFilters,
): boolean {
  if (filters.scopes.length > 0 && !filters.scopes.includes(artifact.scope)) {
    return false;
  }
  if (filters.labels.length > 0) {
    return filters.labels.every((label) => artifact.labels.includes(label));
  }
  return true;
}
```

- [ ] **Step 6.1: Extend the v2 filter object to carry query metadata filters**

```ts
const governanceFilters = {
  teamId: auth.activeTeamId,
  securityLevel: auth.securityLevel,
  isSystemAdmin: auth.subjectType === 'system-admin',
  scopes: parsed.filters.scopes,
  labels: parsed.filters.labels,
};
```

Run: `rtk pnpm typecheck`  
Expected: FAIL until all `ArtifactGovernanceFilters` call sites are updated.

- [ ] **Step 6.2: Apply label/scope matching inside capsule extraction and profile shortlist assembly**

```ts
for (const artifact of artifacts) {
  if (!isArtifactGovernanceEligible(artifact, filters)) continue;
  if (!matchesArtifactMetadata(artifact, filters)) continue;

  const profile = artifact.latestRevision.derived?.profile;
  if (profile) shortlist.push({ artifact, profile });
}
```

- [ ] **Step 6.3: Preserve the same filter semantics in PG keyword/vector recall**

```ts
export interface PgCapsuleKeywordFilters {
  teamId: string | null;
  securityLevel: number;
  isSystemAdmin: boolean;
  scopes: string[];
  labels: string[];
}

if (filters.labels.length > 0) {
  const labelArray = filters.labels.map((label) => `'${label}'`).join(',');
  conditions.push(
    sql`${skillArtifactCapsuleKeywords.fieldTokensLabels} @> ${sql.raw(`ARRAY[${labelArray}]::text[]`)}`,
  );
}
```

```ts
const rows = await db
  .select({
    capsuleId: skillArtifactCapsuleEmbeddings.capsuleId,
    artifactId: skillArtifactCapsuleEmbeddings.artifactId,
    revisionNo: skillArtifactCapsuleEmbeddings.revisionNo,
    similarity: sql<number>`1 - (${skillArtifactCapsuleEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
  })
  .from(skillArtifactCapsuleEmbeddings)
  .innerJoin(
    skillArtifactCapsuleKeywords,
    eq(skillArtifactCapsuleEmbeddings.capsuleId, skillArtifactCapsuleKeywords.capsuleId),
  );
```

- [ ] **Step 6.4: Verify that mixed-label capsules no longer survive coordinator output**

Run: `rtk pnpm test -- --run packages/server/src/lib/retrieval/capsules/capsule-recall.test.ts packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts`  
Expected: PASS with filtered capsule sets only.

Run: `rtk pnpm typecheck`  
Expected: PASS

---

### Phase 7: Lock the v2 filter fix into route, orchestrator, and smoke/core eval coverage

**Files:**

- Modify: `packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts`
- Modify: `packages/server/src/lib/retrieval/response/summary.test.ts`
- Modify: `packages/server/src/routes/retrieval.test.ts`
- Modify: `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts`
- Modify: `evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts`
- Modify: `evals/summary/datasets/smoke/summary-smoke.ts`
- Modify: `evals/summary/scenarios/smoke/summary-smoke-scenarios.ts`
- Modify: `evals/summary/README.md`
- Modify: `docs/operations/TESTING.md`

**Phase completion criteria:**

- route-level v2 tests assert that `capsules`, `profileHints`, and `summary.citations` are all label-filtered
- orchestrator tests cover the exact mixed Node/Flask summary regression
- smoke retrieval and smoke summary include at least one label-filter regression case each
- the bug can be caught by `eval:smoke`, not only by `eval:core`

**Documentation updates required:**

- `evals/summary/README.md`: add a note that summary evals depend on already-filtered retrieval context
- `docs/operations/TESTING.md`: require a smoke-tier label-filter regression case for any retrieval filter bugfix

**Test / eval updates required:**

- extend `routes/retrieval.test.ts` with a v2 route test that seeds `nodejs` and `python` artifacts and expects only the requested label
- extend `orchestrator.test.ts` with a summary-filter assertion that `Flask` never appears when `labels: ['nodejs']`
- add smoke retrieval/summary eval fixtures for label filtering
- run `rtk pnpm test -- --run packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts packages/server/src/lib/retrieval/response/summary.test.ts packages/server/src/routes/retrieval.test.ts`
- run `rtk pnpm eval:retrieval:smoke`
- run `rtk pnpm eval:summary:smoke`
- run `rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-all.ts --tier smoke --json --json-path ./reports/codex-eval-smoke.json`

**Necessary example structure or code:**

```ts
expect(json.capsules.map((capsule) => capsule.artifactId)).toEqual([
  'artifact_core_label_filter_node',
]);
expect(json.profileHints.map((hint) => hint.artifactId)).toEqual([
  'artifact_core_label_filter_node',
]);
expect(json.summary?.text).not.toContain('Flask');
expect(json.summary?.citations.map((citation) => citation.source.entryId)).toEqual([
  'capsule_core_label_filter_node',
]);
```

- [x] **Step 7.1: Add route-level assertions for filtered v2 payloads**

```ts
const response = await testApp.inject({
  method: 'POST',
  url: '/v2/retrieval/search',
  payload: {
    seed: 'backend REST API middleware',
    includeSummary: true,
    filters: { labels: ['nodejs'], scopes: [] },
  },
  headers: { authorization: `Bearer ${sessionId}` },
});

expect(response.statusCode).toBe(200);
expect(response.json().capsules).toHaveLength(1);
```

- [x] **Step 7.2: Add orchestrator and summary-builder regression tests for the mixed Node/Flask case**

```ts
expect(result.summary?.text).toContain('Express.js middleware');
expect(result.summary?.text).not.toContain('Flask');
expect(result.profileHints).toEqual([
  expect.objectContaining({ artifactId: 'artifact_core_label_filter_node' }),
]);
```

- [x] **Step 7.3: Promote label-filter regressions into smoke eval datasets**

```ts
export const v2LabelFilterSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-label-filter-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'backend REST API middleware',
    maxResults: 10,
    filters: { labels: ['nodejs'], scopes: [] },
  },
  scenarioId: 'smoke-label-filter',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_label_filter_node'],
      idealOrder: ['capsule_smoke_label_filter_node'],
    },
    governance: { forbiddenIds: [], forbiddenReasons: [] },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_smoke_label_filter_node'],
      expectedCapsuleCount: 1,
    },
  },
});
```

- [x] **Step 7.4: Run the route/orchestrator suite and smoke evals**

Run: `rtk pnpm test -- --run packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts packages/server/src/lib/retrieval/response/summary.test.ts packages/server/src/routes/retrieval.test.ts`  
Expected: PASS

Run: `rtk pnpm eval:retrieval:smoke`  
Expected: PASS with the new label-filter smoke case included.

Run: `rtk pnpm eval:summary:smoke`  
Expected: PASS with no forbidden claims.

---

### Phase 8: Stabilize v1 low-`maxResults` semantic ranking for the Docker core fixture

**Files:**

- Modify: `packages/server/src/lib/retrieval/recall/semantic.ts`
- Modify: `packages/server/src/lib/retrieval/recall/semantic.test.ts`
- Modify: `packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts`
- Modify: `evals/retrieval/datasets/core/v1-retrieval-core.ts`
- Modify: `evals/retrieval/README.md`
- Modify: `docs/architecture/components/RETRIEVAL.md`

**Phase completion criteria:**

- the query `docker deployment orchestration` ranks `knowledge_core_docker_primary` above `knowledge_core_docker_networking`
- `v1-low-maxresults-core` passes with `maxResults=1`
- the semantic ranking adjustment is deterministic and unit-tested
- the eval dataset remains strict; no weakening from `projectKnowledge` top-1 to “any Docker result”

**Documentation updates required:**

- `docs/architecture/components/RETRIEVAL.md`: describe the lexical prior applied on top of semantic similarity for low-result v1 retrieval
- `evals/retrieval/README.md`: call out the `low-maxresults` case as a top-1 ranking guard, not just a shape contract

**Test / eval updates required:**

- add a semantic recall unit test that reproduces the Docker ranking order
- add a coordinator-level test covering `maxResults=1` for the fixture shape
- run `rtk pnpm test -- --run packages/server/src/lib/retrieval/recall/semantic.test.ts packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts`
- run `rtk pnpm eval:retrieval:core`
- run `rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-all.ts --tier core --json --json-path ./reports/codex-eval-core.json`

**Necessary example structure or code:**

```ts
function computeLexicalIntentBoost(seed: string, entry: KnowledgeRecord): number {
  const queryTokens = normalizeQuery(seed);
  const entryTokens = normalizeQuery(buildEmbeddingText(entry));
  const overlapCount = queryTokens.filter((token) => entryTokens.includes(token)).length;
  return overlapCount === 0 ? 0 : Math.min(0.15, overlapCount / queryTokens.length / 5);
}

const lexicalBoost = computeLexicalIntentBoost(seed, entry);
const finalScore = Math.min(1, Math.max(0, score + lexicalBoost + boundaryDelta));
```

- [x] **Step 8.1: Add a small deterministic lexical-intent boost on top of semantic similarity**

```ts
const lexicalBoost = computeLexicalIntentBoost(seed, entry);
const finalScore = Math.min(1, Math.max(0, score + lexicalBoost + boundaryDelta));
```

Run: `rtk pnpm test -- --run packages/server/src/lib/retrieval/recall/semantic.test.ts`
Expected: FAIL until the new ranking expectation is encoded.

- [x] **Step 8.2: Add a regression test for the Docker top-1 ordering**

```ts
expect(scoredEntries.map((entry) => entry.entry.id)).toEqual([
  'knowledge_core_docker_primary',
  'knowledge_core_docker_networking',
  'knowledge_core_docker_secondary',
]);
```

- [x] **Step 8.3: Keep the eval case strict and document why it exists**

```ts
expected: {
  outcome: 'non-empty',
  relevance: {
    relevantIds: ['knowledge_core_docker_primary'],
    idealOrder: ['knowledge_core_docker_primary'],
  },
  shape: {
    bucketExpectations: {
      projectKnowledge: ['knowledge_core_docker_primary'],
      globalConstraints: [],
    },
  },
}
```

- [x] **Step 8.4: Run targeted tests and core retrieval eval**

Run: `rtk pnpm test -- --run packages/server/src/lib/retrieval/recall/semantic.test.ts packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts`
Expected: PASS

Run: `rtk pnpm eval:retrieval:core`
Expected: PASS with `v1-low-maxresults-core` green.

---

### Phase 9: Align eval baseline paths and advanced-runner documentation with actual CI behavior

**Files:**

- Modify: `evals/scripts/eval-ci.ts`
- Modify: `evals/README.md`
- Modify: `evals/retrieval/README.md`
- Modify: `docs/operations/TESTING.md`

**Phase completion criteria:**

- baseline file paths used in docs and code match exactly
- the documented “advanced flag” commands use the direct `eval-all.ts` / runner entrypoints that actually accept extra flags
- `eval:ci` can find a populated baseline in the documented location
- the troubleshooting note explains why smoke/core pass-rate and ranking metrics are different signals

**Documentation updates required:**

- `evals/README.md`: show direct `rtk pnpm exec tsx ... eval-all.ts` examples for `--json`, `--dry-run`, and custom flags
- `evals/retrieval/README.md`: replace `./reports/baseline-v2-*.json` examples with the CI path or document a migration step explicitly
- `docs/operations/TESTING.md`: explain that retrieval case pass/fail is governance/outcome based while ranking metrics still require review or baseline comparison

**Test / eval updates required:**

- add or update an `eval-ci` unit test if needed so baseline lookup uses the documented path
- run `rtk pnpm test -- --run evals/scripts/__tests__/eval-ci.test.ts`
- run `rtk env TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts`

**Necessary example structure or code:**

```ts
const BASELINES_DIR = 'reports/baselines';

function getBaselinePath(tier: 'smoke' | 'core'): string {
  return resolve(process.cwd(), BASELINES_DIR, `baseline-${tier}.json`);
}
```

```bash
rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-all.ts --tier core --json --json-path ./reports/eval-report.json
rtk env TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts
```

- [ ] **Step 9.1: Decide on one baseline location and make docs/tests point to it**

```md
# 写入新基线
rtk env WRITE_BASELINE=true TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts

# 比较现有基线
rtk env TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts
```

- [ ] **Step 9.2: Replace broken “script plus extra args” examples with direct runner invocations**

```md
rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-all.ts --tier smoke --dry-run --allow-empty
rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-all.ts --tier core --json --json-path ./reports/eval-report.json
```

- [ ] **Step 9.3: Add a note explaining pass/fail vs ranking metrics**

```md
- Retrieval case `passed` means outcome/governance assertions held.
- `Hit@1`, `MRR`, and `nDCG` may still regress while the case remains green.
- Use baseline comparison or explicit metric review before treating a green smoke run as ranking-safe.
```

- [ ] **Step 9.4: Run eval-ci verification and close the remediation plan**

Run: `rtk pnpm test -- --run evals/scripts/__tests__/eval-ci.test.ts`  
Expected: PASS

Run: `rtk env TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts`  
Expected: baseline is discovered when present, and no path mismatch remains.

Run: `rtk git status --short`  
Expected: only intended remediation-plan and code/doc/test changes remain.

---

## Self-Review Checklist

- [ ] The v2 label-filter root cause is addressed in both memory and PG recall paths
- [ ] The summary regression is treated as a downstream symptom of unfiltered capsule output, not as an isolated judge issue
- [ ] The v1 low-`maxResults` fix improves ranking deterministically instead of weakening the eval case
- [ ] Smoke-tier coverage is added for every failure that previously required core-tier discovery
- [ ] Baseline path and runner invocation examples are consistent across code and docs
