# Phase 26: Retrieval Metrics Runner and Governance Checks - Research

**Researched:** 2026-04-21  
**Domain:** TypeScript-native retrieval evaluation runner, ranking metrics, and governance assertions  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No `CONTEXT.md` exists for Phase 26, so research scope is constrained by `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `AGENTS.md`, Phase 25 artifacts, and the live codebase. [VERIFIED: gsd init; VERIFIED: .planning/ROADMAP.md; VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/STATE.md; VERIFIED: AGENTS.md]

### Locked Decisions

- Keep the retrieval evaluation flow TypeScript-native inside the existing monorepo workflow. [VERIFIED: .planning/STATE.md; VERIFIED: AGENTS.md]
- Evaluate both `POST /v1/retrieval/search` and `POST /v2/retrieval/search`. [VERIFIED: .planning/ROADMAP.md; VERIFIED: packages/server/src/routes/retrieval.ts]
- Treat governance correctness separately from retrieval relevance. [VERIFIED: .planning/STATE.md; VERIFIED: packages/contracts/src/domain/evals/retrieval.ts]
- Phase 26 must satisfy `REVAL-01`, `REVAL-03`, and `REVAL-04`, and Phase 26 success criteria already require pnpm-invocable execution plus machine-readable and human-readable output. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/ROADMAP.md]

### Claude's Discretion

- Choose the internal runner architecture, execution adapters, scoring helpers, and serialization format without adding a second runtime stack. [VERIFIED: package.json; VERIFIED: vitest.config.ts; VERIFIED: evals/retrieval/run.ts]

### Deferred Ideas (OUT OF SCOPE)

- Summary or judge-driven evaluation remains Phase 27 work. [VERIFIED: .planning/ROADMAP.md]
- CI workflow wiring and broader maintainer automation remain Phase 28 work, even though Phase 26 should introduce the first runnable pnpm scripts. [VERIFIED: .planning/ROADMAP.md]
- Baseline thresholds and regression policy remain Phase 29 work. [VERIFIED: .planning/ROADMAP.md]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVAL-01 | Maintainer can run a TypeScript-native retrieval evaluation command against current TrapMap retrieval endpoints from the monorepo. [VERIFIED: .planning/REQUIREMENTS.md] | Use the existing `evals/retrieval/run.ts` entrypoint, root `pnpm` scripts, and an in-process Fastify `app.inject` execution adapter so maintainers can run endpoint-targeted evals without manual environment setup. [VERIFIED: evals/retrieval/run.ts; VERIFIED: package.json; VERIFIED: packages/server/src/app.ts; CITED: https://fastify.dev/docs/v5.7.x/Guides/Testing/] |
| REVAL-03 | Retrieval evaluation reports ranking metrics including Hit@K, MRR, nDCG, and Recall@K per retrieval mode. [VERIFIED: .planning/REQUIREMENTS.md] | Build pure TypeScript metric calculators over a normalized per-case ranked result record, then aggregate by slice keys `{tier, endpoint, mode}` because the dataset contract already preserves endpoint and mode specificity. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: evals/retrieval/datasets/core/v1-retrieval-core.ts; VERIFIED: evals/retrieval/datasets/core/v2-retrieval-core.ts; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/hit_rate.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/mrr.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/recall.html; CITED: https://sklearn.org/stable/modules/generated/sklearn.metrics.ndcg_score.html] |
| REVAL-04 | Retrieval evaluation detects governance failures including forbidden-result leakage, scope violations, and empty-result expectation mismatches. [VERIFIED: .planning/REQUIREMENTS.md] | Evaluate governance as a hard-fail assertion layer before or alongside metric aggregation by checking forbidden IDs, expected empty/non-empty outcomes, and endpoint-specific shape expectations for buckets or profile hints. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts; VERIFIED: evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts; VERIFIED: packages/server/src/lib/retrieval.test.ts; VERIFIED: packages/server/src/lib/retrieval/assembly.test.ts] |
</phase_requirements>

## Summary

Phase 25 already delivered the hard part of dataset modeling: repo-root eval entrypoints exist, smoke/core cases are authored, endpoint strings are explicit, and every case already separates `relevance`, `governance`, and endpoint-specific `shape` expectations. Phase 26 should therefore focus on execution, normalization, scoring, and reporting rather than changing the case schema again. [VERIFIED: evals/retrieval/run.ts; VERIFIED: evals/retrieval/smoke.ts; VERIFIED: evals/retrieval/core.ts; VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: .planning/phases/25-evaluation-contracts-and-golden-dataset-foundation/VERIFICATION.md]

The strongest execution seam is an in-process Fastify adapter built on `buildServer()` plus `app.inject()`. The current server already exposes both retrieval routes through a single app factory, Fastify officially documents `inject()` as a fake HTTP request path that boots registered plugins, and TrapMap auth resolution accepts a simple `Bearer` session token. That combination gives Phase 26 endpoint-faithful execution without requiring a live daemon, external database, or manual login shell flow. [VERIFIED: packages/server/src/app.ts; VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: packages/server/src/lib/context.ts; VERIFIED: packages/server/src/lib/session.ts; CITED: https://fastify.dev/docs/v5.7.x/Guides/Testing/]

The main planning hazard is v1 route readiness. `packages/server/src/routes/retrieval.ts` currently logs `result.items.length` on the v1 path even though `searchKnowledge()` returns bucketed `globalConstraints` and `projectKnowledge`, and the current repo typecheck surfaces that mismatch directly. Phase 26 should therefore reserve Wave 0 capacity either to fix that bug before route-backed evaluation or to provide a temporary direct-library fallback for v1 while still keeping endpoint-targeted reporting as the long-term contract. [VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts; VERIFIED: pnpm exec tsc -b --pretty false]

**Primary recommendation:** Add three layers under `evals/retrieval`: scenario materialization, endpoint-to-normalized-result adapters, and pure scoring/reporting helpers; run cases through `app.inject()` by default, but explicitly treat the current v1 route mismatch as a Wave 0 blocker or fallback decision. [ASSUMED]

## Project Constraints (from AGENTS.md)

- Preserve monorepo separation between server, CLI, and shared contracts; shared schemas must stay consistent across components. [VERIFIED: AGENTS.md]
- Keep the interface bash-friendly and agent-friendly with predictable stdout and optional JSON mode. [VERIFIED: AGENTS.md]
- Keep search text-only in v1; do not introduce multimodal evaluation scope. [VERIFIED: AGENTS.md]
- Do not introduce a Python-first primary evaluation path. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: AGENTS.md]
- Keep access control explicit; the runner must not blur governance checks into one soft relevance score. [VERIFIED: AGENTS.md; VERIFIED: .planning/STATE.md]
- No project `CLAUDE.md` exists in the repo root, so there are no additional CLAUDE-specific constraints to honor for this phase. [VERIFIED: repo file check]
- Project-local skills exist under `.agents/skills/`, but they affect TrapMap content workflows rather than retrieval-eval runner architecture. [VERIFIED: .agents/skills/skill-shareer-knowledge/SKILL.md; VERIFIED: .agents/skills/trapmap-cli-guide/SKILL.md]

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard Here | Source |
|---------|---------|---------|--------------|--------|
| `@trapmap/contracts` | workspace | Canonical schema source for cases, scenarios, and response parsing. | Phase 25 already established contracts as the shared eval surface, so Phase 26 should consume them rather than define local runtime types again. | [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: packages/contracts/src/index.ts] |
| `tsx` | local `4.21.0`; repo pin `^4.20.3`; upstream latest `4.21.0` on 2026-04-21 | Execute the runner directly from TypeScript. | The existing eval entrypoint is already a `tsx` script, and rerunning it outside the sandbox succeeded unchanged. | [VERIFIED: package.json; VERIFIED: pnpm exec tsx --version; VERIFIED: pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run; VERIFIED: npm registry `npm view tsx version`] |
| Vitest | local `3.2.4`; repo pin `^3.2.4`; upstream latest `4.1.4` on 2026-04-21 | Unit, contract, and adapter tests. | The repo already uses a root projects-based Vitest config, and Vitest documents `projects` as the monorepo-native way to run multiple project configs in one process. | [VERIFIED: vitest.config.ts; VERIFIED: pnpm exec vitest --version; VERIFIED: npm registry `npm view vitest version`; CITED: https://vitest.dev/guide/projects.html] |
| Fastify `app.inject()` | repo dependency `^5.6.1`; upstream latest `5.8.5` on 2026-04-21 | Execute retrieval routes in-process without manual server startup. | The app factory already registers retrieval routes, and Fastify documents `inject()` as a ready-to-test fake HTTP request mechanism. | [VERIFIED: packages/server/package.json; VERIFIED: packages/server/src/app.ts; VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: npm registry `npm view fastify version`; CITED: https://fastify.dev/docs/v5.7.x/Guides/Testing/] |
| Pure TypeScript metric helpers | repo-local | Compute Hit@K, MRR, nDCG, and Recall@K over normalized ranked IDs. | The dataset contract is already binary-relevance oriented, and no retrieval-metrics dependency exists in the repo today. | [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: codebase grep for retrieval metric library absence; ASSUMED] |

### Supporting
| Library / Tool | Version | Purpose | When to Use | Source |
|---------|---------|---------|-------------|--------|
| `buildServer()` + `JsonStore` | repo-local | Hermetic endpoint execution with temporary fixture state. | Use for route-faithful case execution without requiring a persistent external service. | [VERIFIED: packages/server/src/app.ts; VERIFIED: packages/server/src/lib/store.ts; VERIFIED: packages/server/src/routes/retrieval.test.ts] |
| Deterministic fallback embeddings | repo-local | Stable semantic scores when no API key is configured. | Use to keep smoke/core evals reproducible in local and CI-like environments. | [VERIFIED: packages/server/src/lib/embeddings.ts] |
| Existing retrieval datasets | repo-local | Golden cases and slice metadata. | Use as the only case source for Phase 26; do not fork or duplicate them. | [VERIFIED: evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts; VERIFIED: evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts; VERIFIED: evals/retrieval/datasets/core/v1-retrieval-core.ts; VERIFIED: evals/retrieval/datasets/core/v2-retrieval-core.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff | Source |
|------------|-----------|----------|--------|
| Fastify route execution via `app.inject()` | Direct calls to `searchKnowledge()` / `searchKnowledgeV2()` only | Direct calls are simpler but bypass route-level auth/session parsing and would not truly exercise the endpoint contract required by `REVAL-01`. | [VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts; CITED: https://fastify.dev/docs/v5.7.x/Guides/Testing/] |
| Pure TS metric helpers in repo | Add a third-party retrieval metrics dependency | A dependency could shorten implementation, but the repo already has the needed binary labels and Phase 26 explicitly plans shared calculators, so adding a new dependency would expand surface area without solving execution/reporting architecture. | [VERIFIED: .planning/ROADMAP.md; VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; ASSUMED] |
| JSON + text/markdown report files | Console-only output | Console-only output cannot satisfy the machine-readable requirement and is weaker for later baseline capture. | [VERIFIED: .planning/ROADMAP.md; VERIFIED: .planning/REQUIREMENTS.md] |

**Installation:** No new external package is required to satisfy the Phase 26 success criteria if execution, scoring, and reporting stay inside the existing `tsx` + Vitest + Fastify + contracts stack. [VERIFIED: package.json; VERIFIED: packages/server/package.json; VERIFIED: packages/contracts/package.json; ASSUMED]

## Architecture Patterns

### Recommended Project Structure
```text
evals/
└── retrieval/
    ├── run.ts
    ├── smoke.ts
    ├── core.ts
    ├── adapters/
    │   ├── execute-case.ts
    │   ├── route-adapter.ts
    │   ├── v1-response.ts
    │   └── v2-response.ts
    ├── fixtures/
    │   ├── materialize-scenario.ts
    │   └── session.ts
    ├── metrics/
    │   ├── ranking.ts
    │   └── governance.ts
    ├── reporting/
    │   ├── json.ts
    │   ├── text.ts
    │   └── snapshots/
    └── *.test.ts
```

### Pattern 1: Normalize After Execution, Not Before
**What:** Execute a case against its real endpoint family first, then map the raw v1 or v2 response into one normalized runner record such as `{rankedIds, returnedIds, forbiddenHits, bucketMap, profileHintArtifactIds, outcome}`. [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/assembly.ts; VERIFIED: packages/server/src/lib/retrieval/assembly.test.ts]

**When to use:** Use for every case before metric calculation or governance assertion. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts]

**Why:** v1 and v2 have materially different response contracts, but Phase 26 metrics need one scored record shape. The dataset contract intentionally kept endpoint specificity, so normalization belongs in adapters, not datasets. [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: evals/retrieval/README.md]

### Pattern 2: Route-First Execution With Fixture Materialization
**What:** Materialize the scenario into a temporary `JsonStore`, create a session token that matches the scenario actor, build the Fastify app, and call the endpoint with `app.inject({ method: 'POST', url, headers, payload })`. [VERIFIED: packages/server/src/app.ts; VERIFIED: packages/server/src/lib/session.ts; VERIFIED: packages/server/src/lib/context.ts; CITED: https://fastify.dev/docs/v5.7.x/Guides/Testing/]

**When to use:** Use for default execution of both endpoint families. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: packages/server/src/routes/retrieval.ts]

**Why:** This exercises real route parsing, permission enforcement, and response schema validation while staying hermetic. [VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: packages/server/src/lib/session.ts; VERIFIED: packages/server/src/lib/embeddings.ts]

### Pattern 3: Hard Governance Assertions Before Aggregate Reporting
**What:** Evaluate forbidden hits, unexpected empty/non-empty outcomes, and shape mismatches as explicit failures attached to each case and slice, then compute ranking metrics separately. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: evals/retrieval/README.md]

**When to use:** Use for every case, including positive and empty-result cases. [VERIFIED: evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts; VERIFIED: evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts]

**Why:** The milestone already states that governance leakage must be visible separately from retrieval quality, and the dataset contract was built around that split. [VERIFIED: .planning/STATE.md; VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: packages/contracts/src/domain/evals/retrieval.ts]

### Pattern 4: Slice Keys Must Be Explicit and Stable
**What:** Produce aggregates by deterministic slice keys such as `{tier, endpoint, mode}` and optionally case-tag groupings. [VERIFIED: evals/retrieval/run.ts; VERIFIED: evals/retrieval/datasets/core/v1-retrieval-core.ts; VERIFIED: evals/retrieval/datasets/core/v2-retrieval-core.ts]

**When to use:** Use for both JSON serialization and human-readable summaries. [VERIFIED: .planning/ROADMAP.md; VERIFIED: .planning/REQUIREMENTS.md]

**Why:** `REVAL-03` requires per-retrieval-mode reporting, and later baseline phases need stable, regression-friendly keys. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/ROADMAP.md]

### Anti-Patterns to Avoid
- **Scoring raw v1 and v2 responses directly in the reporter:** This duplicates endpoint parsing logic across outputs and guarantees drift. [VERIFIED: packages/contracts/src/domain/retrieval.ts; ASSUMED]
- **Treating forbidden hits as only a metric penalty:** A hit-rate drop is not an adequate leak signal. [VERIFIED: .planning/STATE.md; VERIFIED: packages/contracts/src/domain/evals/retrieval.ts]
- **Depending on repo-global typecheck as the only phase gate:** The current repo-wide `tsc -b` is already red from unrelated issues, so Phase 26 needs targeted tests to stay actionable. [VERIFIED: pnpm exec tsc -b --pretty false]
- **Inventing graded relevance gains now:** The case contract only records `relevantIds` and `idealOrder`, so Phase 26 should implement binary relevance metrics unless the contract is deliberately extended. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; ASSUMED]

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why | Source |
|---------|-------------|-------------|-----|--------|
| Endpoint bootstrapping | A bespoke mini-server or manual shell setup | `buildServer()` + `app.inject()` | The app factory already registers routes and Fastify officially supports in-process HTTP injection. | [VERIFIED: packages/server/src/app.ts; CITED: https://fastify.dev/docs/v5.7.x/Guides/Testing/] |
| Runtime validation | Loose ad hoc parsing in runner code | `retrievalEvalCaseSchema` plus live response schemas | The contracts package already defines both eval schemas and retrieval response schemas. | [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| Session/auth emulation | Fake booleans like `isAdmin` on runner state | Real session records plus `Authorization: Bearer <token>` | The server resolves auth from session tokens, so reproducing that path gives governance-faithful behavior. | [VERIFIED: packages/server/src/lib/context.ts; VERIFIED: packages/server/src/lib/session.ts] |
| Regression output | Ephemeral console logs only | Stable JSON artifact plus human-readable text/markdown | Phase 26 requires both machine-readable and human-readable outputs, and Phase 29 needs baseline-friendly files. | [VERIFIED: .planning/ROADMAP.md; VERIFIED: .planning/REQUIREMENTS.md] |

**Key insight:** The deceptively hard part of Phase 26 is not the math; it is keeping execution endpoint-faithful while still producing one normalized scoring/reporting surface. [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/routes/retrieval.ts; ASSUMED]

## Common Pitfalls

### Pitfall 1: Assuming the v1 route is immediately safe to execute
**What goes wrong:** The runner uses `/v1/retrieval/search` as if it were parity-stable, then hits runtime failures during authenticated execution. [VERIFIED: evals/retrieval/README.md; VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: pnpm exec tsc -b --pretty false]
**Why it happens:** The v1 route currently references `result.items.length`, but the bucketed v1 retrieval result does not expose `items`. [VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
**How to avoid:** Put a preflight execution test for v1 in Wave 0 and either fix the route or activate a documented fallback adapter before building broader scoring/reporting. [ASSUMED]
**Warning signs:** Authenticated v1 eval calls fail before scoring, while v2 still returns results. [ASSUMED]

### Pitfall 2: Letting empty-target behavior drift silently
**What goes wrong:** Hit@K, Recall@K, MRR, or nDCG behave inconsistently on cases with no relevant IDs or intentionally empty outcomes. [VERIFIED: evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts; VERIFIED: evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/hit_rate.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/mrr.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/recall.html]
**Why it happens:** Common retrieval metric definitions expose policy choices for empty targets such as `neg`, `skip`, `pos`, or `error`. [CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/hit_rate.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/mrr.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/recall.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/normalized_dcg.html]
**How to avoid:** Lock one explicit empty-target policy in code and serialize it into the JSON report metadata. [ASSUMED]
**Warning signs:** Two slices with the same returned IDs produce different aggregates because one evaluator skipped empty-target cases and another counted them as zero. [ASSUMED]

### Pitfall 3: Comparing endpoint families without normalization
**What goes wrong:** Report code compares `entryId` from v1 buckets directly against `capsuleId` from v2 responses without a shared execution record. [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/assembly.ts]
**Why it happens:** v1 returns bucketed knowledge matches, while v2 returns capsule matches and profile hints. [VERIFIED: packages/contracts/src/domain/retrieval.ts]
**How to avoid:** Normalize every response into ranked returned IDs plus endpoint-specific auxiliary fields before any scoring or reporting. [ASSUMED]
**Warning signs:** Human-readable output needs endpoint-specific `if` branches in multiple places instead of one adapter boundary. [ASSUMED]

### Pitfall 4: Hiding governance failures inside “overall quality”
**What goes wrong:** A case leaks forbidden content but still looks acceptable because ranking metrics remain high on the allowed portion. [VERIFIED: .planning/STATE.md; VERIFIED: packages/contracts/src/domain/evals/retrieval.ts]
**Why it happens:** Relevance and governance are related but not equivalent signals. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts]
**How to avoid:** Serialize governance failures as first-class case outcomes and slice summaries, and mark them as hard failures regardless of metric values. [ASSUMED]
**Warning signs:** Reports show strong MRR but do not name forbidden IDs or scope mismatches. [ASSUMED]

## Code Examples

Verified patterns from official sources and the live codebase:

### Endpoint-Faithful Case Execution
```ts
// Source baseline: packages/server/src/app.ts, packages/server/src/lib/session.ts,
// packages/server/src/lib/context.ts, Fastify testing guide.
const app = buildServer({ config: { dataFile: tempDataFile } });
await app.ready();

const token = await seedScenarioSession(app.skillShareer.store, scenario.actor);

const response = await app.inject({
  method: 'POST',
  url: testCase.endpoint,
  headers: {
    authorization: `Bearer ${token}`,
  },
  payload: testCase.request,
});
```
[VERIFIED: packages/server/src/app.ts; VERIFIED: packages/server/src/lib/session.ts; VERIFIED: packages/server/src/lib/context.ts; CITED: https://fastify.dev/docs/v5.7.x/Guides/Testing/]

### Binary Relevance Metric Surface
```ts
// Source baseline: packages/contracts/src/domain/evals/retrieval.ts
type RankedRun = {
  returnedIds: string[];
  relevantIds: string[];
};

function hitAtK(run: RankedRun, k: number): number {
  const topK = new Set(run.returnedIds.slice(0, k));
  return run.relevantIds.some((id) => topK.has(id)) ? 1 : 0;
}
```
[VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; ASSUMED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact | Source |
|--------------|------------------|--------------|--------|--------|
| Dry-run loader only | Executable route-backed retrieval runner with scoring and reports | Phase 26 scope | Converts Phase 25 scaffolding into a usable maintainer workflow. | [VERIFIED: evals/retrieval/run.ts; VERIFIED: .planning/ROADMAP.md] |
| Ad hoc qualitative spot-checking | Per-slice metric summaries plus explicit governance failures | Phase 26 scope | Makes retrieval changes reviewable and later baseline-friendly. | [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/ROADMAP.md] |
| Endpoint-specific raw outputs only | Endpoint adapters feeding one normalized scoring record | Phase 26 recommendation | Keeps v1/v2 contract differences isolated while enabling shared math/reporting. | [VERIFIED: packages/contracts/src/domain/retrieval.ts; ASSUMED] |

**Deprecated/outdated:**
- Treating `evals/retrieval/run.ts` as a loader-only dry-run tool is outdated once Phase 26 starts, because the roadmap explicitly assigns real execution, metrics, and governance checks to this phase. [VERIFIED: evals/retrieval/run.ts; VERIFIED: .planning/ROADMAP.md]
- Depending on repo-wide typecheck as the primary execution gate is currently impractical because unrelated compile failures already exist outside the eval runner slice. [VERIFIED: pnpm exec tsc -b --pretty false]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 26 should implement binary-relevance nDCG rather than graded-gain nDCG because the current contract only exposes `relevantIds` and `idealOrder`. [ASSUMED] | Standard Stack; Common Pitfalls | Metric numbers could diverge from future graded datasets if the contract expands mid-phase. |
| A2 | A temporary direct-library fallback for v1 is acceptable if the route bug is not fixed in Wave 0, as long as endpoint-targeted reporting remains the long-term default. [ASSUMED] | Summary; Open Questions | The planner might choose a fallback that underdelivers `REVAL-01` if the team considers route execution mandatory from day one. |
| A3 | A human-readable markdown or plain-text report is sufficient for Phase 26 because the success criteria require readability but do not mandate a specific format. [ASSUMED] | Architecture Patterns; Open Questions | Phase 28 or Phase 29 might need a different artifact format, causing small report-layer rework. |

## Open Questions

1. **Should Phase 26 fix the current v1 route bug inside this phase or rely on a documented fallback first?**
   - What we know: the v1 route currently references `result.items.length`, while the orchestrator returns bucketed arrays, and repo-wide typecheck catches that mismatch. [VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts; VERIFIED: pnpm exec tsc -b --pretty false]
   - What's unclear: whether the planner should treat the fix as part of `26-01` or as a prerequisite outside the main runner task list. [ASSUMED]
   - Recommendation: treat it as a Wave 0 blocker inside `26-01` unless the user explicitly accepts a temporary direct-library fallback for v1. [ASSUMED]

2. **Where should Phase 26 write its report artifacts so later phases can baseline them cleanly?**
   - What we know: the roadmap requires machine-readable and human-readable outputs in Phase 26, but it does not pin the artifact path or naming convention. [VERIFIED: .planning/ROADMAP.md; VERIFIED: .planning/REQUIREMENTS.md]
   - What's unclear: whether reports should live under `evals/retrieval/reports/`, `.planning/phases/26-.../`, or another stable artifact directory. [ASSUMED]
   - Recommendation: use `evals/retrieval/reports/` for runner-owned artifacts and keep milestone summaries in `.planning/`. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runner execution | ✓ | `v20.19.5` | — |
| `pnpm` | Workspace scripts | ✓ | `10.33.0` | — |
| `tsx` | TypeScript runner entrypoint | ✓ | `4.21.0` | `node --import tsx` was not needed in this session. [ASSUMED] |
| Vitest | Runner/unit validation | ✓ | `3.2.4` local | — |
| Fastify app factory | In-process endpoint execution | ✓ | repo dependency present | Direct-library fallback only if route execution is blocked. [ASSUMED] |
| External embedding API key | Semantic recall determinism | Optional | — | Repo already falls back to deterministic local embeddings when no key is configured. |

- `tsx` succeeded outside the sandbox after an initial sandbox-only `EPERM` on its IPC pipe, so the command itself is usable even though sandboxed probing was misleading. [VERIFIED: pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run]
- The existing smoke dry-run loader works and loads 6 cases successfully. [VERIFIED: pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run]
- The current dataset regression suite passes. [VERIFIED: pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts]
- Repo-wide typecheck is currently failing for many unrelated files, so Phase 26 should use targeted tests as its validation gate instead of depending on a globally green `pnpm typecheck`. [VERIFIED: pnpm exec tsc -b --pretty false]

**Missing dependencies with no fallback:**
- None for basic Phase 26 implementation if the runner stays in-process and uses deterministic fallback embeddings. [VERIFIED: packages/server/src/lib/embeddings.ts]

**Missing dependencies with fallback:**
- No external embedding provider is required because the server already provides deterministic fallback embeddings. [VERIFIED: packages/server/src/lib/embeddings.ts]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `Vitest 3.2.4` local, root projects config; upstream latest `4.1.4` verified on 2026-04-21. [VERIFIED: pnpm exec vitest --version; VERIFIED: vitest.config.ts; VERIFIED: npm registry `npm view vitest version`; CITED: https://vitest.dev/guide/projects.html] |
| Config file | `vitest.config.ts` [VERIFIED: vitest.config.ts] |
| Quick run command | `pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts` [VERIFIED: command execution] |
| Full suite command | `pnpm test` for tests; `pnpm typecheck` exists but is currently red for unrelated repo issues. [VERIFIED: package.json; VERIFIED: pnpm exec tsc -b --pretty false] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVAL-01 | Runner executes smoke/core cases against current endpoints from pnpm scripts. [VERIFIED: .planning/REQUIREMENTS.md] | integration | `pnpm exec tsx evals/retrieval/run.ts --tier smoke --format json` [ASSUMED] | ❌ Wave 0 |
| REVAL-03 | Metrics calculators produce Hit@K, MRR, nDCG, and Recall@K per slice. [VERIFIED: .planning/REQUIREMENTS.md] | unit | `pnpm exec vitest run evals/retrieval/metrics.test.ts` [ASSUMED] | ❌ Wave 0 |
| REVAL-04 | Governance failures surface forbidden hits, scope mismatches, and empty/non-empty mismatches clearly. [VERIFIED: .planning/REQUIREMENTS.md] | integration | `pnpm exec vitest run evals/retrieval/governance.test.ts` [ASSUMED] | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts` plus any new runner-targeted test files. [VERIFIED: vitest.config.ts; ASSUMED]
- **Per wave merge:** targeted eval runner test suite plus one smoke dry-run or real smoke execution command. [ASSUMED]
- **Phase gate:** targeted runner tests and at least one real smoke execution through the final CLI/script path. [ASSUMED]

### Wave 0 Gaps
- [ ] `evals/retrieval/metrics.test.ts` — covers REVAL-03. [ASSUMED]
- [ ] `evals/retrieval/governance.test.ts` — covers REVAL-04. [ASSUMED]
- [ ] `evals/retrieval/run.test.ts` or equivalent integration test — covers REVAL-01 and CLI/reporting behavior. [ASSUMED]
- [ ] Root `package.json` eval scripts — required for the “run from pnpm scripts” success criterion. [VERIFIED: package.json; VERIFIED: .planning/ROADMAP.md]
- [ ] v1 route preflight or fix — required if route-backed execution is the default path. [VERIFIED: packages/server/src/routes/retrieval.ts; VERIFIED: pnpm exec tsc -b --pretty false]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | The runner is not introducing new auth mechanisms; it reuses existing session token handling when testing routes. [VERIFIED: packages/server/src/lib/session.ts] |
| V3 Session Management | no | Session semantics are existing server behavior, not new Phase 26 functionality, though route adapters must seed valid sessions correctly. [VERIFIED: packages/server/src/lib/session.ts; ASSUMED] |
| V4 Access Control | yes | Execute cases through real auth contexts and assert forbidden IDs, scope boundaries, and empty-result expectations as hard failures. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: packages/server/src/lib/retrieval.test.ts] |
| V5 Input Validation | yes | Parse cases and responses through shared Zod schemas in `@trapmap/contracts`. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| V6 Cryptography | no | Phase 26 does not add crypto; it only consumes existing session token and embedding infrastructure. [VERIFIED: packages/server/src/lib/session.ts; VERIFIED: packages/server/src/lib/embeddings.ts] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forbidden result leakage appears in ranked output | Information Disclosure | Hard governance assertions on `forbiddenIds` plus route-faithful auth/session execution. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: packages/server/src/lib/session.ts] |
| Fixture materialization grants broader access than the scenario actor should have | Elevation of Privilege | Materialize sessions from the scenario’s explicit actor fields instead of ad hoc booleans. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: packages/server/src/lib/session.ts] |
| Empty-result cases are falsely treated as successes because metrics skip them | Repudiation | Serialize explicit case outcomes and empty-target policy metadata in machine-readable reports. [CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/hit_rate.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/mrr.html; CITED: https://lightning.ai/docs/torchmetrics/stable/retrieval/recall.html; ASSUMED] |
| Endpoint-specific parsing drift changes slice results silently | Tampering | Keep endpoint normalization in one adapter boundary and parse raw responses with shared contracts before scoring. [VERIFIED: packages/contracts/src/domain/retrieval.ts; VERIFIED: packages/contracts/src/domain/evals/retrieval.ts] |

## Sources

### Primary (HIGH confidence)
- `packages/contracts/src/domain/evals/retrieval.ts` - eval case/scenario schema, relevance/governance split, endpoint literals.
- `packages/contracts/src/domain/retrieval.ts` - live v1/v2 request and response families.
- `evals/retrieval/run.ts` - current runner dry-run behavior and Phase 26 TODO boundary.
- `evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts` - empty/positive/forbidden v1 cases.
- `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts` - empty/positive/forbidden v2 cases.
- `evals/retrieval/datasets/core/v1-retrieval-core.ts` - v1 semantic/hybrid/graph-assisted slice coverage.
- `evals/retrieval/datasets/core/v2-retrieval-core.ts` - v2 capsule/profile/governance slice coverage.
- `packages/server/src/app.ts` - shared Fastify app factory seam.
- `packages/server/src/routes/retrieval.ts` - live route boundaries and current v1 log mismatch.
- `packages/server/src/lib/session.ts` and `packages/server/src/lib/context.ts` - auth/session resolution path.
- `packages/server/src/lib/embeddings.ts` - deterministic fallback embeddings behavior.
- `packages/server/src/lib/retrieval/orchestrator.ts` - v1/v2 execution internals and response assembly expectations.
- `packages/server/src/lib/retrieval.test.ts` - governance filtering semantics for v1.
- `packages/server/src/lib/retrieval/assembly.test.ts` - v2 capsule/profile-hint shaping semantics.
- `packages/server/src/routes/retrieval.test.ts` - route parity and governance-related route coverage.
- `.planning/phases/25-evaluation-contracts-and-golden-dataset-foundation/VERIFICATION.md` - confirmed Phase 25 delivery state.
- `.planning/ROADMAP.md` - Phase 26 scope, success criteria, and adjacent phase boundaries.
- `.planning/REQUIREMENTS.md` - REVAL-01/03/04 requirement wording.
- `.planning/STATE.md` - milestone decisions about TS-native flow and governance separation.
- `AGENTS.md` - project constraints and workflow rules.

### Secondary (MEDIUM confidence)
- Fastify Testing Guide - `inject()` behavior and route-faithful in-process execution: https://fastify.dev/docs/v5.7.x/Guides/Testing/
- Vitest Test Projects Guide - monorepo `projects` configuration: https://vitest.dev/guide/projects.html
- TorchMetrics Retrieval Hit Rate: https://lightning.ai/docs/torchmetrics/stable/retrieval/hit_rate.html
- TorchMetrics Retrieval MRR: https://lightning.ai/docs/torchmetrics/stable/retrieval/mrr.html
- TorchMetrics Retrieval Recall: https://lightning.ai/docs/torchmetrics/stable/retrieval/recall.html
- scikit-learn `ndcg_score`: https://sklearn.org/stable/modules/generated/sklearn.metrics.ndcg_score.html
- npm registry version checks run on 2026-04-21 for `fastify`, `tsx`, `vitest`, `zod`, `pino`, and `typescript`. [VERIFIED: npm view fastify version; VERIFIED: npm view tsx version; VERIFIED: npm view vitest version; VERIFIED: npm view zod version; VERIFIED: npm view pino version; VERIFIED: npm view typescript version]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - almost all stack claims are verified directly from the repo and npm registry; only the “no new dependency needed” recommendation remains assumed. [VERIFIED: package.json; VERIFIED: packages/server/package.json; VERIFIED: npm registry]
- Architecture: HIGH - the recommended adapter shape is a direct consequence of the current eval contracts, app factory, auth/session path, and endpoint split; the only uncertainty is the fallback policy for the current v1 route bug. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: packages/server/src/app.ts; VERIFIED: packages/server/src/routes/retrieval.ts; ASSUMED]
- Pitfalls: HIGH - the empty-target policy, endpoint normalization risk, and governance split are grounded in current datasets, contracts, and upstream metric docs; the warning-sign wording is assumed but low-risk. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts; VERIFIED: evals/retrieval/datasets/*; CITED: metric docs]

**Research date:** 2026-04-21  
**Valid until:** 2026-05-21 for repo-local structure; 2026-04-28 for upstream package-version checks and doc references. [ASSUMED]
