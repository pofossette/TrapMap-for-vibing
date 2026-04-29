# Phase 38: GraphRAG-lite Routing Fallback and Evaluation Coverage - Research

**Researched:** 2026-04-25
**Domain:** Retrieval routing, GraphRAG-lite confidence gating, fallback orchestration, trace/eval integration
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

## Implementation Decisions

### Working assumptions

- GraphRAG-lite should be introduced as an additive route, not a replacement for current v1/v2 retrieval.
- GraSP explicitly uses confidence-based routing, so fallback is a feature, not a failure mode to hide.
- Governance filtering must still happen before route selection and before any fallback result is returned.
- Evaluation must explicitly check for unauthorized leakage, missing blockers, and over-sized skill plans.

### Target direction

- Add a route family or mode that can select GraphRAG-lite, then fall back to capsule-native or graph-assisted retrieval when the compiler lacks confidence.
- Record routing reasons such as low confidence, insufficient trap evidence, or missing skill evidence.
- Reuse the existing retrieval logging and evaluation stack rather than creating a second reporting path.
- Prefer deterministic confidence heuristics first so regression tests stay stable.

### Paper-grounded constraints

- GraSP uses calibrated retrieval confidence to decide whether structured execution should be trusted at all. Phase 38 should preserve that core idea even if TrapMap uses simpler deterministic features instead of the paper’s full confidence model.
- GraSP reports a no-regression posture by falling back to reactive control when confidence is low. For TrapMap, the analogous no-regression property is fallback to existing v2 capsule retrieval or v1 graph-assisted retrieval.
- GraSP increases repair budgets in the mid-confidence band. TrapMap can adapt that idea by widening evidence collection or relaxing plan compression before fully abandoning the graph-plan path.
- Evaluation should reflect the paper’s thesis that orchestration beats volume: tests should penalize oversized plans and confirm that a smaller focused plan still covers the key blockers.

### Library posture

- No major new library should be introduced purely for routing and eval wiring.
- The graph dependencies are already fixed by earlier phases and should be reused rather than expanded here:
  - `graphology`
  - `graphology-dag`
  - `graphology-operators`
  - `graphology-shortest-path`
- Continue to reuse the existing eval harness, retrieval logging, and contract tests.
- If confidence calibration later becomes statistically complex, consider a small focused math/statistics utility only when the benefit is clear; do not preemptively add one in this phase.

### Claude's Discretion

## Specific Ideas

- Add route reasons such as:
  - `graph-plan-selected`
  - `graph-plan-low-confidence-fallback-v2`
  - `graph-plan-insufficient-skill-evidence`
- Add eval assertions for:
  - trap-first ordering
  - default max focused skill count
  - correct fallback destination
  - governance-safe result filtering
- Keep routing trace visible in logs so regressions can be diagnosed from artifacts instead of re-running requests manually.

### Deferred Ideas (OUT OF SCOPE)

## Deferred Ideas

- Model-based confidence estimation
- Community-level graph query families
- Advanced online experimentation and canary rollout tooling
- Expensive global graph summaries
</user_constraints>

## Summary

Phase 37 already shipped a direct `POST /v3/retrieval/plan` endpoint backed by `compileTrapFirstPlan()`, but that plan path is still isolated from the shared retrieval router, from the documented route list, and from the retrieval-eval endpoint contracts that only understand `/v1/retrieval/search` and `/v2/retrieval/search`. [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] [VERIFIED: packages/server/src/app.ts] [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts]

The safest Phase 38 implementation is to keep the Phase 37 direct compiler surface intact as a deterministic primitive and add a new routed GraphRAG-lite resolver above it. That resolver should score the compiled plan with deterministic heuristics, optionally retry once in a bounded mid-confidence band, and then fall back to governed capsule-native or graph-assisted retrieval while emitting one canonical routing trace and one top-level RAG log entry. [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] [VERIFIED: packages/server/src/lib/rag-log.ts]

The evaluation harness needs real structural work before GraphRAG-lite coverage is trustworthy: eval endpoint enums are v1/v2-only, route adapters seed only `knowledgeEntries` and `skillArtifacts`, and the report builder already fails when `routingReason` is missing because it emits a synthetic `none` value that the schema rejects. The live TrapMap knowledge-retrieval gate is also blocked in this workspace: `pnpm exec tsx packages/cli/src/index.ts session --json` returns HTTP 404, and `--help`/`api:list` show that `search` and `skill search-by-content` are not exposed for the current authenticated CLI surface, so the absence of live retrieval results must not be treated as evidence that no relevant traps or skills exist. [VERIFIED: evals/retrieval/lib/adapters.ts] [VERIFIED: evals/retrieval/lib/report.ts] [VERIFIED: evals/retrieval/lib/report.test.ts] [VERIFIED: local CLI run 2026-04-25] [VERIFIED: packages/cli/src/index.ts]

**Primary recommendation:** Preserve `compileTrapFirstPlan()` and `/v3/retrieval/plan` as the direct compiler primitive, then add a separate routed GraphRAG-lite retrieval surface that owns confidence scoring, fallback selection, trace emission, and eval coverage. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] [VERIFIED: packages/server/src/routes/retrieval.ts]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard | Evidence |
|---------|---------|---------|--------------|----------|
| `graphology` | repo `^0.26.0`, registry `0.26.0` (modified 2025-01-26) | Query-time graph assembly and node/edge inspection | The current compiler and graph helpers already build bounded local views on top of `graphology`; Phase 38 should reuse that instead of swapping graph runtime. | [VERIFIED: packages/server/package.json] [VERIFIED: npm registry graphology] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| `Fastify` | repo `^5.6.1`, registry `5.8.5` (modified 2026-04-14) | Thin HTTP route layer | Retrieval routes already follow a thin parse-auth-delegate pattern in Fastify, so the new routed GraphRAG-lite surface should follow the same server boundary. | [VERIFIED: packages/server/package.json] [VERIFIED: npm registry fastify] [VERIFIED: packages/server/src/routes/retrieval.ts] |
| `Zod` | server repo `^4.3.6`, contracts repo `^4.1.12`, registry `4.3.6` (modified 2026-01-25) | Shared route, trace, eval, and response contracts | Phase 38 needs contract changes across retrieval, plans, and eval reporting; Zod is already the repo’s canonical schema layer. | [VERIFIED: packages/server/package.json] [VERIFIED: packages/contracts/package.json] [VERIFIED: npm registry zod] [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/contracts/src/domain/plans.ts] |

### Supporting

| Library | Version | Purpose | When to Use | Evidence |
|---------|---------|---------|-------------|----------|
| `graphology-dag` | repo `^0.4.1`, registry `0.4.1` (modified 2023-12-09) | Hard-edge cycle validation | Reuse if Phase 38 wants confidence features based on hard-dependency integrity or to reject impossible plans before selection. | [VERIFIED: packages/server/package.json] [VERIFIED: npm registry graphology-dag] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| `graphology-operators` | repo `^1.6.1`, registry `1.6.1` (modified 2024-12-17) | Focused subgraph extraction | Keep using the existing bounded local expansion pattern instead of inventing ad hoc graph slicing. | [VERIFIED: packages/server/package.json] [VERIFIED: npm registry graphology-operators] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| `graphology-shortest-path` | repo `^2.1.0`, registry `2.1.0` (modified 2024-03-27) | Deterministic hop-bounded reachability | Use for any mid-confidence retry that widens graph depth deterministically rather than statistically. | [VERIFIED: packages/server/package.json] [VERIFIED: npm registry graphology-shortest-path] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| `Vitest` | repo `^3.2.4`, registry `4.1.5` (modified 2026-04-23) | Server, contracts, CLI, and eval tests | Keep all Phase 38 verification inside the current Vitest + `tsx` harness rather than adding a second test runner. | [VERIFIED: package.json] [VERIFIED: npm registry vitest] [VERIFIED: vitest.config.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Evidence |
|------------|-----------|----------|----------|
| A separate routing framework | Existing retrieval router plus one new `plan-routing` server module | Lower churn, better alignment with current thin-route pattern, and no extra dependency just for fallback selection. | [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/routes/retrieval.ts] |
| A new benchmark harness | Existing `evals/retrieval` runner | The current eval stack already owns route execution, normalization, governance verdicts, and reporting; Phase 38 mainly needs endpoint/schema/fixture expansion. | [VERIFIED: evals/retrieval/run.ts] [VERIFIED: evals/retrieval/lib/adapters.ts] [VERIFIED: evals/retrieval/lib/report.ts] |
| Statistical confidence calibration now | Deterministic feature scoring now, calibration later | CONTEXT explicitly prefers deterministic heuristics first for regression stability; postpone probabilistic calibration until the routed path is stable. | [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md] |

**Installation:**
```bash
# No new packages are required for Phase 38.
pnpm install
```

**Version verification:** Repo-local package pins were checked against the npm registry on 2026-04-25; no new package adoption is justified for this phase. [VERIFIED: packages/server/package.json] [VERIFIED: package.json] [VERIFIED: npm registry graphology] [VERIFIED: npm registry fastify] [VERIFIED: npm registry zod] [VERIFIED: npm registry vitest]

## Architecture Patterns

### Recommended Project Structure

```text
packages/contracts/src/domain/
├── retrieval.ts        # routeFamily/routingReason/routingTrace contract changes
├── plans.ts            # direct plan schema plus routed GraphRAG-lite envelope/confidence schema
└── evals/
    ├── retrieval.ts    # endpoint enum + request/shape extensions for plan coverage
    └── report.ts       # routeFamily/routingReason/report slices

packages/server/src/lib/
├── rag-log.ts          # top-level retrieval log metadata shape
└── retrieval/
    ├── orchestrator.ts # existing v1/v2 execution helpers and logging patterns
    ├── plan-compiler.ts
    ├── plan-routing.ts # NEW: confidence scoring + fallback execution + trace assembly
    └── types.ts        # RoutingDecision / route family additions

packages/server/src/routes/
└── retrieval.ts        # new routed GraphRAG-lite endpoint, keep direct /v3/retrieval/plan

evals/retrieval/
├── lib/
│   ├── adapters.ts     # seed graph fixtures + read routed trace
│   ├── normalize.ts    # normalize plan and fallback responses
│   ├── governance.ts   # plan/fallback shape assertions
│   ├── load.ts         # third endpoint support
│   ├── report.ts       # stable routeFamily / routingReason aggregation
│   └── format.ts
├── datasets/
└── scenarios/          # add graphIndexDocuments to scenario fixture state
```

### Concrete File Targets

| Surface | File Target | Why Phase 38 Should Touch It | Evidence |
|---------|-------------|------------------------------|----------|
| Routing enums and trace schema | `packages/contracts/src/domain/retrieval.ts` | `routeFamilySchema` is currently only `entry | capsule`, and `routingReasonSchema` has no GraphRAG-lite-specific reasons. | [VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| Direct plan contract | `packages/contracts/src/domain/plans.ts` | The current plan schema has no confidence/fallback envelope; a routed surface needs either a discriminated union or a sibling response schema. | [VERIFIED: packages/contracts/src/domain/plans.ts] |
| Server-local routing decision model | `packages/server/src/lib/retrieval/types.ts` | `RoutingDecision` currently cannot represent a plan route family or richer fallback metadata. | [VERIFIED: packages/server/src/lib/retrieval/types.ts] |
| Existing router behavior | `packages/server/src/lib/retrieval/orchestrator.ts` | v1/v2 already own deterministic routing, channel inference, and top-level RAG logging patterns that the new plan resolver should mirror instead of bypassing. | [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| Plan feature source | `packages/server/src/lib/retrieval/plan-compiler.ts` | Confidence heuristics should be computed from real plan outputs and graph evidence counts, which currently live here. | [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] |
| RAG log contract | `packages/server/src/lib/rag-log.ts` | Current log `mode` values do not include a plan route, and metadata typing lags behind the routing trace actually being passed from the orchestrator. | [VERIFIED: packages/server/src/lib/rag-log.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| HTTP route registration | `packages/server/src/routes/retrieval.ts` | The direct `/v3/retrieval/plan` route exists, but there is no routed GraphRAG-lite surface and no v3 route tests yet. | [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/server/src/routes/retrieval.test.ts] |
| API surface docs | `packages/server/src/app.ts`, `docs/api-surface.md` | Documented routes still omit the Phase 37 plan path, so any Phase 38 route addition must update both runtime route inventory and docs. | [VERIFIED: packages/server/src/app.ts] [VERIFIED: docs/api-surface.md] |
| Eval endpoint contracts | `packages/contracts/src/domain/evals/retrieval.ts`, `packages/contracts/src/domain/evals/report.ts` | Retrieval eval endpoint enums and report schemas are v1/v2-only today. | [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts] [VERIFIED: packages/contracts/src/domain/evals/report.ts] |
| Eval execution + normalization | `evals/retrieval/lib/adapters.ts`, `evals/retrieval/lib/normalize.ts`, `evals/retrieval/lib/governance.ts`, `evals/retrieval/lib/assertions.ts` | Adapters seed no graph docs, normalize only v1/v2 payloads, and governance checks have no plan-shape assertions. | [VERIFIED: evals/retrieval/lib/adapters.ts] [VERIFIED: evals/retrieval/lib/normalize.ts] [VERIFIED: evals/retrieval/lib/governance.ts] [VERIFIED: evals/retrieval/lib/assertions.ts] |
| Eval reporting | `evals/retrieval/lib/report.ts`, `evals/retrieval/lib/format.ts`, `evals/retrieval/lib/report.test.ts` | Route-family/routing-reason aggregation is where fallback observability lands, and this path already has a failing `routingReason: none` baseline bug. | [VERIFIED: evals/retrieval/lib/report.ts] [VERIFIED: evals/retrieval/lib/format.ts] [VERIFIED: evals/retrieval/lib/report.test.ts] |
| Eval datasets + scenarios | `evals/retrieval/datasets/**/*`, `evals/retrieval/scenarios/**/*` | Plan route coverage needs explicit graph-plan-selected and fallback cases plus graph fixture state. | [VERIFIED: evals/retrieval/datasets/core/v1-retrieval-core.ts] [VERIFIED: evals/retrieval/datasets/core/v2-retrieval-core.ts] [VERIFIED: evals/retrieval/scenarios/core/retrieval-core-scenarios.ts] |

### Pattern 1: Preserve the Direct Compiler Primitive

**What:** Keep `compileTrapFirstPlan()` and `POST /v3/retrieval/plan` as the plan-only primitive from Phase 37, and layer routed GraphRAG-lite resolution above it instead of mutating that direct contract into a fallback union. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] [VERIFIED: packages/server/src/routes/retrieval.ts]

**When to use:** Use this whenever the caller explicitly wants the raw trap-first plan or when tests need deterministic compiler-only assertions without legacy fallback noise. [VERIFIED: .planning/phases/37-graphrag-lite-retrieval-compiler-for-trap-first-skill-plans/37-CONTEXT.md] [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md]

**Implementation recommendation:** Add a sibling routed endpoint such as `/v3/retrieval/search` or `/v3/retrieval/resolve`; let naming stay open, but keep it separate from `/v3/retrieval/plan` so direct compiler tests and planner assumptions remain stable. [RECOMMENDATION]

### Pattern 2: Make Confidence a Small Deterministic Decision Envelope

**What:** Compute confidence from stable plan features already available after compilation: blocker count, hard-blocker count, selected skill count, mitigating-edge count, disconnected-skill count, citation overflow, and whether the graph produced any meaningful edges at all. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts]

**When to use:** Score once on the default plan, optionally re-run once in a bounded mid-confidence band by widening `skillBudget` and/or `maxDepth`, then fall back if confidence is still below the route threshold. This matches the CONTEXT guidance to widen evidence before abandoning the plan path. [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md]

**Example:**
```typescript
// Source patterns:
// - packages/server/src/lib/retrieval/plan-compiler.ts
// - packages/server/src/lib/retrieval/orchestrator.ts
const plan = await compileTrapFirstPlan(services, auth, query);
const decision = assessGraphPlanConfidence(plan);

if (decision.band === 'high') {
  return buildGraphPlanResponse(plan, decision);
}

if (decision.band === 'medium') {
  const widenedPlan = await compileTrapFirstPlan(services, auth, {
    ...query,
    skillBudget: Math.min(query.skillBudget + 1, 5),
    maxDepth: Math.min(query.maxDepth + 1, 3),
  });
  const widenedDecision = assessGraphPlanConfidence(widenedPlan);
  if (widenedDecision.band === 'high') {
    return buildGraphPlanResponse(widenedPlan, widenedDecision);
  }
}

return await fallbackToGovernedLegacyPath(...);
```

### Pattern 3: One Top-Level Query, One Top-Level Log

**What:** The routed GraphRAG-lite surface should own the query ID, routing trace, confidence reason, and final fallback decision, and it should not call `searchKnowledge()` or `searchKnowledgeV2()` in a way that produces nested RAG logs with unrelated query IDs. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/rag-log.ts]

**When to use:** If the new resolver reuses v1/v2 internals, first extract unlogged execution helpers or add an explicit `suppressRagLog`/`parentQueryId` path. Calling the current public orchestrator functions directly would double-log the same routed request. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

**Example:**
```typescript
// Source pattern: packages/server/src/lib/retrieval/orchestrator.ts
const queryId = generateQueryId();
const trace = {
  selectedMode: 'plan',
  routeFamily: 'plan',
  routingReason: 'graph-plan-selected',
  fallbackApplied: false,
  channelsUsed: ['graph', 'capsule'],
};

void logRagRetrieval(services.config.ragLog, {
  timestamp: new Date(startMs).toISOString(),
  queryId,
  seed: parsed.seed,
  mode: 'v3-plan',
  actorId: auth.actorId,
  teamId: auth.activeTeamId,
  pipelineSteps: steps,
  totalLatencyMs: Date.now() - startMs,
  resultCount,
  metadata: {
    maxResults: parsed.maxResults,
    includeSummary: false,
    includeRefinement: false,
    routingTrace: trace,
    graphPlan: {
      confidenceBand: 'high',
      blockerCount: 2,
      skillCount: 2,
    },
  },
});
```

### Pattern 4: Eval Coverage Must Seed Graph State, Not Just Entry/Artifact State

**What:** Plan-route evals need real `graphIndexDocuments` in scenario fixtures, because `compileTrapFirstPlan()` seeds from graph docs and returns empty plans when seed node IDs cannot be resolved from those documents. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] [VERIFIED: evals/retrieval/lib/adapters.ts]

**When to use:** Add `graphIndexDocuments` to the scenario contract and adapter seeding before authoring routed GraphRAG-lite eval cases; otherwise plan-path coverage will be false-negative noise. [VERIFIED: evals/retrieval/scenarios/core/retrieval-core-scenarios.ts] [VERIFIED: evals/retrieval/lib/adapters.ts]

### Sequencing Constraints

1. Fix the routing-report baseline bug first: `buildRoutingDistribution()` currently emits `reason = 'none'` when execution metadata has no `routingReason`, but `routingReasonSchema` does not allow `none`, and `evals/retrieval/lib/report.test.ts` fails because of it. Phase 38 will add more reason codes, so this gap becomes more visible, not less. [VERIFIED: evals/retrieval/lib/report.ts] [VERIFIED: evals/retrieval/lib/report.test.ts] [VERIFIED: packages/contracts/src/domain/retrieval.ts]
2. Extend contracts before server code: route family, routing reason, log mode, eval endpoint, and any routed-plan envelope should be in place before route or adapter wiring, because these identifiers are reused across server, eval, and report formatting layers. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts] [VERIFIED: packages/contracts/src/domain/evals/report.ts]
3. Extract or add reusable unlogged fallback executors before implementing the new route, otherwise the routed surface will produce nested log entries and inconsistent query IDs. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/rag-log.ts]
4. Expand eval scenarios and adapter seeding before adding routed plan datasets, because current fixtures cannot materialize graph-backed requests. [VERIFIED: evals/retrieval/lib/adapters.ts] [VERIFIED: evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts]
5. Add docs and route inventory last, but do not skip them: `documentedRoutes` and `docs/api-surface.md` still lag even the existing Phase 37 direct route. [VERIFIED: packages/server/src/app.ts] [VERIFIED: docs/api-surface.md]

### Anti-Patterns to Avoid

- **Do not overload `/v3/retrieval/plan` with fallback payload unions:** It is the Phase 37 direct compiler contract and should remain the deterministic primitive. [VERIFIED: .planning/phases/37-graphrag-lite-retrieval-compiler-for-trap-first-skill-plans/37-CONTEXT.md] [VERIFIED: packages/server/src/routes/retrieval.ts]
- **Do not add GraphRAG-lite routing only in server code:** Route family, reason codes, report schemas, adapter normalization, and dataset enums all have to move together. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts] [VERIFIED: evals/retrieval/lib/normalize.ts] [VERIFIED: evals/retrieval/lib/load.ts]
- **Do not treat live CLI retrieval failure as “no relevant traps/skills”:** the current blocker is a transport/auth surface problem, not a knowledge-base emptiness signal. [VERIFIED: local CLI run 2026-04-25] [VERIFIED: packages/cli/src/index.ts]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why | Evidence |
|---------|-------------|-------------|-----|----------|
| Confidence calibration | A model-scored or probabilistic confidence service | A small deterministic scorer over plan counts/edge evidence | CONTEXT explicitly prefers deterministic heuristics first, and existing plan output already exposes the needed signals. | [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md] [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] |
| Fallback governance | A special-case bypass around existing filters | `filterEligibleEntries()` and `isArtifactGovernanceEligible()` | Governance must happen before route selection and before fallback return; these are the existing gates. | [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md] [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/capsule-recall.ts] |
| Graph slicing | Custom BFS/DFS helpers for local view extraction | `buildLocalExpansionView()` | The graph helper already enforces bounded expansion on persisted graph docs. | [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| Logging/report surface | A new GraphRAG-only log or report pipeline | Existing `logRagRetrieval()` plus `evals/retrieval` report builders | Phase 38 scope says to extend the current logging/eval stack, not fork it. | [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md] [VERIFIED: packages/server/src/lib/rag-log.ts] [VERIFIED: evals/retrieval/lib/report.ts] |
| Eval execution path | A standalone GraphRAG-only benchmark runner | Existing `evals/retrieval` route-executed runner | The current runner already handles in-process Fastify execution, governance verdicts, and stable report output. | [VERIFIED: evals/retrieval/run.ts] [VERIFIED: evals/retrieval/lib/adapters.ts] |

**Key insight:** Phase 38 is mainly a contract-and-wiring phase around an already-built compiler, so the durable value is in extending the existing router, log, and eval seams cleanly rather than introducing more standalone infrastructure. [VERIFIED: .planning/phases/37-graphrag-lite-retrieval-compiler-for-trap-first-skill-plans/37-VERIFICATION.md] [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md]

## Common Pitfalls

### Pitfall 1: Double Logging During Fallback

**What goes wrong:** The routed GraphRAG-lite endpoint logs once, then the fallback call into `searchKnowledge()` or `searchKnowledgeV2()` logs again with a second query ID and a different route family. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/rag-log.ts]

**Why it happens:** The public v1/v2 orchestrator functions are already top-level endpoints with their own logging lifecycle. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

**How to avoid:** Extract internal no-log execution helpers or add an explicit suppression path before the new resolver is implemented. [RECOMMENDATION]

**Warning signs:** Two log entries appear for one routed request, or fallback counts in reports exceed real request counts. [VERIFIED: packages/server/src/lib/rag-log.ts] [VERIFIED: evals/retrieval/lib/format.ts]

### Pitfall 2: Contract Drift Across Route Families

**What goes wrong:** Server code understands a `plan` route family or new reason codes, but eval contracts, report schemas, or formatters still only understand `entry`, `capsule`, and the old routing reasons. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/contracts/src/domain/evals/report.ts] [VERIFIED: evals/retrieval/lib/format.ts]

**Why it happens:** Retrieval routing metadata is duplicated across contracts, server-local types, eval result types, and report formatting. [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: evals/retrieval/lib/types.ts]

**How to avoid:** Treat route-family and reason-code changes as one contract wave, not as piecemeal server-only edits. [RECOMMENDATION]

**Warning signs:** Zod report validation errors, formatter crashes, or missing routing slices for the new route. [VERIFIED: evals/retrieval/lib/report.test.ts]

### Pitfall 3: Plan Evals Without Graph Fixtures

**What goes wrong:** Graph-plan cases appear low-confidence or empty even though the text fixtures look valid. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts]

**Why it happens:** Eval scenarios currently seed entries and artifacts only; the plan compiler seeds from `graphIndexDocuments`. [VERIFIED: evals/retrieval/lib/adapters.ts] [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts]

**How to avoid:** Add graph documents to scenario fixtures and adapter seeding before writing routed plan evals. [RECOMMENDATION]

**Warning signs:** Plan route always returns empty/no-edge output in eval, while direct unit tests with hand-built graph docs pass. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.test.ts]

### Pitfall 4: Missing Routing Reasons Already Break Reports

**What goes wrong:** `buildRoutingDistribution()` emits `none` for missing routing reasons, but the schema rejects it, causing `buildReport()` test failures. [VERIFIED: evals/retrieval/lib/report.ts] [VERIFIED: evals/retrieval/lib/report.test.ts] [VERIFIED: packages/contracts/src/domain/retrieval.ts]

**Why it happens:** The eval reporting layer assumes execution metadata is complete, but adapter-produced metadata can omit routing fields. [VERIFIED: evals/retrieval/lib/adapters.ts] [VERIFIED: evals/retrieval/lib/types.ts]

**How to avoid:** Make routing metadata mandatory for the new routed surface and fix the existing report fallback behavior before adding more reason codes. [RECOMMENDATION]

**Warning signs:** `retrievalEvalReportSchema.parse()` fails during report-building tests. [VERIFIED: evals/retrieval/lib/report.test.ts]

## Code Examples

Verified patterns from existing sources and recommended Phase 38 composition:

### Deterministic Router Pattern

```typescript
// Source: packages/server/src/lib/retrieval/orchestrator.ts
export function selectRetrievalStrategy(requestedMode: string, seed: string): RoutingDecision {
  const strategy = V1_MODE_TO_STRATEGY[requestedMode] ?? 'local';
  return {
    selectedMode: strategy,
    routeFamily: 'entry',
    routingReason: 'explicit-mode',
    fallbackApplied: strategy !== V1_MODE_TO_STRATEGY[requestedMode],
    channelsPlanned: getV1ChannelsPlanned(requestedMode),
    channelsUsed: [],
  };
}
```

### Recommended GraphRAG-lite Confidence Wrapper

```typescript
// Source patterns:
// - packages/server/src/lib/retrieval/plan-compiler.ts
// - packages/server/src/lib/indexing/graph-lite/graphology.ts
type GraphPlanBand = 'high' | 'medium' | 'low';

function assessGraphPlanConfidence(plan: TrapFirstPlan): {
  band: GraphPlanBand;
  reasons: string[];
} {
  const blockerCount = plan.blockingTraps.length;
  const skillCount = plan.recommendedSkills.length;
  const edgeCount = plan.edges.length;
  const hardBlockerCount = plan.blockingTraps.filter((t) => t.severity === 'hard').length;
  const mitigatingEdgeCount = plan.edges.filter((e) => e.type === 'mitigates').length;

  if (blockerCount > 0 && skillCount > 0 && mitigatingEdgeCount > 0) {
    return { band: 'high', reasons: ['graph-plan-selected'] };
  }

  if (hardBlockerCount > 0 || edgeCount > 0) {
    return { band: 'medium', reasons: ['graph-plan-mid-confidence'] };
  }

  return { band: 'low', reasons: ['graph-plan-low-confidence-fallback-v2'] };
}
```

### Eval Adapter Growth Point

```typescript
// Source: evals/retrieval/lib/adapters.ts
await ctx.store.transact(async (data) => {
  data.knowledgeEntries.push(...seededEntries);
  data.skillArtifacts.push(...seededArtifacts);
  data.graphIndexDocuments.push(...seededGraphDocs); // add for Phase 38
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct plan compilation existed only as `/v3/retrieval/plan` and was outside the shared router. [VERIFIED: packages/server/src/routes/retrieval.ts] | Phase 38 should add a routed GraphRAG-lite surface that can choose the plan path or fall back deterministically. [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md] | Phase 37 shipped on 2026-04-25. [VERIFIED: .planning/phases/37-graphrag-lite-retrieval-compiler-for-trap-first-skill-plans/37-VERIFICATION.md] | Rollout becomes reversible and auditable instead of all-or-nothing. |
| Retrieval evals only target `/v1/retrieval/search` and `/v2/retrieval/search`. [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts] | Phase 38 needs a third GraphRAG-lite-aware routed surface in eval contracts and datasets, plus graph fixture seeding. [VERIFIED: evals/retrieval/lib/adapters.ts] | Still current as of 2026-04-25. [VERIFIED: evals/retrieval/run.ts] | Without this, fallback coverage and plan-path regressions remain invisible. |
| Routing trace exists in server logs conceptually, but eval execution metadata does not reliably carry it end to end. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: evals/retrieval/lib/adapters.ts] | Phase 38 should make routing/fallback metadata a first-class response/eval artifact instead of a file-log-only detail. [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md] | Trace schema added in earlier routing phases; adapter gap remains current. [VERIFIED: packages/contracts/src/domain/retrieval.ts] | Report slices, routing distribution, and baseline comparisons can become trustworthy. |

**Deprecated/outdated:**

- Treating GraphRAG-lite as a completely separate direct endpoint with no fallback or eval route-family support is outdated for a safe rollout. [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. All factual claims above were verified from current repo files, local command output, or npm registry queries. | — | — |

## Open Questions

1. **Should the routed GraphRAG-lite surface be a new endpoint or a mode on an existing endpoint?**
   - What we know: `/v1/retrieval/search` and `/v2/retrieval/search` return materially different payload shapes, and `/v3/retrieval/plan` already exists as a direct compiler route. [VERIFIED: packages/server/src/routes/retrieval.ts]
   - What's unclear: whether product/API consumers want fallback responses wrapped in a new discriminated union or hidden behind an existing surface. [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md]
   - Recommendation: Prefer a new additive routed endpoint and keep `/v3/retrieval/plan` unchanged. [RECOMMENDATION]

2. **Should `routeFamily` describe the attempted plan route or the final returned route after fallback?**
   - What we know: current routing trace has only one `routeFamily` field, plus `fallbackApplied`. [VERIFIED: packages/contracts/src/domain/retrieval.ts]
   - What's unclear: whether planners/report consumers need both attempted and returned families for diagnosis. [VERIFIED: evals/retrieval/lib/report.ts]
   - Recommendation: Keep `routeFamily` as the final returned family and add a separate `attemptedRouteFamily` or `fallbackTarget` field if diagnosis needs the original attempt. [RECOMMENDATION]

3. **What identifier should plan-path eval metrics rank for skill nodes: `capsuleId` or `artifactId`?**
   - What we know: v2 relevance today ranks capsule IDs, while the plan schema exposes both `artifactId` and optional `capsuleId`. [VERIFIED: evals/retrieval/datasets/core/v2-retrieval-core.ts] [VERIFIED: packages/contracts/src/domain/plans.ts]
   - What's unclear: whether planner-quality metrics are about artifact selection, capsule selection, or both. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts]
   - Recommendation: Normalize plan skill hits to `capsuleId ?? artifactId` and make the dataset explicit per case. [RECOMMENDATION]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server route tests, eval runner, `tsx` scripts | ✓ | `v20.19.5` | — |
| `pnpm` | Workspace scripts and package-local tests | ✓ | `10.33.0` | — |
| `tsx` | Retrieval eval entrypoints and CLI/server dev scripts | ✓ | `4.21.0` | — |

**Missing dependencies with no fallback:**

- None. [VERIFIED: local env probe 2026-04-25]

**Missing dependencies with fallback:**

- None. [VERIFIED: local env probe 2026-04-25]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `Vitest 3.2.4` in repo, root multi-project config plus package-local configs. [VERIFIED: package.json] [VERIFIED: vitest.config.ts] |
| Config file | root `vitest.config.ts`; package-local `packages/server/vitest.config.ts`. [VERIFIED: vitest.config.ts] [VERIFIED: packages/server/vitest.config.ts] |
| Quick run command | `pnpm --filter @trapmap/server test -- --run src/lib/retrieval/plan-compiler.test.ts src/lib/retrieval/routing.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P38-R1 | Routed GraphRAG-lite endpoint selects plan on high confidence | server unit + route | `pnpm --filter @trapmap/server test -- --run src/lib/retrieval/routing.test.ts src/routes/retrieval.test.ts` | ❌ Wave 0 |
| P38-R2 | Routed GraphRAG-lite endpoint falls back to v2 or v1 with explicit reason codes | server unit + route | `pnpm --filter @trapmap/server test -- --run src/lib/retrieval/routing.test.ts src/routes/retrieval.test.ts src/lib/rag-log.test.ts` | ❌ Wave 0 |
| P38-R3 | Trace/log metadata records attempted route, final route, reason, and fallback | server unit | `pnpm --filter @trapmap/server test -- --run src/lib/rag-log.test.ts src/lib/retrieval/routing.test.ts` | ❌ Wave 0 |
| P38-R4 | Eval harness executes plan-path scenarios with graph fixtures | eval integration | `pnpm test -- --run evals/retrieval/runner.test.ts evals/retrieval/lib/normalize.test.ts evals/retrieval/lib/report.test.ts` | ⚠️ Partial |
| P38-R5 | Eval report exposes new route family/reason distribution without schema failure | eval unit | `pnpm test -- --run evals/retrieval/lib/report.test.ts` | ✅ but currently failing baseline |

### Sampling Rate

- **Per task commit:** `pnpm --filter @trapmap/server test -- --run src/lib/retrieval/plan-compiler.test.ts src/lib/retrieval/routing.test.ts`
- **Per wave merge:** `pnpm test -- --run src/routes/retrieval.test.ts evals/retrieval/runner.test.ts evals/retrieval/lib/report.test.ts`
- **Phase gate:** `pnpm test`

### Wave 0 Gaps

- [ ] `packages/server/src/routes/retrieval.test.ts` — add explicit routed GraphRAG-lite route coverage; current file has no `v3` route tests. [VERIFIED: packages/server/src/routes/retrieval.test.ts]
- [ ] `packages/server/src/lib/retrieval/routing.test.ts` — add plan route family, confidence band, and fallback reason coverage. [VERIFIED: packages/server/src/lib/retrieval/routing.test.ts]
- [ ] `packages/server/src/lib/rag-log.test.ts` — add plan-mode and fallback-metadata assertions. [VERIFIED: packages/server/src/lib/rag-log.test.ts]
- [ ] `evals/retrieval/lib/adapters.ts` — seed `graphIndexDocuments` for graph-plan evals. [VERIFIED: evals/retrieval/lib/adapters.ts]
- [ ] `evals/retrieval/lib/normalize.ts` + `governance.ts` + `assertions.ts` — understand routed plan responses and fallback shape assertions. [VERIFIED: evals/retrieval/lib/normalize.ts] [VERIFIED: evals/retrieval/lib/governance.ts] [VERIFIED: evals/retrieval/lib/assertions.ts]
- [ ] `evals/retrieval/lib/report.ts` — fix the current `routingReason: none` bug before adding more routing reasons. [VERIFIED: evals/retrieval/lib/report.ts] [VERIFIED: evals/retrieval/lib/report.test.ts]

**Baseline verification notes:**

- `pnpm --filter @trapmap/server test -- --run src/lib/retrieval/plan-compiler.test.ts src/lib/retrieval/routing.test.ts` passed on 2026-04-25. [VERIFIED: local test run 2026-04-25]
- `pnpm test -- --run evals/retrieval/lib/report.test.ts evals/retrieval/runner.test.ts` currently fails in `evals/retrieval/lib/report.test.ts` because the report builder emits `routingReason = 'none'`, and it also surfaced one unrelated flaky `packages/server/src/lib/retrieval.test.ts` JSON-store failure while running through the root multi-project config. [VERIFIED: local test run 2026-04-25]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `resolveAuthContext()` gates all retrieval routes with authenticated session context. [VERIFIED: packages/server/src/routes/retrieval.ts] |
| V3 Session Management | yes | Session-based bearer auth is already used by live routes and by the eval adapter context. [VERIFIED: packages/server/src/lib/context.ts] [VERIFIED: evals/retrieval/lib/adapters.ts] |
| V4 Access Control | yes | `requirePermission()`, `filterEligibleEntries()`, and `isArtifactGovernanceEligible()` must run before plan selection and before fallback return. [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/capsule-recall.ts] |
| V5 Input Validation | yes | Zod contracts already validate retrieval queries, plan queries, eval cases, and reports. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/contracts/src/domain/plans.ts] [VERIFIED: packages/contracts/src/domain/evals/retrieval.ts] |
| V6 Cryptography | no | Phase 38 does not require new cryptographic logic; reuse existing session/token handling unchanged. [VERIFIED: packages/server/src/lib/context.ts] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized leakage through fallback | Information Disclosure | Run governance filters before route selection and again on the actual fallback payload; never let fallback bypass existing v1/v2 gates. [VERIFIED: .planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md] [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/capsule-recall.ts] |
| Cross-team graph expansion causing hidden-edge leakage | Information Disclosure | Seed graph candidates only from already-governed source documents and never include forbidden source evidence in returned plan or logs. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/documents.ts] |
| Route confusion between attempted plan and returned fallback | Tampering | Use an explicit discriminated response envelope plus stable routing reason/route family fields. [RECOMMENDATION] |
| Over-logging plan evidence | Information Disclosure | Log counts and machine-readable reason codes, not raw forbidden snippets or unauthorized evidence text. [RECOMMENDATION] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/38-graphrag-lite-routing-fallback-and-evaluation-coverage/38-CONTEXT.md` - locked decisions and Phase 38 scope
- `.planning/phases/37-graphrag-lite-retrieval-compiler-for-trap-first-skill-plans/37-RESEARCH.md` - prior-phase design baseline
- `.planning/phases/37-graphrag-lite-retrieval-compiler-for-trap-first-skill-plans/37-VERIFICATION.md` - what Phase 37 actually shipped
- `packages/server/src/routes/retrieval.ts` - current v1/v2 route handlers and direct `/v3/retrieval/plan`
- `packages/server/src/lib/retrieval/orchestrator.ts` - deterministic routing, channel inference, logging pattern
- `packages/server/src/lib/retrieval/plan-compiler.ts` and `plan-compiler.test.ts` - current plan compiler behavior and confidence inputs
- `packages/server/src/lib/rag-log.ts` and `rag-log.test.ts` - current RAG log schema and coverage
- `packages/contracts/src/domain/retrieval.ts`, `plans.ts`, `evals/retrieval.ts`, `evals/report.ts` - contract surfaces
- `evals/retrieval/lib/adapters.ts`, `normalize.ts`, `governance.ts`, `assertions.ts`, `report.ts`, `report.test.ts` - eval harness limits and current bug
- `evals/retrieval/scenarios/**/*.ts`, `datasets/**/*.ts` - fixture and dataset coverage
- `packages/cli/src/index.ts`, `packages/cli/src/commands/retrieval.ts`, `packages/cli/src/commands/skill.ts` - CLI surface gating
- Local command output on 2026-04-25:
  - `pnpm exec tsx packages/cli/src/index.ts session --json`
  - `pnpm exec tsx packages/cli/src/index.ts --help`
  - `pnpm exec tsx packages/cli/src/index.ts api:list`
  - `pnpm --filter @trapmap/server test -- --run src/lib/retrieval/plan-compiler.test.ts src/lib/retrieval/routing.test.ts`
  - `pnpm test -- --run evals/retrieval/lib/report.test.ts evals/retrieval/runner.test.ts`

### Secondary (MEDIUM confidence)

- `docs/api-surface.md` - current documented API surface (useful, but lags actual runtime routes)
- npm registry queries on 2026-04-25:
  - `npm view graphology version time.modified --json`
  - `npm view graphology-dag version time.modified --json`
  - `npm view graphology-operators version time.modified --json`
  - `npm view graphology-shortest-path version time.modified --json`
  - `npm view fastify version time.modified --json`
  - `npm view zod version time.modified --json`
  - `npm view vitest version time.modified --json`

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - No new dependency search was needed; the relevant packages and versions are explicit in repo manifests and were checked against the npm registry. [VERIFIED: packages/server/package.json] [VERIFIED: package.json] [VERIFIED: npm registry graphology] [VERIFIED: npm registry fastify]
- Architecture: MEDIUM - The code surfaces are clear, but endpoint naming and final routed-envelope shape are still design choices that Phase 38 must lock early. [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/contracts/src/domain/plans.ts]
- Pitfalls: HIGH - The double-log risk, graph-fixture gap, and routing-report bug are all directly observable in current code or test output. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: evals/retrieval/lib/adapters.ts] [VERIFIED: evals/retrieval/lib/report.test.ts]

**Research date:** 2026-04-25
**Valid until:** 2026-05-02
