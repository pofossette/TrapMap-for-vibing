# Phase 37: GraphRAG-lite Retrieval Compiler for Trap-First Skill Plans - Patterns

**Created:** 2026-04-25
**Source:** 37-CONTEXT.md, 37-RESEARCH.md

---

## Files to Create/Modify

### Summary

| File | Action | Role |
|------|--------|------|
| `packages/contracts/src/domain/plans.ts` | **CREATE** | Output schema contracts |
| `packages/server/src/lib/retrieval/plan-compiler.ts` | **CREATE** | Core compiler logic |
| `packages/server/src/lib/retrieval/plan-compiler.test.ts` | **CREATE** | TDD test suite |
| `packages/server/src/routes/retrieval.ts` | **MODIFY** | Add `/v3/plan` endpoint |
| `packages/contracts/src/index.ts` | **MODIFY** | Export plan types |

---

## File: `packages/contracts/src/domain/plans.ts` (CREATE)

### Role: Output schema contracts

**Data flow:** Compiler output → Route response → Client

### Closest Analog: `packages/contracts/src/domain/retrieval.ts`

The retrieval contracts file defines the canonical schema shapes for v1 and v2 retrieval responses. The plans schema follows the same patterns:

- Zod schemas with JSDoc comments
- Type exports via `z.infer`
- Governance inheritance fields (scope, requiredLevel)
- Score and reason fields for ranking transparency

### Pattern Excerpts

**Schema structure with governance fields:**
```typescript
// From retrieval.ts:96-125 (CapsuleMatch)
export const capsuleMatchSchema = z.object({
  /** Capsule identifier */
  capsuleId: entityIdSchema,
  /** Parent artifact identifier */
  artifactId: entityIdSchema,
  /** Revision number this capsule was derived from */
  revision: z.number().int().min(1),
  /** Source file paths that contributed to this capsule */
  sourcePaths: z.array(z.string().max(512)).min(1),
  /** Distilled capsule content */
  content: z.string().min(1).max(5000),
  /** Situation context */
  situation: z.string().min(1).max(1000),
  /** Problem statement */
  problem: z.string().min(1).max(1000),
  /** Goal or solution */
  goal: z.string().min(1).max(1000),
  /** Optional error text for error-specific capsules */
  errorText: z.string().max(500).optional(),
  /** Searchable labels */
  labels: z.array(labelSchema).min(1),
  /** Governance scope (inherited from artifact root) */
  scope: scopeSchema,
  /** Required security level (inherited from artifact root) */
  requiredLevel: securityLevelSchema,
  /** Final ranking score after all boosts applied */
  score: z.number().min(0).max(1),
  /** Human-readable explanation of why this capsule matched */
  reason: z.string().min(1),
});
```

**Type export pattern:**
```typescript
// From retrieval.ts:178
export type CapsuleMatch = z.infer<typeof capsuleMatchSchema>;
```

**Edge classification pattern (from documents.ts:27-33):**
```typescript
/**
 * Typed relation vocabulary for the GraphRAG-lite index.
 */
export type GraphRelationType = 'mitigates' | 'requires' | 'order' | 'risk-blocks' | 'co-occurs-with';

/**
 * Edge strength distinguishing hard dependencies from soft precedence.
 * GraSP: hard edges must be respected by the compiler; soft edges may be reordered.
 */
export type GraphRelationStrength = 'hard' | 'soft';
```

### Recommended Schema for `plans.ts`

```typescript
import { z } from 'zod';
import { entityIdSchema, labelSchema, scopeSchema, securityLevelSchema } from './common.js';

/**
 * Plan edge relation types (reuse from GraphRAG-lite vocabulary).
 */
export const planEdgeTypeSchema = z.enum([
  'risk-blocks',
  'mitigates',
  'requires',
  'order',
]);

export type PlanEdgeType = z.infer<typeof planEdgeTypeSchema>;

/**
 * Edge strength for plan edges.
 */
export const planEdgeStrengthSchema = z.enum(['hard', 'soft']);

export type PlanEdgeStrength = z.infer<typeof planEdgeStrengthSchema>;

/**
 * A trap node in the execution plan.
 * Represents a blocker or guardrail that must be addressed.
 */
export const planTrapNodeSchema = z.object({
  /** Node identifier (matches graph node id) */
  nodeId: entityIdSchema,
  /** Source entry or artifact identifier */
  sourceId: entityIdSchema,
  /** Human-readable label */
  label: z.string().min(1).max(280),
  /** Whether this is a hard blocker (must resolve) or soft warning */
  severity: planEdgeStrengthSchema,
  /** Governance scope */
  scope: scopeSchema,
  /** Required security level */
  requiredLevel: securityLevelSchema,
  /** Evidence text justifying this trap */
  evidence: z.string().min(1),
  /** Score relevance to query */
  score: z.number().min(0).max(1),
});

/**
 * A skill node in the execution plan.
 * Represents a recommended action or knowledge reference.
 */
export const planSkillNodeSchema = z.object({
  /** Node identifier (matches graph node id) */
  nodeId: entityIdSchema,
  /** Source artifact identifier */
  artifactId: entityIdSchema,
  /** Optional capsule identifier if derived from capsule */
  capsuleId: entityIdSchema.optional(),
  /** Human-readable label (situation summary) */
  label: z.string().min(1).max(280),
  /** Situation context */
  situation: z.string().min(1).max(1000),
  /** Problem statement */
  problem: z.string().min(1).max(1000),
  /** Goal or solution */
  goal: z.string().min(1).max(1000),
  /** Governance scope */
  scope: scopeSchema,
  /** Required security level */
  requiredLevel: securityLevelSchema,
  /** Score relevance to query */
  score: z.number().min(0).max(1),
});

/**
 * A typed edge between plan nodes.
 */
export const planEdgeSchema = z.object({
  /** Unique edge identifier */
  id: entityIdSchema,
  /** Source node id */
  sourceNodeId: entityIdSchema,
  /** Target node id */
  targetNodeId: entityIdSchema,
  /** Edge relation type */
  type: planEdgeTypeSchema,
  /** Edge strength */
  strength: planEdgeStrengthSchema,
});

/**
 * Citation for supporting evidence not promoted to plan nodes.
 */
export const planCitationSchema = z.object({
  /** Source entry or artifact identifier */
  sourceId: entityIdSchema,
  /** Source type */
  sourceKind: z.enum(['trap', 'skill']),
  /** Human-readable label */
  label: z.string().min(1).max(280),
  /** Governance scope */
  scope: scopeSchema,
  /** Relevance score */
  score: z.number().min(0).max(1),
});

/**
 * Trap-first execution plan (Phase 37 output).
 * A minimal typed graph with blockers surfaced first.
 */
export const trapFirstPlanSchema = z.object({
  /** Traps that block or warn about execution */
  blockingTraps: z.array(planTrapNodeSchema).default([]),
  /** Recommended skills to apply */
  recommendedSkills: z.array(planSkillNodeSchema).default([]),
  /** Typed edges between nodes */
  edges: z.array(planEdgeSchema).default([]),
  /** Supporting evidence not promoted to nodes */
  citations: z.array(planCitationSchema).default([]),
});

/**
 * Query schema for plan compilation.
 */
export const planQuerySchema = z.object({
  /** Natural-language seed string */
  seed: z.string().min(1).max(2000),
  /** Maximum number of skills to recommend */
  skillBudget: z.number().int().min(1).max(10).default(3),
  /** Maximum graph expansion depth */
  maxDepth: z.number().int().min(1).max(5).default(2),
});

export type PlanTrapNode = z.infer<typeof planTrapNodeSchema>;
export type PlanSkillNode = z.infer<typeof planSkillNodeSchema>;
export type PlanEdge = z.infer<typeof planEdgeSchema>;
export type PlanCitation = z.infer<typeof planCitationSchema>;
export type TrapFirstPlan = z.infer<typeof trapFirstPlanSchema>;
export type PlanQuery = z.infer<typeof planQuerySchema>;
```

---

## File: `packages/server/src/lib/retrieval/plan-compiler.ts` (CREATE)

### Role: Core compiler logic

**Data flow:**
1. Query seed → Intent parsing (reuse `parseSeedIntent`)
2. Retrieval calls → `searchKnowledge` (traps) + `searchKnowledgeV2` (skills)
3. Graph loading → `getGraphIndexDocuments` + `buildGraphFromDocuments`
4. Local expansion → `buildLocalExpansionView`
5. Plan compilation → `TrapFirstPlan` output

### Closest Analog: `packages/server/src/lib/retrieval/skill-lookup.ts`

The skill-lookup module demonstrates the pattern of:
- Reusing existing retrieval surfaces (`rankCapsules`, `isArtifactGovernanceEligible`)
- Building governance filters from auth context
- Pipeline-style processing with early returns
- Deduplication and limiting logic

### Pattern Excerpts

**Module header and imports:**
```typescript
// From skill-lookup.ts:1-24
/**
 * Skill lookup helper for Phase 18 CLI skill search-by-content command (SKED-01).
 * Provides artifact-first search by ranking governed capsules and collapsing to unique artifacts.
 *
 * Reuses existing capsule ranking and governance patterns from Phase 14:
 * - rankCapsules: content-based ranking with intent signals
 * - isArtifactGovernanceEligible: approval/team/level filtering
 * - parseSeedIntent: seed-to-intent parsing
 */

import type {
  SkillLookupQuery,
  SkillLookupResponse,
  SkillLookupResultItem,
  SkillSourceKind,
} from '@trapmap/contracts';
import { skillLookupQuerySchema } from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import type { SkillArtifactRecord } from '../store.js';
import { isArtifactGovernanceEligible, rankCapsules } from './capsule-recall.js';
import { parseSeedIntent } from './intent.js';
import type { CapsuleCandidate } from './types.js';
```

**Governance filter pattern:**
```typescript
// From skill-lookup.ts:114-127
// Build governance filters from auth context (T-14-04 pattern)
const governanceFilters = {
  teamId: auth.activeTeamId,
  securityLevel: auth.securityLevel,
  isSystemAdmin: auth.subjectType === 'system-admin',
};

// Get governed artifacts
const artifacts = data.skillArtifacts ?? [];

// Pre-filter artifacts by governance before capsule ranking
const governedArtifacts = artifacts.filter((artifact) =>
  isArtifactGovernanceEligible(artifact, governanceFilters),
);

// Early return if no governed artifacts
if (governedArtifacts.length === 0) {
  return { matches: [] };
}
```

**Ranking and limiting pattern:**
```typescript
// From skill-lookup.ts:136-159
// Rank capsules against parsed intent (CAPS-04)
// Request more results than needed to allow for dedupe
const rankedCandidates = rankCapsules(
  governedArtifacts,
  intent,
  governanceFilters,
  parsed.maxResults * 3,
);

// Dedupe to unique artifacts
const uniqueCandidates = dedupeByArtifactId(rankedCandidates);

// Limit to maxResults
const limitedCandidates = uniqueCandidates.slice(0, parsed.maxResults);

// Build lookup result items
const matches: SkillLookupResultItem[] = [];

for (const candidate of limitedCandidates) {
  const artifact = governedArtifacts.find((a) => a.id === candidate.artifactId);
  if (artifact) {
    matches.push(buildLookupItem(artifact, candidate));
  }
}

return { matches };
```

**Graphology usage pattern (from graphology.ts):**
```typescript
// From graphology.ts:129-155
export function buildLocalExpansionView(params: LocalExpansionParams): Graph {
  const { documents, seedNodeIds, maxDepth } = params;
  const graph = buildGraphFromDocuments(documents);

  const reachableNodeIds = new Set<string>();

  for (const seedId of seedNodeIds) {
    // Always include seed nodes even if not in graph
    if (graph.hasNode(seedId)) {
      reachableNodeIds.add(seedId);
    } else {
      continue;
    }

    // Get shortest path lengths from this seed
    const distances = singleSourceLength(graph, seedId);

    for (const [nodeId, distance] of Object.entries(distances)) {
      if (distance !== null && distance <= maxDepth) {
        reachableNodeIds.add(nodeId);
      }
    }
  }

  // Return subgraph containing only reachable nodes
  return subgraph(graph, reachableNodeIds);
}
```

### Recommended Structure for `plan-compiler.ts`

```typescript
/**
 * Trap-first plan compiler for Phase 37 GraphRAG-lite retrieval.
 * Merges trap and skill candidates into a minimal typed execution plan.
 *
 * Reuses existing retrieval surfaces and graph infrastructure:
 * - searchKnowledge: trap candidate retrieval (v1)
 * - searchKnowledgeV2: skill candidate retrieval (v2)
 * - buildLocalExpansionView: bounded graph expansion
 * - isArtifactGovernanceEligible: governance filtering
 */

import type {
  PlanQuery,
  TrapFirstPlan,
  PlanTrapNode,
  PlanSkillNode,
  PlanEdge,
  PlanCitation,
} from '@trapmap/contracts';
import { planQuerySchema } from '@trapmap/contracts';
import Graph from 'graphology';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import type { GraphIndexDocumentRecord, GraphNodeRecord } from '../indexing/graph-lite/documents.js';
import { buildGraphFromDocuments, buildLocalExpansionView } from '../indexing/graph-lite/graphology.js';
import { getGraphIndexDocuments } from '../indexing/graph-lite/store.js';
import { filterEligibleEntries } from './filters.js';
import { parseSeedIntent } from './intent.js';
import type { CapsuleCandidate } from './types.js';

// Constants
const DEFAULT_SKILL_BUDGET = 3;
const DEFAULT_MAX_DEPTH = 2;

/**
 * Compile a trap-first execution plan from a query seed.
 *
 * Pipeline:
 * 1. Parse seed intent
 * 2. Retrieve trap candidates (v1)
 * 3. Retrieve skill candidates (v2)
 * 4. Load graph documents and build local expansion
 * 5. Identify blocking traps (risk-blocks edges)
 * 6. Find mitigating skills
 * 7. Apply skill budget
 * 8. Build plan output
 */
export async function compileTrapFirstPlan(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: PlanQuery,
): Promise<TrapFirstPlan> {
  // ... implementation
}

/**
 * Extract seed node IDs from trap and skill candidates.
 */
function extractSeedNodeIds(
  trapCandidates: ScoredEntry[],
  skillCandidates: CapsuleCandidate[],
): string[] {
  // ... implementation
}

/**
 * Identify trap nodes with risk-blocks edges.
 */
function findBlockingTraps(
  graph: Graph,
  allNodes: GraphNodeRecord[],
): PlanTrapNode[] {
  // ... implementation
}

/**
 * Find skills that mitigate identified traps.
 */
function findMitigatingSkills(
  graph: Graph,
  trapNodeIds: string[],
): string[] {
  // ... implementation
}

/**
 * Apply skill budget, prioritizing trap-mitigating skills.
 */
function applySkillBudget(
  candidates: CapsuleCandidate[],
  mitigatingSkillIds: string[],
  budget: number,
): CapsuleCandidate[] {
  // ... implementation
}

/**
 * Build plan edges from graph edges.
 */
function buildPlanEdges(graph: Graph): PlanEdge[] {
  // ... implementation
}
```

---

## File: `packages/server/src/lib/retrieval/plan-compiler.test.ts` (CREATE)

### Role: TDD test suite

**Data flow:** Test fixtures → Compiler functions → Assertions

### Closest Analog: `packages/server/src/lib/indexing/graph-lite/graphology.test.ts`

The graphology test demonstrates the pattern for testing graph operations:

### Pattern Excerpts

**Test file header:**
```typescript
// From graphology.test.ts:1-9
import { describe, it, expect } from 'vitest';
import {
  buildGraphFromDocuments,
  projectHardDependencyGraph,
  assertNoHardDependencyCycles,
  buildLocalExpansionView,
} from './graphology.js';
import type { GraphIndexDocumentRecord, GraphNodeRecord, GraphEdgeRecord } from './documents.js';
```

**Test factory function:**
```typescript
// From graphology.test.ts:10-33
function makeDoc(
  id: string,
  sourceType: 'trap' | 'skill',
  sourceId: string,
  revision: number,
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
): GraphIndexDocumentRecord {
  return {
    id,
    sourceType,
    sourceId,
    revision,
    contentHash: 'hash-' + id,
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    nodes,
    edges,
    evidence: 'test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}
```

**Test structure with nested describes:**
```typescript
// From graphology.test.ts:35-78
describe('graph-lite/graphology', () => {
  describe('buildGraphFromDocuments', () => {
    it('assembles multiple graph documents into stable graphology node and edge keys', () => {
      const nodes1: GraphNodeRecord[] = [
        { id: 'trap:entry-1', kind: 'trap', label: 'corruption', evidence: 'test' },
      ];
      // ... test body
    });
  });

  describe('projectHardDependencyGraph', () => {
    it('projects only hard requires and hard risk-blocks edges', () => {
      // ... test body
    });
  });
});
```

**Edge classification test pattern:**
```typescript
// From graphology.test.ts:89-141
it('projects only hard requires and hard risk-blocks edges', () => {
  const nodes: GraphNodeRecord[] = [
    { id: 'skill:a', kind: 'skill', label: 'A', evidence: 'test' },
    { id: 'skill:b', kind: 'skill', label: 'B', evidence: 'test' },
    { id: 'skill:c', kind: 'skill', label: 'C', evidence: 'test' },
    { id: 'skill:d', kind: 'skill', label: 'D', evidence: 'test' },
  ];
  const edges: GraphEdgeRecord[] = [
    {
      id: 'a->b:requires',
      sourceNodeId: 'skill:a',
      targetNodeId: 'skill:b',
      relationType: 'requires',
      strength: 'hard',
      evidence: 'hard dependency',
    },
    // ... more edges
  ];

  const doc = makeDoc('doc', 'skill', 'art-1', 1, nodes, edges);
  const hardGraph = projectHardDependencyGraph([doc]);

  // Assertions for what IS in the DAG
  expect(hardGraph.hasEdge('a->b:requires')).toBe(true);
  expect(hardGraph.hasEdge('b->c:risk-blocks')).toBe(true);
  // Assertions for what is NOT in the DAG
  expect(hardGraph.hasEdge('c->d:order')).toBe(false);
  expect(hardGraph.hasEdge('a->d:mitigates')).toBe(false);
});
```

### Recommended Test Scenarios (from RESEARCH.md)

```typescript
describe('plan-compiler', () => {
  describe('compileTrapFirstPlan', () => {
    it('returns empty plan when no candidates match query', () => {
      // Input: query with no trap/skill matches
      // Output: { blockingTraps: [], recommendedSkills: [], edges: [], citations: [] }
    });

    it('surfaces blocking traps before recommended skills', () => {
      // Input: candidates with both traps and skills
      // Output: blockingTraps populated before recommendedSkills
    });

    it('promotes hard blockers as mandatory', () => {
      // Input: trap with risk-blocks hard edge to error cue
      // Output: trap in blockingTraps with severity: 'hard'
    });

    it('enforces skill budget', () => {
      // Input: 10 skill candidates, budget of 3
      // Output: Exactly 3 in recommendedSkills, rest in citations
    });

    it('links traps to mitigating skills via edges', () => {
      // Input: skill with mitigates hard edge to trap
      // Output: Edge { source: skillId, target: trapId, type: 'mitigates', strength: 'hard' }
    });

    it('applies governance filter to plan output', () => {
      // Input: candidate outside user's security level
      // Output: Not in plan, even if graph-connected
    });

    it('bounds local expansion by maxDepth', () => {
      // Input: Deep graph chain
      // Output: Only nodes within maxDepth of candidates included
    });

    it('citations reference only governance-approved sources', () => {
      // Input: Demoted candidates
      // Output: Citations reference only governance-approved entries
    });
  });
});
```

---

## File: `packages/server/src/routes/retrieval.ts` (MODIFY)

### Role: Add `/v3/plan` endpoint

**Data flow:** HTTP request → Auth → Compiler → Response

### Closest Analog: Existing route handlers in same file

### Pattern Excerpts

**Route handler pattern:**
```typescript
// From retrieval.ts:22-47
app.post('/v1/retrieval/search', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);

  // Enforce knowledge:search permission
  requirePermission(auth, 'knowledge:search');

  // Parse and validate query
  const query = retrievalQuerySchema.parse(request.body);

  // Execute retrieval search
  const result = await searchKnowledge(app.skillShareer, auth, query);

  // Log user operation (fire-and-forget)
  void logUserOperation(app.skillShareer.config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'search',
    targetId: null,
    teamId: auth.activeTeamId,
    metadata: { endpoint: 'v1-retrieval-search', resultCount: result.globalConstraints.length + result.projectKnowledge.length },
  });

  // Validate and return response
  return retrievalResponseSchema.parse(result);
});
```

**Import pattern for new schemas:**
```typescript
// From retrieval.ts:1-10
import type { FastifyPluginAsync } from 'fastify';

import {
  retrievalQuerySchema,
  retrievalResponseSchema,
  retrievalV2QuerySchema,
  retrievalV2ResponseWithHintsSchema,
  skillLookupQuerySchema,
  skillLookupResponseSchema,
} from '@trapmap/contracts';
```

### Recommended Addition

```typescript
// Add to imports
import {
  // ... existing imports
  planQuerySchema,
  trapFirstPlanSchema,
} from '@trapmap/contracts';

// Add new route
// Phase 37: Trap-first plan compilation (PLAN-01)
// Returns minimal typed execution plan instead of flat result list
app.post('/v3/retrieval/plan', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);

  // Enforce knowledge:search permission
  requirePermission(auth, 'knowledge:search');

  // Parse and validate plan query
  const query = planQuerySchema.parse(request.body);

  // Compile trap-first plan
  const result = await compileTrapFirstPlan(app.skillShareer, auth, query);

  // Log user operation (fire-and-forget)
  void logUserOperation(app.skillShareer.config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'plan',
    targetId: null,
    teamId: auth.activeTeamId,
    metadata: {
      endpoint: 'v3-retrieval-plan',
      trapCount: result.blockingTraps.length,
      skillCount: result.recommendedSkills.length,
    },
  });

  // Validate and return plan
  return trapFirstPlanSchema.parse(result);
});
```

---

## File: `packages/contracts/src/index.ts` (MODIFY)

### Role: Export new plan types

### Pattern Excerpts

```typescript
// From index.ts:1-13
export * from './domain/artifacts.js';
export * from './domain/auth.js';
export * from './domain/candidates.js';
export * from './domain/common.js';
export * from './domain/evals/retrieval.js';
export * from './domain/evals/report.js';
export * from './domain/evals/summary.js';
export * from './domain/knowledge.js';
export * from './domain/operations.js';
export * from './domain/path-validation.js';
export * from './domain/retrieval.js';
export * from './domain/review.js';
export * from './domain/team.js';
```

### Recommended Addition

```typescript
export * from './domain/plans.js';
```

---

## Key Reuse Patterns Summary

| Existing Module | Reuse Pattern |
|-----------------|---------------|
| `capsule-recall.ts` | `isArtifactGovernanceEligible`, `rankCapsules` for skill candidate generation |
| `filters.ts` | `filterEligibleEntries` for trap candidate filtering |
| `intent.ts` | `parseSeedIntent` for seed-to-intent decomposition |
| `graphology.ts` | `buildGraphFromDocuments`, `buildLocalExpansionView` for graph operations |
| `store.ts` | `getGraphIndexDocuments` for loading persisted graph data |
| `assembly.ts` | `buildAllActivationHints` for skill node activation metadata |
| `rbac.ts` | `requirePermission` for route authorization |
| `session.ts` | `resolveAuthContext` for route authentication |

---

## Edge Classification Reference (from RESEARCH.md)

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

## Test Scenarios Checklist (from RESEARCH.md)

1. [ ] Empty plan when no candidates match query
2. [ ] Trap-first ordering: blockers before skills
3. [ ] Hard blockers are mandatory
4. [ ] Skill budget enforced
5. [ ] Mitigation edges link traps to skills
6. [ ] Governance filter applied to plan output
7. [ ] Local expansion bounded by maxDepth
8. [ ] Citations reuse already-filtered sources