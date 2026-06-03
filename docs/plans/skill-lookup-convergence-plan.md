# Skill Lookup Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Move `/v1/retrieval/skills/search-by-content` onto the shared capsule recall pipeline so it benefits from the same indexed recall, governance, and observability as v2 capsule retrieval.

**Architecture:** Keep the route contract artifact-first, but stop using a standalone in-memory `rankCapsules()` implementation in `searchSkillsByContent()`. Reuse the existing parsed intent, capsule channel coordinator, merge/rerank logic, and PG-backed keyword/vector channels, then dedupe the resulting capsule candidates to artifact-first results.

**Tech Stack:** TypeScript, Fastify, Vitest, existing retrieval eval/smoke harness.

---

## Scope

- `packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
- `packages/server/src/lib/retrieval/capsules/capsule-recall-coordinator.ts`
- `packages/server/src/lib/retrieval/orchestration/orchestrator.ts` if shared helper extraction is needed
- `packages/server/src/routes/retrieval.ts`
- `packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts`
- `packages/server/src/routes/retrieval.test.ts`
- retrieval eval contracts and runner, if this endpoint is promoted into eval coverage

## Phase 0: Freeze current contract and migration boundary

- [x] Preserve the current HTTP contract for `/v1/retrieval/skills/search-by-content`.
- [x] Decide which parts are shared with v2 and which remain endpoint-specific:
  - shared: intent parsing, capsule recall channels, PG recall, governance filters
  - endpoint-specific: artifact-first dedupe and response shaping

**Completion standard**

- The contract remains artifact-first and metadata-only.
- The migration target is explicit before code extraction starts.

**Document updates**

- [x] Update the root `plan.md` status if this plan starts.

**Test and eval updates**

- [x] Record baseline tests:
  - `rtk pnpm test -- --run packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts packages/server/src/routes/retrieval.test.ts`

**Example structure or code**

```ts
interface ArtifactFirstLookupResult {
  matches: SkillLookupResultItem[];
}
```

## Phase 1: Extract or reuse the shared capsule coordinator path

- [x] Refactor `searchSkillsByContent()` to call the existing shared capsule coordinator instead of direct `rankCapsules()`.
- [x] Reuse the same PG feature flags as v2 where appropriate.

**Completion standard**

- `searchSkillsByContent()` no longer performs its own standalone capsule ranking path.
- PG keyword/vector channels can affect search-by-content results.

**Document updates**

- [x] Update `docs/architecture/components/RETRIEVAL.md` to describe the shared path.

**Test and eval updates**

- [x] Add unit tests proving the coordinator path is used and fallback still works if PG returns empty.

**Example structure or code**

```ts
const recall = await coordinator.execute({
  artifacts: governedArtifacts,
  intent,
  governanceFilters,
  maxResults: parsed.maxResults * 3,
});
```

## Phase 2: Preserve artifact-first dedupe and reason shape

- [x] Keep best-capsule-per-artifact dedupe after shared recall.
- [x] Preserve result fields such as `title`, `slug`, `labels`, `scope`, `requiredLevel`, `sourceKind`, `score`, and `reason`.

**Completion standard**

- Client-visible response shape does not regress.
- Shared recall affects candidate sourcing, not the public contract.

**Document updates**

- [x] Update `docs/reference/api-surface.md` if behavior notes need adjustment.
- [x] Update `docs/architecture/CLI.md` if CLI behavior/perf notes change.

**Test and eval updates**

- [x] Extend `skill-lookup.test.ts` with artifact-dedupe stability cases.
- [x] Extend `retrieval.test.ts` with route-level artifact-first assertions.

**Example structure or code**

```ts
const uniqueCandidates = dedupeByArtifactId(recall.capsuleCandidates);
const limitedCandidates = uniqueCandidates.slice(0, parsed.maxResults);
```

## Phase 3: PG and governance regression coverage

- [x] Add regressions for:
  - PG capsule keyword path
  - PG capsule semantic path
  - lifecycle-regressed artifacts not surfacing
  - team/level governance parity with current behavior

**Completion standard**

- Search-by-content does not reintroduce stale or unauthorized artifact visibility.

**Document updates**

- [x] Update `docs/operations/TESTING.md` with the focused verification commands.

**Test and eval updates**

- [x] Add route and helper tests covering PG flags and governance boundaries.

**Example structure or code**

```ts
expect(result.matches.map((m) => m.artifactId)).not.toContain('artifact_stale_or_forbidden');
```

## Phase 4: Decide eval coverage boundary

- [x] Decide whether to extend retrieval eval contracts to include `/v1/retrieval/skills/search-by-content`.
- [x] If yes, update contracts, runner adapters, normalizers, assertions, and datasets.
- [x] If no, add a dedicated smoke/integration harness and document why the endpoint stays outside retrieval eval.

**Completion standard**

- There is a durable automated regression path for this endpoint, either inside retrieval eval or through a dedicated smoke suite.

**Document updates**

- [x] Update `evals/retrieval/README.md` or `docs/operations/TESTING.md` depending on the chosen path.
- [x] Retrieval eval docs now name the concrete `v1-skill-lookup-positive-smoke` and `v1-skill-lookup-governance-core` cases plus the artifact-first assertion shape.

**Test and eval updates**

- [x] Add the chosen coverage path.
- [x] Retrieval eval contracts/runner/normalizers/assertions/datasets now include `/v1/retrieval/skills/search-by-content`.

**Example structure or code**

```ts
type SupportedEvalEndpoint =
  | '/v1/retrieval/search'
  | '/v2/retrieval/search'
  | '/v3/retrieval/search'
  | '/v1/retrieval/skills/search-by-content';
```

## Phase 5: Verification and closeout

- [x] Run focused tests.
- [x] Run `rtk pnpm typecheck`.
- [x] Update completion notes if executed.

**Completion standard**

- Search-by-content is converged onto shared recall without contract drift.
