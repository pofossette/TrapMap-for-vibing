# Phase 29: 统一多模式检索策略层与路由 - Research

**Researched:** 2026-04-23
**Domain:** Retrieval routing architecture, governance-first mode selection, and cross-endpoint traceability
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Working assumptions

- Keep `/v1/retrieval/search` and `/v2/retrieval/search` backward-compatible unless a new `/v3` surface is clearly justified during plan phase.
- Prefer a shared internal strategy layer over duplicating mode logic in route handlers.
- Governance filtering must remain a precondition, not a post-filter patch.
- Deterministic fallback paths should remain available for local and CI use.

### Target direction

- Treat current `semantic`, `hybrid`, and `graph-assisted` as existing retrieval primitives, not the final product-facing taxonomy.
- Add a clearer mode story closer to `naive / local / global / hybrid / mix / auto`, but map it onto TrapMap's current artifact and knowledge models rather than copying LightRAG literally.
- Keep model-assisted routing optional. Start with deterministic routing from parsed intent and query shape.

### Claude's Discretion

None captured in CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)

- LLM-based router for mode selection
- New public API version unless internal cleanup proves insufficient
- Heavier abstractive answer generation changes
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVAL-04 | Retrieval evaluation detects governance failures including forbidden-result leakage, scope violations, and empty-result expectation mismatches. | Unify mode routing behind a shared governance gate, preserve deterministic channel traces, and keep evaluation slices distinguishable by resolved mode and endpoint. [VERIFIED: repo code] |
| EOPS-03 | The milestone defines a baseline and failure policy so future retrieval changes can be checked against regressions instead of ad-hoc judgment. | Add trace metadata for requested mode, resolved mode, routing reason, and channel contributions so the eval/reporting pipeline can compare routing changes against a stable baseline. [VERIFIED: repo code] |
</phase_requirements>

## Summary

TrapMap already has the right raw pieces for a unified routing layer, but they are split by API generation instead of by retrieval responsibility: v1 has explicit mode dispatch and citation-bearing channel merge, while v2 has deterministic intent parsing, governance-safe artifact filtering, and capsule ranking with no public mode abstraction. The planning target for Phase 29 should therefore be a shared server-internal strategy layer that sits below the Fastify routes and above the existing recall/ranking helpers, while keeping v1 and v2 response assembly separate. [VERIFIED: repo code]

The safe unification boundary is not the HTTP surface and not the final response schema. The safe boundary is: `governance gate -> route-to-plan resolution -> channel execution -> per-surface assembly -> trace/log emission`. That preserves the repo’s backward-compatibility requirement for `/v1/retrieval/search` and `/v2/retrieval/search`, reuses current entry and capsule channels, and gives Phase 30/31 enough trace data to evaluate routing quality without rebuilding the eval stack. [VERIFIED: repo code]

**Primary recommendation:** Implement a shared internal `RagMode` router and execution-plan registry, keep governance filtering ahead of all channel work, reuse existing recall/ranking helpers as channels, and extend trace/log metadata instead of changing response shapes first. [VERIFIED: repo code]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Requested-mode parsing and backward-compatible endpoint contract handling | API / Backend | Frontend Server (CLI client as caller) | Routes already parse Zod contracts and delegate to server retrieval facades; the routing layer belongs behind those handlers, not in CLI formatting. [VERIFIED: repo code] |
| Governance-first eligibility filtering | API / Backend | Database / Storage | Eligibility today is enforced in server retrieval code before recall for both entries and artifacts; storage only supplies snapshots. [VERIFIED: repo code] |
| Entry-channel execution (`semantic`, `keyword`, `graph`) | API / Backend | Database / Storage | Existing recall helpers run in server code over filtered snapshots and cached embedding/index state. [VERIFIED: repo code] |
| Artifact/capsule-channel execution (`capsule`, `profile`, future excerpt/reference`) | API / Backend | Database / Storage | Capsule ranking and profile shortlist already execute in server code over derived artifact outputs stored in the snapshot. [VERIFIED: repo code] |
| Routing trace capture and eval slice emission | API / Backend | CDN / Static | Routing decisions are created in the retrieval pipeline and should be logged there; reports only consume emitted metadata later. [VERIFIED: repo code] |
| Human-readable result formatting | Browser / Client | API / Backend | CLI formatting is a presentation concern and should remain separate from mode resolution. [VERIFIED: repo code] |

## Project Constraints (from AGENTS.md)

- Keep monorepo separation between CLI, server, and shared contracts; shared schemas must stay consistent across components. [VERIFIED: repo code]
- Preserve imperative CLI behavior with predictable stdout and optional JSON mode. [VERIFIED: repo code]
- Keep retrieval text-only for v1 scope; do not introduce multimodal retrieval artifacts here. [VERIFIED: repo code]
- Maintain fast-prototype bias on LangChain JS server code; optimize usable end-to-end routing before platform polish. [VERIFIED: repo code]
- Access control must continue combining role templates with explicit permissions; routing changes cannot weaken governance semantics. [VERIFIED: repo code]

## Standard Stack

Phase 29 does not need new runtime dependencies. Reuse the current server, contract, CLI, and eval stack already present in the monorepo. [VERIFIED: repo code]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | repo `^5.6.1`; registry latest `5.8.5` | Retrieval route layer and thin handler delegation | Existing retrieval endpoints are already thin Fastify routes; Phase 29 should keep routing logic out of handlers and inside server libs. [VERIFIED: repo code] [VERIFIED: npm registry] |
| Zod | repo `^4.3.6` server / `^4.1.12` contracts; registry latest `4.3.6` | Shared request/response and eval contract validation | Retrieval, v2 retrieval, and eval contracts already depend on Zod schemas and should remain the canonical contract surface. [VERIFIED: repo code] [VERIFIED: npm registry] |
| `@langchain/core` | repo `^1.1.39`; registry latest `1.1.41` | Existing optional future refinement seam only | Routing unification should not add model dependence, but it should avoid blocking the existing LangChain-based refinement seam. [VERIFIED: repo code] [VERIFIED: npm registry] |
| TypeScript | repo `^5.9.3`; registry latest `6.0.3` | Shared type-safe strategy registry and trace objects | Shared discriminated unions and response adapters are easier and safer to express in TypeScript than in ad-hoc JSON objects. [VERIFIED: repo code] [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | repo `^3.2.4`; registry latest `4.1.5` | Unit, route, workflow, and eval-runner validation | Use for router plan tests, endpoint compatibility tests, and regression tests on trace metadata. [VERIFIED: repo code] [VERIFIED: npm registry] |
| `tsx` | repo `^4.20.3`; registry latest `4.21.0` | TS-native eval scripts and local runner execution | Use existing eval scripts without introducing a second runner path. [VERIFIED: repo code] [VERIFIED: npm registry] |
| Commander | repo `^14.0.1`; registry latest `14.0.3` | CLI flag passthrough for retrieval mode selection | Only update CLI flags if Phase 29 changes public mode exposure; otherwise keep passthrough stable. [VERIFIED: repo code] [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared internal strategy registry | Route-local `switch` blocks in each endpoint | Faster to patch once, but it duplicates policy and makes v1/v2 drift likely again. [VERIFIED: repo code] |
| Deterministic router from parsed intent/query shape | LLM router | Better explainability and CI determinism now; model routing is explicitly deferred by phase context. [VERIFIED: repo code] |
| Shared mode taxonomy over separate response assemblers | Fully unified response contract | Lower implementation duplication, but it would break endpoint-specific semantics that current eval contracts intentionally keep distinct. [VERIFIED: repo code] |

**Installation:**
```bash
# No additional packages recommended for Phase 29.
```

**Version verification:** [VERIFIED: npm registry]
- `fastify` latest `5.8.5`, registry modified `2026-04-14`.
- `zod` latest `4.3.6`, registry modified `2026-01-25`.
- `@langchain/core` latest `1.1.41`, registry modified `2026-04-22`.
- `@langchain/openai` latest `1.4.4`, registry modified `2026-04-10`.
- `vitest` latest `4.1.5`, registry modified `2026-04-21`.
- `tsx` latest `4.21.0`, registry modified `2025-11-30`.
- `commander` latest `14.0.3`, registry modified `2026-02-21`.
- `typescript` latest `6.0.3`, registry modified `2026-04-16`.

## Architecture Patterns

### System Architecture Diagram

```text
CLI/API caller
  -> Fastify route parses endpoint-specific contract
  -> shared retrieval facade
  -> governance gate
     -> v1 entry eligibility filter
     -> v2 artifact eligibility filter
  -> mode resolver
     -> requested mode? use explicit mapping
     -> no explicit mode? derive deterministic auto plan from parsed intent/query shape
  -> execution plan
     -> entry channels: semantic / keyword / graph
     -> artifact channels: capsule / profile / future excerpt
  -> per-surface assembler
     -> v1 bucketed matches + citations
     -> v2 capsules + profile hints + activation hints
  -> trace/log emission
     -> rag log metadata
     -> eval slice keys / report inputs
  -> response
```

The planner should treat the shared router as a policy-and-plan layer, not as a new transport layer and not as a schema-merging layer. [VERIFIED: repo code]

### Recommended Project Structure
```text
packages/server/src/lib/retrieval/
├── modes.ts              # shared RagMode / channel / trace enums
├── router.ts             # requested-mode + auto-mode resolution
├── plans.ts              # mode -> execution plan registry
├── trace.ts              # serializable routing trace object builders
├── channels/
│   ├── entry.ts          # adapters over semantic/keyword/graph helpers
│   ├── artifact.ts       # adapters over capsule/profile/excerpt helpers
│   └── types.ts          # normalized channel output
├── orchestrator.ts       # keeps v1/v2 facades, now calling shared router
└── assembly.ts           # stays endpoint-specific
```

This structure preserves the existing facade seam in [`packages/server/src/lib/retrieval.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval.ts) and keeps response assembly separate from route planning. [VERIFIED: repo code]

### Pattern 1: Separate Product Modes From Retrieval Channels
**What:** Define a stable public/internal mode taxonomy such as `naive | local | global | hybrid | mix | auto`, but map each mode to one or more concrete channels instead of exposing channels as the taxonomy itself. [VERIFIED: repo code]

**When to use:** Use this for all new routing logic and trace records; keep legacy `semantic | hybrid | graph-assisted` as v1 compatibility inputs that normalize into the shared internal taxonomy. [VERIFIED: repo code]

**Recommended taxonomy:**
- `naive`: deterministic single-path fallback for CI/local reproducibility. Use keyword-only for entry retrieval and capsule text token-overlap only for artifact retrieval. `naive` must not depend on embeddings or graph expansion. [ASSUMED]
- `local`: narrow, query-near retrieval. Map to v1 semantic recall and v2 capsule ranking. [VERIFIED: repo code]
- `global`: broader artifact/context retrieval. Map to profile shortlist plus any future reference-excerpt channel; do not use graph expansion by default here. [VERIFIED: repo code] [ASSUMED]
- `hybrid`: balanced multi-channel recall without the heaviest expansion. Map to v1 semantic+keyword and v2 capsule+profile. [VERIFIED: repo code] [ASSUMED]
- `mix`: full multi-channel plan. Map to v1 semantic+keyword+graph and v2 capsule+profile+excerpt once excerpt exists. [VERIFIED: repo code] [ASSUMED]
- `auto`: deterministic router that selects one of the above from parsed intent/query shape and filter constraints. [VERIFIED: repo code]

### Pattern 2: Governance-First Plan Compilation
**What:** Compute the governed candidate universe before channel execution, then run channels only inside that universe. [VERIFIED: repo code]

**When to use:** Use this for every route plan, including future excerpt/profile channels, because current v1 and v2 security assumptions both depend on pre-filtering rather than post-filter cleanup. [VERIFIED: repo code]

**Planning guidance:**
- Keep `filterEligibleEntries(...)` as the v1 pre-gate and `isArtifactGovernanceEligible(...)` / governed-artifact filtering as the v2 pre-gate. [VERIFIED: repo code]
- Do not let profile, excerpt, activation-hint, or trace builders read from ungated artifacts. [VERIFIED: repo code]
- Preserve summary generation as a pure post-assembly step over already-filtered hits and citations only. [VERIFIED: repo code]

### Pattern 3: Route Plan + Surface Adapter
**What:** Have the router return a normalized execution plan and trace envelope, then let v1 and v2-specific assemblers adapt channel output into their own response shapes. [VERIFIED: repo code]

**When to use:** Use this whenever the same mode should work across entry-native and capsule-native retrieval without forcing identical payloads. [VERIFIED: repo code]

**Concrete planning guidance:**
- Keep `/v1/retrieval/search` and `/v2/retrieval/search` route handlers thin. [VERIFIED: repo code]
- Keep `searchKnowledge(...)` and `searchKnowledgeV2(...)` as public facades, but have both call a shared router/planner internally. [VERIFIED: repo code]
- Do not merge `RetrievalResponse` and `RetrievalV2Response`; share plan state, not output schema. [VERIFIED: repo code]

### Pattern 4: Traceability as First-Class Routing Output
**What:** Make routing trace a typed output of plan resolution, not an afterthought built from log scraping. [VERIFIED: repo code]

**When to use:** Use this for EOPS-03 baselines and Phase 30/31 evaluation work. [VERIFIED: repo code]

**Minimum trace payload:**
- `requestedMode`
- `resolvedMode`
- `routerVersion`
- `routingReasons[]`
- `channelsPlanned[]`
- `channelsExecuted[]`
- `candidateCountsByChannel`
- `resultIdsByChannel`
- `governanceGate` summary with eligible counts only
- `endpointSurface` (`v1` or `v2`) [VERIFIED: repo code] [ASSUMED]

The best place to carry this without creating a second telemetry subsystem is `PipelineStep.metadata` and `RagLogEntry.metadata`, because both already exist and are JSON-serializable. [VERIFIED: repo code]

### Anti-Patterns to Avoid
- **Route-specific mode logic:** Duplicating resolution in Fastify handlers and CLI flags guarantees v1/v2 drift. [VERIFIED: repo code]
- **Post-filter governance:** Running broad recall first and trimming after ranking risks leakage through summaries, traces, and profile hints. [VERIFIED: repo code]
- **Mode equals channel:** If `hybrid` means a different thing in v1 and v2, eval slices stop being comparable. [VERIFIED: repo code]
- **Forced response unification:** Entry buckets and capsule/profile outputs are intentionally different in contracts and eval cases; collapsing them now adds migration cost without helping the router. [VERIFIED: repo code]
- **Opaque auto mode:** If `auto` does not record why it chose a plan, Phase 30/31 cannot baseline regressions. [VERIFIED: repo code]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Governance filtering | A new generic policy engine for Phase 29 | Existing `filterEligibleEntries(...)` and artifact governance filters | The repo already has distinct but proven governance gates for entries and artifacts; replacing them is extra risk. [VERIFIED: repo code] |
| Query understanding | An LLM router | Existing `parseSeedIntent(...)` heuristics plus deterministic query-shape rules | Phase context explicitly prefers deterministic routing and current code already extracts intent and stack/path hints. [VERIFIED: repo code] |
| Cross-channel logging | A separate routing analytics subsystem | Existing `rag-log.ts` with richer metadata | Logging already exists, rotates safely, and is fire-and-forget. [VERIFIED: repo code] |
| Regression reporting | A brand-new benchmark/report runner | Existing retrieval eval contracts, slice aggregation, and CI/report scripts | The eval stack already compares by endpoint/mode slice and feeds CI/reporting. [VERIFIED: repo code] |
| Artifact broad-context retrieval | New artifact storage model | Existing derived `profile`, `capsules`, and `clientManifest`; add excerpt/reference channel only if needed | Store records already contain reusable artifact-wide text shapes and activation metadata. [VERIFIED: repo code] |

**Key insight:** The repo already has enough primitives; the missing piece is a stable mode-to-plan abstraction and trace schema, not a new retrieval backend. [VERIFIED: repo code]

## Common Pitfalls

### Pitfall 1: Collapsing Endpoint Compatibility Into Mode Compatibility
**What goes wrong:** A single mode name is made to imply a single response schema, and v1/v2 compatibility breaks even if recall quality improves. [VERIFIED: repo code]
**Why it happens:** Current contracts and eval cases deliberately keep `/v1/retrieval/search` and `/v2/retrieval/search` separate. [VERIFIED: repo code]
**How to avoid:** Unify router inputs and execution plans only; keep endpoint-specific assembly and eval adapters. [VERIFIED: repo code]
**Warning signs:** Contract changes spill into CLI output formatting before routing tests are green. [VERIFIED: repo code]

### Pitfall 2: Governance Leakage Through “Helpful” Broad Channels
**What goes wrong:** Profile or excerpt channels read ungated artifact content and leak cross-team or high-level context into results, summaries, or logs. [VERIFIED: repo code]
**Why it happens:** Broad-context channels are tempting to compute before filtering because they seem read-only. [ASSUMED]
**How to avoid:** Build governed artifact/entry universes first and run all downstream channel work inside them. [VERIFIED: repo code]
**Warning signs:** Trace payloads or profile hints include IDs that could not have passed route auth. [VERIFIED: repo code] [ASSUMED]

### Pitfall 3: Non-Comparable Scores Across Entry and Capsule Worlds
**What goes wrong:** Mixed plans rank entry and capsule channels on raw scores that were never calibrated, so `auto` and `mix` appear unstable. [VERIFIED: repo code] [ASSUMED]
**Why it happens:** v1 uses merged channel scores with rerank metadata while v2 capsule ranking uses its own scoring breakdown. [VERIFIED: repo code]
**How to avoid:** Normalize channel outputs into a shared intermediate score contract with per-channel provenance, and prefer within-surface ranking unless a cross-surface result list is explicitly required. [VERIFIED: repo code] [ASSUMED]
**Warning signs:** A router change shifts results sharply without corresponding governance or relevance explanation in traces. [ASSUMED]

### Pitfall 4: Breaking Eval Slice Stability
**What goes wrong:** Resolved modes are renamed or hidden in a way that makes comparison across runs impossible, so EOPS-03 cannot define a durable baseline. [VERIFIED: repo code]
**Why it happens:** Current eval slices are keyed by tier, endpoint, and optional mode only. [VERIFIED: repo code]
**How to avoid:** Preserve legacy v1 mode values for existing cases, add `resolvedMode` and `channelsExecuted` as additive trace/report data, and only add new slices when dataset coverage exists. [VERIFIED: repo code] [ASSUMED]
**Warning signs:** Reports still pass but can no longer answer “what changed in routing?” across revisions. [ASSUMED]

## Code Examples

Verified patterns adapted from existing repo seams:

### Shared Mode Registry
```typescript
// Source basis:
// - packages/server/src/lib/retrieval/orchestrator.ts
// - packages/server/src/lib/retrieval/types.ts
// - packages/server/src/lib/rag-log.ts

export type RagMode =
  | 'naive'
  | 'local'
  | 'global'
  | 'hybrid'
  | 'mix'
  | 'auto';

export type RetrievalChannel =
  | 'entry-semantic'
  | 'entry-keyword'
  | 'entry-graph'
  | 'artifact-capsule'
  | 'artifact-profile'
  | 'artifact-excerpt';

export interface RoutingTrace {
  requestedMode: string | null;
  resolvedMode: RagMode;
  endpointSurface: 'v1' | 'v2';
  routingReasons: string[];
  channelsPlanned: RetrievalChannel[];
}
```

### Governance-First Route Plan
```typescript
// Source basis:
// - packages/server/src/lib/retrieval/orchestrator.ts
// - packages/server/src/lib/retrieval/capsule-recall.ts

async function buildRoutePlan(input: {
  endpointSurface: 'v1' | 'v2';
  requestedMode: string | null;
  seed: string;
  auth: ResolvedAuthContext;
  data: StoreSnapshot;
}) {
  const intent = parseSeedIntent(input.seed);

  const governedEntries =
    input.endpointSurface === 'v1'
      ? filterEligibleEntries(input.data.knowledgeEntries, input.auth, { labels: [], scopes: [] })
      : [];

  const governedArtifacts =
    input.endpointSurface === 'v2'
      ? (input.data.skillArtifacts ?? []).filter((artifact) =>
          isArtifactGovernanceEligible(artifact, {
            teamId: input.auth.activeTeamId,
            securityLevel: input.auth.securityLevel,
            isSystemAdmin: input.auth.subjectType === 'system-admin',
          }),
        )
      : [];

  return resolveModeAndChannels({
    requestedMode: input.requestedMode,
    endpointSurface: input.endpointSurface,
    intent,
    governedEntries,
    governedArtifacts,
  });
}
```

### Trace Emission Without New Telemetry Plumbing
```typescript
// Source basis:
// - packages/server/src/lib/rag-log.ts
// - packages/server/src/lib/retrieval/orchestrator.ts

steps.push({
  name: 'routing',
  latencyMs,
  metadata: {
    requestedMode: trace.requestedMode,
    resolvedMode: trace.resolvedMode,
    routingReasons: trace.routingReasons,
    channelsPlanned: trace.channelsPlanned,
    channelsExecuted: trace.channelsExecuted,
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1 exposes channel-shaped modes (`semantic`, `hybrid`, `graph-assisted`) while v2 exposes no explicit mode. [VERIFIED: repo code] | Shared internal mode taxonomy with compatibility adapters should sit behind both facades. [ASSUMED] | Phase 29 target direction from context. [VERIFIED: repo code] | Makes routing behavior explainable and reusable without breaking endpoint contracts. [ASSUMED] |
| v1 logs mode only; v2 logs fixed `v2-capsule`; neither logs routing reasons or channel contribution summaries. [VERIFIED: repo code] | Routing trace should become an additive structured payload in log metadata and pipeline steps. [ASSUMED] | Phase 29 target. [VERIFIED: repo code] | Enables Phase 30/31 evaluation to compare router decisions instead of only final outcome metrics. [ASSUMED] |
| Eval slices compare by endpoint and optional mode. [VERIFIED: repo code] | Eval/reporting should preserve those slices and add resolved-mode/channel metadata without invalidating old datasets. [ASSUMED] | Phase 29 target. [VERIFIED: repo code] | Supports EOPS-03 baselines without rewriting existing eval infrastructure. [ASSUMED] |

**Deprecated/outdated:**
- Treating public mode names as the same thing as internal recall channels is outdated for this repo state because v2 already has viable non-entry retrieval primitives that do not fit the v1 enum. [VERIFIED: repo code]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `naive` should mean keyword-only for v1 and token-overlap capsule matching for v2. | Architecture Patterns | Medium: planner could create the wrong fallback tasks if maintainers want a different deterministic baseline. |
| A2 | `global` should primarily mean profile/excerpt-oriented broad context rather than graph expansion. | Architecture Patterns | Medium: incorrect taxonomy would make mode names misleading and weaken future eval comparisons. |
| A3 | Existing eval/report infrastructure can accept additive resolved-mode/channel trace fields without contract breakage. | Common Pitfalls, Validation Architecture | Medium: if report schemas are too rigid, Phase 29 needs explicit report-contract updates in scope. |

## Open Questions (RESOLVED)

1. **v2 public mode exposure**
   - Resolution: Keep v2 mode selection internal in Phase 29 and expose the chosen internal strategy through trace metadata rather than adding a required public `mode` field now. [RESOLVED]

2. **Need for excerpt/reference-text channel**
   - Resolution: Treat excerpt/reference recall as conditional. Phase 29 should first implement parity with capsule + profile/global style channels and only add excerpt/reference retrieval if tests show those channels are insufficient for the target taxonomy. [RESOLVED]

3. **Legacy v1 mode mapping in reports**
   - Resolution: Preserve legacy requested mode slices for existing datasets and add resolved mode as additive metadata rather than replacing the old slice key in Phase 29. [RESOLVED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server tests, eval runner, CLI commands | ✓ | `v22.20.0` | — |
| `pnpm` | Workspace scripts and validation commands | ✓ | `10.33.0` | `npm exec` for one-off local probing only; do not make it the standard path. |
| `npm` | Registry version verification | ✓ | `11.6.2` | — |

**Missing dependencies with no fallback:**
- None. [VERIFIED: repo code]

**Missing dependencies with fallback:**
- None. [VERIFIED: repo code]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^3.2.4` in repo; latest registry `4.1.5` [VERIFIED: repo code] [VERIFIED: npm registry] |
| Config file | none at repo root; tests run via package scripts and direct `vitest run` invocation [VERIFIED: repo code] |
| Quick run command | `pnpm exec vitest run packages/server/src/lib/retrieval.test.ts packages/server/src/routes/retrieval.test.ts packages/server/src/lib/rag-log.test.ts` [VERIFIED: repo code] |
| Full suite command | `pnpm test && pnpm eval:retrieval:smoke` [VERIFIED: repo code] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVAL-04 | Governance filtering remains a strict precondition for every resolved mode and no forbidden IDs leak through unified routing. | unit + workflow | `pnpm exec vitest run packages/server/src/lib/retrieval.test.ts packages/server/src/lib/retrieval-workflow.test.ts` | ✅ |
| EOPS-03 | Reports can compare retrieval behavior across endpoint and mode combinations after routing unification. | eval + report | `pnpm eval:retrieval:smoke` | ✅ |
| PH29-01 | Router resolves requested/implicit mode to a deterministic internal plan with explainable reasons. | unit | `pnpm exec vitest run packages/server/src/lib/retrieval/intent.test.ts packages/server/src/lib/retrieval.test.ts` | ✅ partial; new router tests needed |
| PH29-02 | v1 and v2 both emit traceable routing metadata without changing successful response validation. | route + unit | `pnpm exec vitest run packages/server/src/routes/retrieval.test.ts packages/server/src/lib/rag-log.test.ts` | ✅ partial; additive assertions needed |
| PH29-03 | Existing eval slices remain stable for legacy modes while additive resolved-mode/channel data is available for future baselines. | eval + report | `pnpm exec vitest run evals/retrieval/lib/report.test.ts evals/retrieval/datasets/retrieval-datasets.test.ts` | ✅ partial; new trace-aware assertions needed |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run packages/server/src/lib/retrieval.test.ts packages/server/src/routes/retrieval.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** `pnpm test && pnpm eval:retrieval:smoke`

### Wave 0 Gaps
- [ ] `packages/server/src/lib/retrieval/router.test.ts` — covers PH29-01 deterministic mode resolution and compatibility aliases.
- [ ] `packages/server/src/lib/retrieval/trace.test.ts` — covers routing trace shape and log metadata serialization.
- [ ] `packages/server/src/lib/retrieval/strategy.test.ts` — covers plan compilation and channel selection across `naive/local/global/hybrid/mix/auto`.
- [ ] `evals/retrieval/lib/report.test.ts` update — verifies additive resolved-mode/channel metadata does not break existing slice comparison output.
- [ ] `evals/retrieval/datasets/*` update — add at least one case per legacy-requested-mode mapping and one auto-routing case once trace support exists.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Route handlers resolve auth context before retrieval work begins. [VERIFIED: repo code] |
| V3 Session Management | yes | Retrieval routes depend on existing session resolution and CLI session token flow. [VERIFIED: repo code] |
| V4 Access Control | yes | `requirePermission(...)` plus entry/artifact governance filters remain mandatory before any recall or summary work. [VERIFIED: repo code] |
| V5 Input Validation | yes | Zod query/response/eval schemas remain the validation boundary for routing inputs and outputs. [VERIFIED: repo code] |
| V6 Cryptography | no | Phase 29 routing does not introduce new crypto responsibilities; reuse existing hashing/logging behavior only. [VERIFIED: repo code] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-team or high-level retrieval leakage through a broad channel | Information Disclosure | Apply governance filtering before channel execution and before summary/profile/trace generation. [VERIFIED: repo code] |
| Trace log leakage of sensitive content | Information Disclosure | Log routing reasons, IDs, counts, and channels; do not log raw artifact/reference bodies as routing metadata. [VERIFIED: repo code] [ASSUMED] |
| Mode confusion causing bypass of legacy constraints | Tampering | Normalize legacy requested modes into a shared registry and keep compatibility tests around `/v1/retrieval/search` and `/v2/retrieval/search`. [VERIFIED: repo code] |
| Regression hidden by relevance-only metrics | Repudiation | Keep governance assertions separate from relevance assertions, as current eval contracts already do. [VERIFIED: repo code] |

## Sources

### Primary (HIGH confidence)
- [`packages/contracts/src/domain/retrieval.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/retrieval.ts) - current v1/v2 retrieval request and response contracts. [VERIFIED: repo code]
- [`packages/server/src/lib/retrieval/orchestrator.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/orchestrator.ts) - v1 mode dispatch, v2 capsule pipeline, logging seams, and summary behavior. [VERIFIED: repo code]
- [`packages/server/src/lib/retrieval/capsule-recall.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/capsule-recall.ts) - artifact governance and capsule ranking primitives. [VERIFIED: repo code]
- [`packages/server/src/lib/retrieval/assembly.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/assembly.ts) - endpoint-specific response assembly and activation-hint shaping. [VERIFIED: repo code]
- [`packages/server/src/lib/rag-log.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/rag-log.ts) - existing telemetry payload and safe extension point for routing trace. [VERIFIED: repo code]
- [`packages/server/src/routes/retrieval.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/retrieval.ts) - thin Fastify retrieval routes and contract boundaries. [VERIFIED: repo code]
- [`packages/contracts/src/domain/evals/retrieval.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/evals/retrieval.ts) - endpoint/mode slice contract and governance-vs-relevance separation. [VERIFIED: repo code]
- [`evals/retrieval/lib/runner-api.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/evals/retrieval/lib/runner-api.ts) and [`evals/retrieval/lib/format.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/evals/retrieval/lib/format.ts) - slice aggregation and report formatting behavior. [VERIFIED: repo code]
- [`packages/cli/src/commands/retrieval.ts`](/home/wunai/Disks/Data/my-project/Trap-Map/packages/cli/src/commands/retrieval.ts) - CLI flag passthrough and current v1/v2 compatibility behavior. [VERIFIED: repo code]
- `https://www.npmjs.com/package/fastify` - version verified via `npm view fastify version time.modified`. [VERIFIED: npm registry]
- `https://www.npmjs.com/package/zod` - version verified via `npm view zod version time.modified`. [VERIFIED: npm registry]
- `https://www.npmjs.com/package/@langchain/core` - version verified via `npm view @langchain/core version time.modified`. [VERIFIED: npm registry]
- `https://www.npmjs.com/package/@langchain/openai` - version verified via `npm view @langchain/openai version time.modified`. [VERIFIED: npm registry]
- `https://www.npmjs.com/package/vitest` - version verified via `npm view vitest version time.modified`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - recommendations reuse the exact repo stack and registry-verified package versions. [VERIFIED: repo code] [VERIFIED: npm registry]
- Architecture: HIGH - the routing seam, governance gates, and eval/report dependencies are all visible in current source. [VERIFIED: repo code]
- Pitfalls: MEDIUM - most are directly implied by current code structure, but the exact future mode semantics for `naive/global/mix` remain partially assumed. [VERIFIED: repo code] [ASSUMED]

**Research date:** 2026-04-23
**Valid until:** 2026-05-23

## RESEARCH COMPLETE

**Phase:** 29 - rag-mode-routing
**Confidence:** HIGH

### Key Findings
- v1 and v2 should share a router/plan layer, not a response contract. [VERIFIED: repo code]
- Governance must stay ahead of every channel, summary, hint, and trace path. [VERIFIED: repo code]
- Existing entry recall, capsule ranking, profile hints, rag logging, and eval slices are sufficient building blocks for Phase 29. [VERIFIED: repo code]
- The critical missing artifact is typed routing trace metadata that captures requested mode, resolved mode, reasons, and channel contribution. [VERIFIED: repo code] [ASSUMED]
- The main execution risk is score/taxonomy drift between entry-native and capsule-native retrieval if modes are defined at the channel level instead of the plan level. [VERIFIED: repo code] [ASSUMED]

### File Created
`.planning/phases/29-rag-mode-routing/29-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new dependencies are needed; repo stack and package versions were directly verified. [VERIFIED: repo code] [VERIFIED: npm registry] |
| Architecture | HIGH | Current routes, orchestrators, contracts, and eval/report seams clearly show where the shared router should live. [VERIFIED: repo code] |
| Pitfalls | MEDIUM | Failure modes are well-supported by current architecture, but some taxonomy semantics still need explicit planner confirmation. [VERIFIED: repo code] [ASSUMED] |

### Open Questions
- None. Planning decisions required for Phase 29 are resolved above and any further routing refinements are deferred to implementation evidence gathered in execution. [RESOLVED]

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
