# Phase 25: Evaluation Contracts and Golden Dataset Foundation - Research

**Researched:** 2026-04-21
**Domain:** Retrieval evaluation contracts, golden dataset design, and monorepo eval layout
**Confidence:** HIGH

<user_constraints>
## User Constraints

No `CONTEXT.md` exists for this phase. Research scope is constrained by `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, and the live codebase. [VERIFIED: codebase grep]

- Milestone must stay TypeScript-native. [VERIFIED: user prompt; VERIFIED: .planning/PROJECT.md]
- Governance leakage must be scored separately from retrieval relevance. [VERIFIED: user prompt; VERIFIED: .planning/PROJECT.md; VERIFIED: .planning/STATE.md]
- Current endpoints in scope are `POST /v1/retrieval/search` and `POST /v2/retrieval/search`. [VERIFIED: user prompt; VERIFIED: docs/api-surface.md; VERIFIED: packages/server/src/routes/retrieval.ts]
- Phase 25 defines contracts and datasets only, not the full metrics runner from Phase 26. [VERIFIED: user prompt; VERIFIED: .planning/ROADMAP.md]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVAL-01 | Maintainer can run a TypeScript-native retrieval evaluation command against current TrapMap retrieval endpoints from the monorepo. [VERIFIED: .planning/REQUIREMENTS.md] | Root `evals/` workspace, `tsx` entrypoint convention, Vitest-backed validation, and endpoint-scoped case schema define the Phase 26 execution substrate. [VERIFIED: package.json; VERIFIED: vitest.config.ts] |
| REVAL-02 | Retrieval evaluation uses labeled golden datasets that cover smoke and core scenarios for `/v1/retrieval/search` and `/v2/retrieval/search`. [VERIFIED: .planning/REQUIREMENTS.md] | Recommended case model, scenario/case split, and smoke/core dataset matrix cover positive, empty-result, and forbidden-result scenarios for both endpoints. [VERIFIED: .planning/ROADMAP.md; VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/routes/retrieval.test.ts] |
</phase_requirements>

## Summary

Phase 25 should create a repository-root `evals/` workspace for datasets and thin runner entrypoints, but the authoritative eval schemas should live in `packages/contracts` so CLI, server, and future tooling all import one canonical contract surface. The current retrieval APIs already expose two distinct response families: v1 returns `globalConstraints` plus `projectKnowledge`, while v2 returns `capsules`, `profileHints`, and optional activation hints, so the eval model must preserve endpoint specificity instead of forcing an artificial unified payload shape too early. [VERIFIED: .planning/ROADMAP.md; VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

The dataset contract should separate three concerns: deterministic fixture state, endpoint request input, and expected assertions. Governance must be a first-class assertion group, not a side effect of relevance scoring, because existing retrieval behavior already enforces approval state, team boundaries, and security levels independently of ranking. That separation is also required by the v1.4 milestone and current project decisions. [VERIFIED: .planning/PROJECT.md; VERIFIED: .planning/STATE.md; VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/routes/retrieval.test.ts]

Phase 25 should stop at schema, layout, tier definitions, and milestone-owned smoke/core cases. Metric calculators, report serialization, CI wiring, and summary/judge evaluation belong to Phases 26-28 and should not leak into this phase. [VERIFIED: user prompt; VERIFIED: .planning/ROADMAP.md]

**Primary recommendation:** Put `retrievalEvalCaseSchema` and `retrievalEvalScenarioSchema` in `packages/contracts`, store plain-object `.ts` datasets under `evals/retrieval/`, and make every case carry separate `relevance` and `governance` expectations keyed to either `/v1/retrieval/search` or `/v2/retrieval/search`. [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: package.json]

## Project Constraints (from available project instructions)

- Keep the milestone TypeScript-native and inside the existing Node/pnpm monorepo workflow. [VERIFIED: user prompt; VERIFIED: .planning/PROJECT.md]
- Preserve the monorepo separation between contracts, server, and CLI; shared schemas must stay consistent across components. [VERIFIED: AGENTS instructions; VERIFIED: .planning/PROJECT.md]
- Treat `packages/contracts` as canonical for shared runtime validation. [VERIFIED: docs/api-surface.md; VERIFIED: packages/contracts/src/index.ts]
- Keep governance and security semantics explicit; admin/user defaults alone are not sufficient. [VERIFIED: AGENTS instructions; VERIFIED: .planning/PROJECT.md]
- Do not introduce a Python-first evaluator as the primary path. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/PROJECT.md]

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard Here | Source |
|---------|---------|---------|--------------|--------|
| TypeScript | `5.9.3` | Author eval contracts and datasets as typed modules. | The repo is already TS-first, and Phase 25 must remain TypeScript-native. | [VERIFIED: package.json] |
| Zod | `^4.1.12` in `@trapmap/contracts` | Validate eval schemas at load time. | Retrieval contracts already use Zod in `packages/contracts`; eval contracts should extend the same pattern instead of inventing a second schema system. | [VERIFIED: packages/contracts/package.json; VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| Vitest | `3.2.4` | Validate dataset files and schema round-trips. | Existing contract and retrieval tests already run under Vitest across the monorepo. | [VERIFIED: package.json; VERIFIED: pnpm exec vitest --version; VERIFIED: vitest.config.ts] |
| `tsx` | `4.20.3` | Execute future eval entrypoints from the repo root. | Root and package scripts already use `tsx` for TS-native execution without a separate compile step. | [VERIFIED: package.json; VERIFIED: packages/server/package.json] |
| `pnpm` workspaces | `10.33.0` | Host root-level `evals/` scripts without creating a separate runtime stack. | The monorepo already uses root workspaces and cross-package tests from the root config. | [VERIFIED: package.json; VERIFIED: pnpm-workspace.yaml; VERIFIED: pnpm --version] |

### Supporting
| Library / Tool | Version | Purpose | When to Use | Source |
|---------|---------|---------|-------------|--------|
| `@trapmap/contracts` | workspace | Export eval schemas and endpoint-specific helper types. | Use for any shared case/scenario schema consumed outside the `evals/` tree. | [VERIFIED: packages/contracts/src/index.ts] |
| Fastify `app.inject` | current repo server | Future Phase 26 endpoint execution without external network setup. | Use for monorepo-native endpoint evaluation once the runner exists. | [VERIFIED: packages/server/src/routes/retrieval.test.ts; VERIFIED: packages/server/src/app.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff | Source |
|------------|-----------|----------|--------|
| Typed `.ts` dataset modules | JSON / JSONL fixtures | JSON is more data-only, but `.ts` modules fit the TypeScript-native requirement better, allow inline comments, and can be schema-parsed at runtime while staying plain-object only. | [VERIFIED: user prompt; ASSUMED] |
| Contracts in `packages/contracts` | Schemas local to `evals/` | Local schemas reduce package surface area but would split the canonical contract layer away from the rest of the repo. | [VERIFIED: docs/api-surface.md; VERIFIED: packages/contracts/src/index.ts] |
| Root `evals/` workspace | New package under `packages/` | A package is heavier than needed for milestone-owned datasets; roadmap success criteria already call for a dedicated `evals/` structure. | [VERIFIED: .planning/ROADMAP.md] |

**Installation:** No new external package is required for Phase 25 if the work stays on the existing `TypeScript + Zod + Vitest + tsx` stack. [VERIFIED: package.json; VERIFIED: packages/contracts/package.json; VERIFIED: packages/server/package.json]

## Canonical References

Planner and implementers should treat these files as mandatory reading before locking the Phase 25 plan:

| File | Why It Is Canonical | Source |
|------|---------------------|--------|
| `packages/contracts/src/domain/retrieval.ts` | Defines the live request/response contracts for both v1 and v2 retrieval, including buckets, capsules, summaries, and activation hints. | [VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| `packages/server/src/routes/retrieval.ts` | Defines the actual endpoint boundary and route-level permission checks for `/v1/retrieval/search` and `/v2/retrieval/search`. | [VERIFIED: packages/server/src/routes/retrieval.ts] |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Defines current retrieval behavior, filtering order, empty-response behavior, and v2 capsule assembly. | [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| `packages/server/src/lib/retrieval.test.ts` | Best current source for governance filters, bucket shaping, summary behavior, and empty-result semantics. | [VERIFIED: packages/server/src/lib/retrieval.test.ts] |
| `packages/server/src/routes/retrieval.test.ts` | Best current source for route reachability, schema acceptance, and coexistence parity across v1/v2. | [VERIFIED: packages/server/src/routes/retrieval.test.ts] |
| `packages/server/src/lib/retrieval/assembly.test.ts` | Best current source for v2 capsule-first response shaping and metadata-only boundaries. | [VERIFIED: packages/server/src/lib/retrieval/assembly.test.ts] |
| `packages/contracts/src/index.test.ts` | Verifies exported contract behavior and coexistence expectations for retrieval schemas. | [VERIFIED: packages/contracts/src/index.test.ts] |
| `docs/api-surface.md` | Documents the stable user-facing API surface and confirms `/v1/retrieval/search` remains an active contract. | [VERIFIED: docs/api-surface.md] |
| `docs/retrieval-structure-adjustment.md` | Captures the retrieval architecture intent that explains why routing, orchestration, and shaping are separate seams. | [VERIFIED: docs/retrieval-structure-adjustment.md] |

## Architecture Patterns

### Recommended Project Structure
```text
evals/
  README.md
  retrieval/
    README.md
    run.ts
    smoke.ts
    core.ts
    scenarios/
      smoke/
        retrieval-governance-smoke.ts
      core/
        retrieval-ranking-core.ts
    datasets/
      smoke/
        v1-semantic.ts
        v2-capsule.ts
      core/
        v1-hybrid.ts
        v1-graph-assisted.ts
        v2-capsule-governance.ts
    snapshots/
      .gitkeep
packages/
  contracts/
    src/
      domain/
        evals/
          retrieval.ts
      index.ts
```

### Pattern 1: Shared Contract, Root-Owned Data
**What:** Put eval schema definitions in `packages/contracts/src/domain/evals/retrieval.ts` and export them through `packages/contracts/src/index.ts`, while keeping scenarios and datasets under repo-root `evals/retrieval/`. [VERIFIED: packages/contracts/src/index.ts; VERIFIED: .planning/ROADMAP.md]

**When to use:** Use this whenever a dataset or future runner needs to be consumed across packages or by root scripts. [VERIFIED: package.json; VERIFIED: vitest.config.ts]

**Why:** This preserves the repo’s existing “contracts are canonical” rule while keeping milestone data out of publishable package boundaries. [VERIFIED: docs/api-surface.md; VERIFIED: AGENTS instructions]

### Pattern 2: Scenario/Case Split
**What:** Define deterministic scenario fixtures separately from endpoint cases. A scenario owns corpus state and actor context; a case owns endpoint request and expectations. [VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/routes/retrieval.test.ts]

**When to use:** Use this for any governance-sensitive case where the same corpus should be exercised through multiple endpoints or modes. [VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: packages/contracts/src/domain/retrieval.ts]

**Why:** Current tests already show that visibility depends on approval state, active team, and security level, so duplicating all setup inline in every case will drift quickly. [VERIFIED: packages/server/src/lib/retrieval.test.ts]

### Pattern 3: Separate Relevance and Governance Assertions
**What:** Each case should have distinct `relevance` and `governance` expectation groups. [VERIFIED: .planning/PROJECT.md; VERIFIED: .planning/STATE.md]

**When to use:** Use this for every retrieval case, including expected-empty cases. [VERIFIED: .planning/REQUIREMENTS.md]

**Why:** The milestone explicitly requires governance leakage detection apart from retrieval quality, and the current retrieval implementation filters forbidden content before ranking. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

### Recommended Eval Schema
```ts
// Source baseline: packages/contracts/src/domain/retrieval.ts
// Recommended new contract for Phase 25.
export const retrievalEvalScenarioSchema = z.object({
  scenarioId: z.string().min(1),
  description: z.string().min(1),
  actor: z.object({
    subjectType: z.enum(['user', 'system-admin']),
    activeTeamId: z.string().nullable(),
    securityLevel: z.number().int().min(0).max(10),
    permissions: z.array(z.string()).min(1),
  }),
  fixtures: z.object({
    knowledgeEntries: z.array(z.unknown()).default([]),
    skillArtifacts: z.array(z.unknown()).default([]),
  }),
});

export const retrievalEvalCaseSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.string().min(1),
  tier: z.enum(['smoke', 'core']),
  endpoint: z.enum(['/v1/retrieval/search', '/v2/retrieval/search']),
  request: z.object({
    seed: z.string().min(1),
    filters: z.object({
      labels: z.array(z.string()).default([]),
      scopes: z.array(z.enum(['global', 'project'])).default([]),
    }).default({ labels: [], scopes: [] }),
    maxResults: z.number().int().min(1).max(50).optional(),
    mode: z.enum(['semantic', 'hybrid', 'graph-assisted']).optional(),
  }),
  scenarioId: z.string().min(1),
  expected: z.object({
    outcome: z.enum(['non-empty', 'empty']),
    relevance: z.object({
      relevantIds: z.array(z.string()).default([]),
      idealOrder: z.array(z.string()).default([]),
    }),
    governance: z.object({
      forbiddenIds: z.array(z.string()).default([]),
      forbiddenReasons: z.array(z.enum(['cross-team', 'security-level', 'lifecycle'])).default([]),
    }),
    shape: z.object({
      bucketExpectations: z.record(z.enum(['globalConstraints', 'projectKnowledge'])).optional(),
      expectedProfileHintArtifactIds: z.array(z.string()).default([]),
    }).default({ expectedProfileHintArtifactIds: [] }),
  }),
  tags: z.array(z.string()).default([]),
});
```

### Anti-Patterns to Avoid
- **Single `expectedIds` list with no governance split:** This hides forbidden leakage inside ranking results and contradicts the milestone’s explicit scoring boundary. [VERIFIED: .planning/PROJECT.md; VERIFIED: .planning/STATE.md]
- **Datasets that depend on mutable dev data:** Current retrieval tests create their own store state because repo-global data is not a stable truth source. Eval datasets should do the same. [VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts]
- **Forcing v1 and v2 into one normalized response file in Phase 25:** The endpoints have materially different contracts today; normalization belongs in Phase 26 adapters, not in the dataset itself. [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/routes/retrieval.ts]
- **Embedding metrics thresholds into Phase 25 fixtures:** Ranking math and failure policy are Phase 26 and Phase 29 concerns. [VERIFIED: .planning/ROADMAP.md]

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why | Source |
|---------|-------------|-------------|-----|--------|
| Shared eval schema validation | Custom ad hoc JSON validation | `zod` schemas in `packages/contracts` | The repo already standardizes runtime validation through Zod contracts. | [VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| Retrieval truth model | Markdown-only descriptions of expected responses | Existing contract tests plus milestone-owned scenarios/cases | Current route and orchestrator tests already encode the live behaviors that matter. | [VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/routes/retrieval.test.ts] |
| Endpoint adapter semantics | Dataset-specific parsing logic | Phase 26 shared endpoint adapters keyed by endpoint | v1 and v2 responses differ too much to duplicate parsing logic in each dataset. | [VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| Governance evaluation | Relevance metric penalties | Explicit forbidden-hit assertions | Leakage must fail independently of ranking quality. | [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/PROJECT.md] |

**Key insight:** Phase 25 should hand Phase 26 a strict data substrate, not a half-built runner. The costliest mistake here is mixing execution logic into the dataset contract. [VERIFIED: .planning/ROADMAP.md]

## Dataset Strategy

### Smoke Tier
Use smoke to prove that the end-to-end fixture model is wired correctly with the minimum number of cases per endpoint. The smoke tier should stay intentionally small and deterministic. [VERIFIED: .planning/ROADMAP.md]

Recommended minimum smoke matrix:

| Case ID | Endpoint | Scenario Type | Purpose | Source |
|---------|----------|---------------|---------|--------|
| `v1-semantic-positive-smoke` | `/v1/retrieval/search` | positive visible hit | One approved, visible entry must appear in the correct bucket. | [VERIFIED: packages/server/src/lib/retrieval.test.ts] |
| `v1-semantic-empty-smoke` | `/v1/retrieval/search` | empty-result | No visible/relevant entries should return an empty outcome. | [VERIFIED: packages/server/src/lib/retrieval.test.ts] |
| `v1-semantic-forbidden-smoke` | `/v1/retrieval/search` | forbidden-result | Other-team, high-level, or non-approved entries are present in fixture state but must not surface. | [VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/routes/retrieval.test.ts] |
| `v2-capsule-positive-smoke` | `/v2/retrieval/search` | positive visible hit | One eligible capsule must appear with matching profile hints. | [VERIFIED: packages/contracts/src/index.test.ts; VERIFIED: packages/server/src/lib/retrieval/assembly.test.ts] |
| `v2-capsule-empty-smoke` | `/v2/retrieval/search` | empty-result | No eligible artifact/capsule should return empty capsules. | [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts; VERIFIED: packages/contracts/src/index.test.ts] |
| `v2-capsule-forbidden-smoke` | `/v2/retrieval/search` | forbidden-result | Disallowed artifact/capsule state must stay absent even if text matches. | [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts; VERIFIED: packages/contracts/src/index.test.ts] |

### Core Tier
Use core to widen slice coverage while staying milestone-owned and reviewable. Core should expand endpoint coverage, response-shape checks, and ranking-friendly expectations. [VERIFIED: .planning/ROADMAP.md]

Recommended minimum core matrix:

| Case ID | Endpoint | Slice | Purpose | Source |
|---------|----------|-------|---------|--------|
| `v1-semantic-ranked-core` | `/v1/retrieval/search` | `mode=semantic` | Multiple relevant IDs with ideal order for future Hit@K / MRR / nDCG support. | [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval.test.ts] |
| `v1-hybrid-ranked-core` | `/v1/retrieval/search` | `mode=hybrid` | Preserve hybrid-specific coverage before Phase 26 metrics. | [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| `v1-graph-assisted-ranked-core` | `/v1/retrieval/search` | `mode=graph-assisted` | Reserve graph-assisted slice parity for later report breakdowns. | [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| `v1-bucket-shape-core` | `/v1/retrieval/search` | bucket split | Verify `globalConstraints` vs `projectKnowledge` shape expectations. | [VERIFIED: packages/server/src/lib/retrieval.test.ts] |
| `v2-capsule-ranked-core` | `/v2/retrieval/search` | capsule ranking | Multiple relevant capsule IDs with ideal order. | [VERIFIED: packages/contracts/src/index.test.ts; VERIFIED: packages/server/src/lib/retrieval/assembly.test.ts] |
| `v2-profile-hints-core` | `/v2/retrieval/search` | response shape | Assert expected `profileHints` for returned artifact IDs. | [VERIFIED: packages/server/src/lib/retrieval/assembly.test.ts] |
| `v2-governance-core` | `/v2/retrieval/search` | forbidden leakage | Assert that disallowed artifact IDs stay absent while allowed capsules still rank. | [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |

### Planning Locks

The planner should explicitly lock these decisions:

1. Eval dataset files are `.ts` modules exporting plain object literals only, not factory functions. [ASSUMED]
2. Shared eval schemas live in `packages/contracts`, datasets live in repo-root `evals/`. [VERIFIED: .planning/ROADMAP.md; VERIFIED: packages/contracts/src/index.ts]
3. Every case has separate `relevance` and `governance` sections. [VERIFIED: .planning/PROJECT.md; VERIFIED: .planning/STATE.md]
4. Phase 25 datasets target endpoint contracts, not direct internal functions, even if Phase 26 later uses internal adapters to execute them. [VERIFIED: user prompt; VERIFIED: packages/server/src/routes/retrieval.ts]
5. Smoke stays minimal; mode fan-out beyond one v1 happy path belongs in core. [ASSUMED]

## Common Pitfalls

### Pitfall 1: Conflating leakage with bad ranking
**What goes wrong:** A forbidden result is treated as just another false positive and disappears into relevance metrics. [VERIFIED: .planning/REQUIREMENTS.md]
**Why it happens:** Metric-first designs tend to optimize a single ranked list, but this milestone explicitly separates governance correctness from ranking quality. [VERIFIED: .planning/PROJECT.md; VERIFIED: .planning/STATE.md]
**How to avoid:** Put `forbiddenIds` and `forbiddenReasons` in every case contract, including positive cases. [ASSUMED]
**Warning signs:** One failing report says “low precision” instead of clearly naming a cross-team, security-level, or lifecycle leak. [ASSUMED]

### Pitfall 2: Using mutable repository data as the gold set
**What goes wrong:** Eval results drift because fixtures depend on whatever data happens to be in local stores or imported artifacts. [VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts]
**Why it happens:** Retrieval behavior here depends on approval state, team scope, and security level, not just text similarity. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts; VERIFIED: packages/server/src/lib/retrieval.test.ts]
**How to avoid:** Make every scenario own its fixture state and actor context in-repo. [ASSUMED]
**Warning signs:** A case passes on one machine and fails on another without any contract changes. [ASSUMED]

### Pitfall 3: Normalizing v1 and v2 too early
**What goes wrong:** Dataset authors flatten v1 buckets and v2 capsule/profile responses into one generic result list, losing endpoint-specific guarantees. [VERIFIED: packages/contracts/src/domain/retrieval.ts]
**Why it happens:** Both endpoints are “retrieval,” but they do not expose the same response structure. [VERIFIED: packages/server/src/routes/retrieval.ts]
**How to avoid:** Keep endpoint-specific `shape` assertions in the case contract and defer cross-endpoint normalization to Phase 26 adapters. [ASSUMED]
**Warning signs:** A v2 case cannot express `profileHints`, or a v1 case cannot express bucket expectations. [ASSUMED]

### Pitfall 4: Ignoring current route-path instability
**What goes wrong:** The runner is planned assuming both endpoints are already stable under authenticated route execution. [VERIFIED: user prompt]
**Why it happens:** Current targeted verification shows `packages/server/src/lib/retrieval.test.ts`, `packages/server/src/lib/retrieval/assembly.test.ts`, and `packages/contracts/src/index.test.ts` passing, but `packages/server/src/routes/retrieval.test.ts` currently has three failing governance integration tests returning `500`. The v1 route handler also logs `result.items.length`, even though the v1 retrieval response shape has `globalConstraints` and `projectKnowledge`, not `items`. [VERIFIED: pnpm exec vitest run packages/server/src/lib/retrieval.test.ts packages/server/src/lib/retrieval/assembly.test.ts packages/server/src/routes/retrieval.test.ts packages/contracts/src/index.test.ts; VERIFIED: packages/server/src/routes/retrieval.ts]
**How to avoid:** Add a plan note that Phase 26 cannot rely on authenticated route execution until this route-path defect is fixed or explicitly bypassed with an internal adapter. [ASSUMED]
**Warning signs:** `POST /v1/retrieval/search` succeeds in unit/orchestrator tests but fails with `500` under authenticated route integration. [VERIFIED: pnpm exec vitest run packages/server/src/lib/retrieval.test.ts packages/server/src/routes/retrieval.test.ts]

## Code Examples

Verified pattern for keeping cases strict and future-extensible:

```ts
// Source inspiration:
// - packages/contracts/src/domain/retrieval.ts
// - packages/server/src/lib/retrieval.test.ts
// Recommended Phase 25 pattern

export const v1SemanticForbiddenSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-semantic-forbidden-smoke',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  scenarioId: 'governance-mixed-entries',
  request: {
    seed: 'REST API rate limiting',
    mode: 'semantic',
    maxResults: 10,
  },
  expected: {
    outcome: 'empty',
    relevance: {
      relevantIds: [],
      idealOrder: [],
    },
    governance: {
      forbiddenIds: ['knowledge_other_team', 'knowledge_high_level', 'knowledge_pending'],
      forbiddenReasons: ['cross-team', 'security-level', 'lifecycle'],
    },
    shape: {
      bucketExpectations: {},
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['governance', 'v1', 'smoke'],
});
```

## State of the Art

| Old Approach | Current / Recommended Approach | When Changed | Impact | Source |
|--------------|------------------|--------------|--------|--------|
| Route/orchestrator tests as the only retrieval regression substrate | Milestone-owned eval contracts plus explicit smoke/core datasets | v1.4 planning | Gives future runners a stable, reviewable gold set instead of indirect inference from unit tests. | [VERIFIED: .planning/PROJECT.md; VERIFIED: .planning/ROADMAP.md] |
| Single retrieval endpoint with entry buckets only | Coexisting v1 bucketed endpoint plus v2 capsule-first endpoint | v1.2 | Eval contracts must stay endpoint-specific. | [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/routes/retrieval.ts] |
| Implicit governance via filters only | Explicit governance assertions in eval data | v1.4 milestone requirement | Leakage becomes reportable and fail-fast. | [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/PROJECT.md] |

**Deprecated/outdated:**
- Treating existing retrieval tests alone as sufficient milestone evaluation coverage is outdated for v1.4 because the milestone explicitly requires labeled golden datasets and a reusable evaluation command path. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/ROADMAP.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dataset authoring should use `.ts` modules rather than JSON/JSONL. | Standard Stack; Planning Locks | Low-medium: planner may choose JSON fixtures and need a different loader/documentation shape. |
| A2 | Smoke should include one v1 happy path and defer broader v1 mode fan-out to core. | Planning Locks | Low: planner may decide all three v1 modes belong in smoke, increasing initial scope. |
| A3 | Phase 26 may use an internal execution adapter if route-path instability remains. | Common Pitfalls | Medium: if the team insists on endpoint-only execution, the route defect becomes a hard blocker. |

## Open Questions

1. **Should Phase 26 execute eval cases through Fastify `app.inject` or over a spawned HTTP server?**
   What we know: the monorepo already tests endpoints with `app.inject`, which avoids network setup. [VERIFIED: packages/server/src/routes/retrieval.test.ts]
   What's unclear: whether maintainers want the first runner to validate only contract behavior or also network/server bootstrap behavior.
   Recommendation: lock `app.inject` as the default Phase 26 execution path and leave process-spawned HTTP as a later extension. [ASSUMED]

2. **Should Phase 25 include v1 summary-related cases?**
   What we know: summary generation exists for v1 and optional summary fields exist in contracts, but Phase 27 owns summary evaluation as a separate milestone concern. [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: .planning/ROADMAP.md]
   What's unclear: whether planners want minimal summary-shape assertions in retrieval datasets before Phase 27.
   Recommendation: keep Phase 25 focused on retrieval hit/empty/forbidden coverage and reserve grounded summary scoring for Phase 27. [ASSUMED]

3. **Should scenario fixtures model data as full store records or higher-level factory inputs?**
   What we know: current tests use both full store records and helper-created records. [VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts]
   What's unclear: which authoring style the team will find easiest to maintain at scale.
   Recommendation: lock plain fixture objects at the case/scenario boundary, then let Phase 26 adapters transform them into store state. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | TS-native eval entrypoints | ✓ | `v20.19.5` | — |
| `pnpm` | Root scripts / workspace execution | ✓ | `10.33.0` | — |
| Vitest | Dataset/schema validation | ✓ | `3.2.4` | Root `pnpm test` also available |
| `tsx` | Future root eval entrypoints | ✓ via repo deps | `4.20.3` in root devDependencies | `tsc` build + `node` if needed |

**Missing dependencies with no fallback:** None for Phase 25 contract/dataset authoring. [VERIFIED: node --version; VERIFIED: pnpm --version; VERIFIED: pnpm exec vitest --version; VERIFIED: package.json]

**Missing dependencies with fallback:** None identified. [VERIFIED: package.json]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `Vitest 3.2.4` [VERIFIED: pnpm exec vitest --version] |
| Config file | `vitest.config.ts` at repo root, plus package-level configs in `packages/server/vitest.config.ts` and `packages/contracts/vitest.config.ts` [VERIFIED: vitest.config.ts; VERIFIED: packages/server/vitest.config.ts; VERIFIED: packages/contracts/vitest.config.ts] |
| Quick run command | `pnpm exec vitest run packages/contracts/src/index.test.ts packages/server/src/lib/retrieval.test.ts packages/server/src/lib/retrieval/assembly.test.ts` [VERIFIED: command executed in this research session] |
| Full suite command | `pnpm test` [VERIFIED: package.json] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVAL-01 | Eval contracts and entrypoint conventions load in the TS monorepo | schema/load test | `pnpm exec vitest run evals/retrieval/**/*.test.ts` | ❌ Wave 0 |
| REVAL-02 | Smoke/core datasets cover v1 and v2 positive, empty, and forbidden scenarios | dataset contract test | `pnpm exec vitest run evals/retrieval/**/*.test.ts packages/contracts/src/index.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run packages/contracts/src/index.test.ts packages/server/src/lib/retrieval.test.ts packages/server/src/lib/retrieval/assembly.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green plus new eval dataset/schema tests added in Phase 25

### Wave 0 Gaps
- [ ] `packages/contracts/src/domain/evals/retrieval.test.ts` — proves new eval schemas parse strict cases and reject malformed ones.
- [ ] `evals/retrieval/datasets/*.test.ts` or `evals/retrieval/index.test.ts` — proves every shipped smoke/core dataset parses and is uniquely addressable.
- [ ] `evals/retrieval/README.md` — documents runner entrypoint conventions and dataset authoring rules.
- [ ] Route-path defect follow-up: current `packages/server/src/routes/retrieval.test.ts` governance integration cases are red under authenticated v1 route execution. [VERIFIED: pnpm exec vitest run packages/server/src/routes/retrieval.test.ts]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse existing session/auth boundary when future eval runners hit endpoints. [VERIFIED: packages/server/src/routes/retrieval.ts] |
| V3 Session Management | yes | Use test-auth/session fixture setup already exercised by route tests. [VERIFIED: packages/server/src/routes/retrieval.test.ts] |
| V4 Access Control | yes | Keep governance assertions explicit for team, level, and approval state. [VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: .planning/REQUIREMENTS.md] |
| V5 Input Validation | yes | Zod eval schemas in `packages/contracts`. [VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| V6 Cryptography | no | No new cryptographic design is introduced in Phase 25 dataset/schema work. [VERIFIED: user prompt; VERIFIED: .planning/ROADMAP.md] |

### Known Threat Patterns for TrapMap Retrieval Eval

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-team result leakage | Information Disclosure | Explicit `forbiddenIds` / `cross-team` governance assertions. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: packages/server/src/lib/retrieval.test.ts] |
| Security-level leakage | Information Disclosure | Fixture actors with lower levels plus forbidden-hit assertions. [VERIFIED: packages/server/src/lib/retrieval.test.ts] |
| Unapproved content leakage | Information Disclosure | Fixture entries in non-approved states plus lifecycle-forbidden assertions. [VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/routes/retrieval.test.ts] |
| False “empty” due to wrong fixture setup | Integrity | Scenario/case split with explicit actor and corpus ownership. [ASSUMED] |

## Sources

### Primary (HIGH confidence)
- `packages/contracts/src/domain/retrieval.ts` - current v1/v2 retrieval request and response contracts
- `packages/server/src/routes/retrieval.ts` - current endpoint boundaries and permission enforcement
- `packages/server/src/lib/retrieval/orchestrator.ts` - current retrieval behavior, empty-response handling, and v2 assembly flow
- `packages/server/src/lib/retrieval.test.ts` - current governance, bucket, summary, and empty-result behavior
- `packages/server/src/routes/retrieval.test.ts` - route parity and governance integration coverage
- `packages/server/src/lib/retrieval/assembly.test.ts` - v2 metadata-only shaping and profile hint coverage
- `packages/contracts/src/index.test.ts` - retrieval schema export and coexistence coverage
- `docs/api-surface.md` - documented retrieval surface
- `docs/retrieval-structure-adjustment.md` - retrieval architecture intent
- `.planning/ROADMAP.md` - Phase 25-29 scope boundaries
- `.planning/REQUIREMENTS.md` - REVAL requirements
- `.planning/PROJECT.md` and `.planning/STATE.md` - current milestone constraints and decisions
- `package.json`, `packages/server/package.json`, `packages/contracts/package.json`, `vitest.config.ts`, `packages/server/vitest.config.ts`, `packages/contracts/vitest.config.ts` - repo-native tooling and test setup
- Command verification run on 2026-04-21:
  - `node --version`
  - `pnpm --version`
  - `pnpm exec vitest --version`
  - `pnpm exec vitest run packages/server/src/lib/retrieval.test.ts packages/server/src/lib/retrieval/assembly.test.ts packages/server/src/routes/retrieval.test.ts packages/contracts/src/index.test.ts`

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None. All factual claims above are either verified in the codebase/commands or explicitly marked `[ASSUMED]`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - uses repository-local package manifests and executable tool/version checks.
- Architecture: HIGH - based on current retrieval contracts, route boundaries, roadmap scope, and live tests.
- Pitfalls: HIGH - mostly derived from current failing tests and explicit milestone constraints; any recommendations beyond that are tagged `[ASSUMED]`.

**Research date:** 2026-04-21
**Valid until:** 2026-05-21

## RESEARCH COMPLETE
