# Phase 37: GraphRAG-lite Retrieval Compiler for Trap-First Skill Plans - Research

**Gathered:** 2026-04-25
**Phase Goal:** Compile governed trap and skill retrieval candidates into a minimal trap-first execution plan instead of returning another flat list of matches.

---

## Executive Summary

Phase 37 is a **greenfield compiler phase** that must create a new plan-assembly layer atop the existing Phase 36 GraphRAG-lite infrastructure. The phase has **no existing plan/compile code** to refactor -- it must be built from scratch while reusing:

1. **Phase 36's durable graph infrastructure** (`graphIndexDocuments`, `graphology` helpers)
2. **Existing retrieval surfaces** (`searchKnowledge` for traps, `searchKnowledgeV2` for skills)
3. **Existing governance filtering** (`isArtifactGovernanceEligible`, `filterEligibleEntries`)
4. **Existing activation hints** (`buildAllActivationHints`)

---

## What Exists Today

### Retrieval is split into two parallel product shapes

| Aspect | v1 Entry Retrieval | v2 Capsule Retrieval |
|--------|-------------------|----------------------|
| **Entry point** | `orchestrator.ts:187` `searchKnowledge()` | `orchestrator.ts:751` `searchKnowledgeV2()` |
| **Returns** | `RetrievalResponse` (globalConstraints, projectKnowledge flat lists) | `RetrievalV2Response` (capsules, profileHints, activationHints) |
| **Governance** | `filterEligibleEntries()` before recall | `isArtifactGovernanceEligible()` in capsule ranking |
| **Query mode** | `semantic`, `hybrid`, `graph-assisted` modes | Intent-parsed capsule ranking only |
| **Graph channel** | Optional via `graph-assisted` mode | Not yet integrated |

**Key insight:** Phase 37 must compile across both worlds -- trap candidates from v1 and skill candidates from v2 -- into a unified plan shape.

### Phase 36's durable graph infrastructure

**Available at query time:**
- `StoreData.graphIndexDocuments: GraphIndexDocumentRecord[]` -- persisted trap and skill graph documents
- `getGraphIndexDocuments(data)` -- load all graph documents from store
- `buildGraphFromDocuments(docs)` -- assemble graphology directed graph
- `projectHardDependencyGraph(docs)` -- filter to hard edges only (requires, risk-blocks with strength='hard')
- `assertNoHardDependencyCycles(docs)` -- cycle validation (throws "hard dependency cycle detected")
- `buildLocalExpansionView({ documents, seedNodeIds, maxDepth })` -- bounded neighborhood extraction

**Node kinds (locked vocabulary):**
```typescript
type GraphNodeKind = 'trap' | 'skill' | 'cue' | 'tool' | 'environment' | 'prerequisite' | 'mitigation';
```

**Relation types (locked vocabulary):**
```typescript
type GraphRelationType = 'mitigates' | 'requires' | 'order' | 'risk-blocks' | 'co-occurs-with';
type GraphRelationStrength = 'hard' | 'soft';
```

**Hard-edge projection rule (D-05):**
- `requires` and `risk-blocks` with `strength='hard'` go into DAG projection
- `order`, `co-occurs-with`, and soft edges stay out of DAG

### Existing capsule-native structures that can be reused

**CapsuleMatch contains plan-useful fields:**
```typescript
{
  capsuleId, artifactId, revision, sourcePaths,
  content,        // distilled capsule text (already governance-filtered)
  situation,      // e.g., "deploying containers"
  problem,        // e.g., "permission denied error"
  goal,           // e.g., "fix permissions"
  errorText,      // optional, for error-specific capsules
  labels, scope, requiredLevel,
  score, reason
}
```

**ProfileHint provides artifact-level context:**
```typescript
{ artifactId, title, slug, labels }
```

**Activation hints already exist:**
- `buildAllActivationHints(capsules, artifacts)` in `assembly.ts:188`
- Returns `CapsuleActivationHints[]` with readNext references, assets, scripts metadata

---

## GraSP Paper Constraints (from CONTEXT.md)

The CONTEXT.md documents key GraSP-inspired constraints that must drive the compiler design:

| Constraint | Implication for Phase 37 |
|------------|-------------------------|
| "typed DAG compiler" answering "how do these pieces depend on each other?" | Output must be a graph/plan, not a flat list |
| "executable nodes carry schema, bound arguments, verifier info" | Skill nodes must expose prerequisites, expected effects, activation affordances |
| "separate hard dependency edges from softer order edges" | Preserve distinction: `requires`/`risk-blocks` (hard) vs `order`/`mitigates` (soft) |
| "localize failure impact to descendants" | Emit graph shape that supports future repair operators |
| "small focused skill set outperforms comprehensive documentation" | Default to 2-3 skill nodes unless evidence requires more |

---

## Library Stack (Phase 36 selection, no new imports needed)

| Package | Version | Key APIs for Phase 37 |
|---------|---------|----------------------|
| `graphology` | 0.26.0 | Core directed graph, `mergeNode`, `mergeEdgeWithKey`, `getNodeAttribute`, `getEdgeAttributes` |
| `graphology-dag` | 0.4.1 | `topologicalSort(graph)`, `topologicalGenerations(graph)`, `hasCycle(graph)` |
| `graphology-operators` | 1.6.1 | `subgraph(graph, nodeIds)` -- extract focused subgraph |
| `graphology-shortest-path` | 2.1.0 | `singleSourceLength(graph, seedId)` -- bounded reachability |

**Verified API surface from installed packages:**
```typescript
// graphology-dag
export function topologicalSort(graph: Graph): string[];
export function topologicalGenerations(graph: Graph): string[][];
export function hasCycle(graph: Graph): boolean;

// graphology-operators
export { default as subgraph } from './subgraph';

// graphology-shortest-path
export { singleSourceLength } from './unweighted';
```

---

## Architectural Gaps to Address

### Gap 1: No unified plan schema exists

**Current state:** No `blockingTraps`, `recommendedSkills`, `edges`, `citations` output shape in contracts.

**Decision needed:** Define plan output schema. CONTEXT.md suggests:
```typescript
interface TrapFirstPlan {
  blockingTraps: PlanTrapNode[];
  recommendedSkills: PlanSkillNode[];
  edges: PlanEdge[];
  citations: RetrievalCitation[];
}
```

**Placement:** Likely new file in `packages/contracts/src/domain/retrieval.ts` or new `plans.ts`.

### Gap 2: No cross-world retrieval coordination

**Current state:** `searchKnowledge()` and `searchKnowledgeV2()` are independent.

**Approach:** Phase 37 should create a **new compiler module** that:
1. Calls both retrieval surfaces (or reuses their internal recall functions)
2. Merges candidates into a unified candidate set
3. Extracts graph nodes from candidates using existing extractors
4. Builds a local expansion view around candidate nodes
5. Emits a focused plan

### Gap 3: Trap-first ordering not enforced anywhere

**Current state:** Results are ranked by score, not by "is this a blocker?"

**GraSP requirement:** "Trap handling must come first: blockers and guardrails should be surfaced before skill recommendations."

**Implementation:** The compiler must:
1. Identify trap nodes with `risk-blocks` outgoing edges (hard)
2. Promote these to `blockingTraps` section first
3. Then add skill nodes that `mitigates` those traps
4. Finally add supporting skills with soft edges

### Gap 4: Skill budget enforcement not implemented

**Current state:** `maxResults` applies per-endpoint, not across the merged plan.

**GraSP requirement:** "Prefer 2-3 focused skill nodes by default unless the evidence clearly requires more."

**Implementation:** Add a **score-compression step** that:
1. Starts with a skill budget (default 3)
2. Prioritizes skills that directly mitigate identified traps
3. Adds supporting skills only if they have strong edge evidence
4. Demotes remaining skills to citations

---

## Data Flow for the Compiler

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QUERY TIME                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   query.seed ─────────────────────────────────────────────────────┐         │
│                                                                    │         │
│   ┌─────────────────────────┐     ┌─────────────────────────┐     │         │
│   │ searchKnowledge (v1)    │     │ searchKnowledgeV2       │     │         │
│   │ - graph-assisted mode   │     │ - capsule ranking       │     │         │
│   │ - trap candidates       │     │ - skill candidates      │     │         │
│   └───────────┬─────────────┘     └───────────┬─────────────┘     │         │
│               │                               │                    │         │
│               └───────────────┬───────────────┘                    │         │
│                               │                                    │         │
│                               ▼                                    │         │
│               ┌─────────────────────────────────┐                  │         │
│               │   MERGE CANDIDATES              │                  │         │
│               │   - Intersect with governance   │                  │         │
│               │   - Dedupe by sourceId          │                  │         │
│               └───────────────┬─────────────────┘                  │         │
│                               │                                    │         │
│   ┌───────────────────────────┴───────────────────────────┐        │         │
│   │                                                       │        │         │
│   │   getGraphIndexDocuments(data)                        │        │         │
│   │   buildGraphFromDocuments(docs)                       │        │         │
│   │                                                       │        │         │
│   └───────────────────────────┬───────────────────────────┘        │         │
│                               │                                    │         │
│                               ▼                                    │         │
│               ┌─────────────────────────────────┐                  │         │
│               │   BUILD LOCAL EXPANSION VIEW    │                  │         │
│               │   - Seed from candidate nodes   │                  │         │
│               │   - maxDepth: 2 (default)       │                  │         │
│               │   - Extract subgraph            │                  │         │
│               └───────────────┬─────────────────┘                  │         │
│                               │                                    │         │
│                               ▼                                    │         │
│               ┌─────────────────────────────────┐                  │         │
│               │   COMPILE TRAP-FIRST PLAN       │                  │         │
│               │   1. Find nodes with risk-blocks│                  │         │
│               │   2. Promote to blockingTraps  │                  │         │
│               │   3. Find mitigates edges       │                  │         │
│               │   4. Add recommendedSkills      │                  │         │
│               │   5. Apply skill budget         │                  │         │
│               │   6. Build typed edges          │                  │         │
│               │   7. Attach citations           │                  │         │
│               └───────────────┬─────────────────┘                  │         │
│                               │                                    │         │
│                               ▼                                    │         │
│               ┌─────────────────────────────────┐                  │         │
│               │   TrapFirstPlan                 │                  │         │
│               │   - blockingTraps: []           │                  │         │
│               │   - recommendedSkills: []       │                  │         │
│               │   - edges: []                   │                  │         │
│               │   - citations: []               │                  │         │
│               └─────────────────────────────────┘                  │         │
│                                                                    │         │
└────────────────────────────────────────────────────────────────────┴─────────┘
```

---

## Key Files to Modify/Create

### New files (likely):
| File | Purpose |
|------|---------|
| `packages/server/src/lib/retrieval/plan-compiler.ts` | Core compiler: merge candidates, build plan, apply budget |
| `packages/server/src/lib/retrieval/plan-compiler.test.ts` | TDD tests for compiler behavior |
| `packages/contracts/src/domain/plans.ts` | Plan output schema (TrapFirstPlan, PlanNode, PlanEdge) |

### Modified files (likely):
| File | Purpose |
|------|---------|
| `packages/server/src/routes/retrieval.ts` | Add new `/v3/plan` endpoint or extend existing modes |
| `packages/contracts/src/index.ts` | Export new plan types |

### Existing files to reuse (no modification):
| File | Reuse Pattern |
|------|---------------|
| `packages/server/src/lib/indexing/graph-lite/graphology.ts` | `buildGraphFromDocuments`, `buildLocalExpansionView` |
| `packages/server/src/lib/indexing/graph-lite/store.ts` | `getGraphIndexDocuments` |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Internal recall functions (may need to extract more helpers) |
| `packages/server/src/lib/retrieval/assembly.ts` | `buildAllActivationHints` for skill node metadata |
| `packages/server/src/lib/retrieval/capsule-recall.ts` | `rankCapsules` for skill candidate generation |

---

## Edge Classification for Compiler Logic

| Relation Type | Strength | Compiler Treatment |
|---------------|----------|-------------------|
| `risk-blocks` | hard | **Blocker**: Source trap MUST be in `blockingTraps` |
| `risk-blocks` | soft | **Warning**: Include in `blockingTraps` with lower priority |
| `mitigates` | hard | **Required skill**: MUST be in `recommendedSkills` |
| `mitigates` | soft | **Suggested skill**: Include if within budget |
| `requires` | hard | **Dependency edge**: `skill A -> requires -> skill B` |
| `requires` | soft | **Ordering hint**: `order` edge |
| `order` | any | **Temporal precedence**: Soft ordering constraint |
| `co-occurs-with` | any | **Supporting evidence**: Promote to citation only |

---

## Test Scenarios to Cover

### TDD scenarios (expected):

1. **Empty plan when no candidates match query**
   - Input: query with no trap/skill matches
   - Output: `{ blockingTraps: [], recommendedSkills: [], edges: [], citations: [] }`

2. **Trap-first ordering: blockers before skills**
   - Input: candidates with both traps and skills
   - Output: `blockingTraps` populated before `recommendedSkills`

3. **Hard blockers are mandatory**
   - Input: trap with `risk-blocks` hard edge to error cue
   - Output: trap in `blockingTraps` with `severity: 'hard'`

4. **Skill budget enforced**
   - Input: 10 skill candidates, budget of 3
   - Output: Exactly 3 in `recommendedSkills`, rest in `citations`

5. **Mitigation edges link traps to skills**
   - Input: skill with `mitigates` hard edge to trap
   - Output: Edge `{ source: skillId, target: trapId, type: 'mitigates', strength: 'hard' }`

6. **Governance filter applied to plan output**
   - Input: candidate outside user's security level
   - Output: Not in plan, even if graph-connected

7. **Local expansion bounded**
   - Input: Deep graph chain
   - Output: Only nodes within `maxDepth` of candidates included

8. **Citations reuse already-filtered sources**
   - Input: Demoted candidates
   - Output: Citations reference only governance-approved entries

---

## Out of Scope (from CONTEXT.md)

| Feature | Reason |
|---------|--------|
| Public contract hardening for final response shape | Deferred to later phase |
| Confidence routing and fallback to legacy paths | Phase 38 handles routing |
| Global/community graph queries | Requires auth model changes |
| Prompt-heavy answer generation | Not a synthesis engine |
| Importing a whole planning framework | Use graphology only |

---

## Dependencies and Risks

### Dependencies:
- **Phase 36**: Must be complete enough to read `graphIndexDocuments`. Currently P36-03 is incomplete (missing startup hook) but core graph infrastructure is usable.
- **Existing retrieval surfaces**: Must be callable from compiler without breaking backward compatibility.

### Risks:
| Risk | Mitigation |
|------|------------|
| Graph documents may not have enough edges to build meaningful plans | Start with trap-only plans; skill edges are additive |
| Budget enforcement may drop important skills | Use edge strength to prioritize; make budget configurable |
| Governance filtering may disconnect graph paths | Apply governance before graph assembly; document limitation |

---

## Questions for Planning Phase

1. **Should the compiler be a new endpoint (`/v3/plan`) or an extended mode of `/v1/retrieval`?**
   - CONTEXT.md suggests "compile governed trap and skill retrieval candidates" -- implies a new orchestrator surface
   - Recommendation: New `/v3/plan` endpoint to avoid v1 backward compatibility constraints

2. **What is the default skill budget?**
   - GraSP says 2-3 focused skills
   - Recommendation: Default 3, configurable via query param

3. **How should soft-blockers be presented?**
   - They're warnings, not hard stops
   - Recommendation: Include in `blockingTraps` with `severity: 'soft'`

4. **Should the plan include full capsule content or just references?**
   - Capsule content is up to 5000 chars (could bloat response)
   - Recommendation: Include `situation/problem/goal` summary only; full content via activation hints

---

## Sources

- [Graphology GitHub](https://github.com/graphology/graphology)
- [Graphology Standard Library Docs](https://graphology.github.io/standard-library/)
- [graphology-dag NPM](https://www.npmjs.com/package/graphology-dag)
- GraSP paper reference: arXiv:2503.14127 (GraSP: Graph-based Skill Planning) -- rate limited, referenced from CONTEXT.md

---

*Research completed: 2026-04-25*
