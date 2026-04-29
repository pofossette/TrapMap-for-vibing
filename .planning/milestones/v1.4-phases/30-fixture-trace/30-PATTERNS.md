# Phase 30: Fixture Trace - Pattern Mapping

**Generated:** 2026-04-24
**Status:** Ready for implementation planning

This document maps each file to be created/modified to its closest existing analog, extracts concrete code excerpts, and defines the implementation approach.

---

## Files to Create/Modify

### 1. `evals/retrieval/lib/adapters.ts` (MODIFY)

**Role:** Scenario fixture materialization
**Data Flow:** Scenario → Store transact → Knowledge entries + Artifacts → Execution context ready

#### Gap (Current Placeholder)

```typescript
// evals/retrieval/lib/adapters.ts:141-152
export async function seedScenarioFixtures(
  ctx: ExecutionContext,
  case_: RetrievalEvalCase,
): Promise<void> {
  // For Phase 26-01, we use a simplified fixture seeding approach.
  // The actual scenario fixtures would be materialized in a full implementation.
  // For now, we rely on the in-process server with its default test configuration.

  // The scenario is referenced by case.scenarioId, but fixture materialization
  // would require loading the scenario and populating the store.
  // This is a placeholder for the full implementation.
}
```

#### Closest Analog: `packages/server/src/lib/retrieval.test.ts`

**Store seeding pattern:**

```typescript
// packages/server/src/lib/retrieval.test.ts:76-103
await mockStore.transact(async (data) => {
  // Approved global constraint
  const globalEntry = createKnowledgeEntryRecord({
    store: mockStore,
    data,
    ownerUserId: 'user_2',
    teamId: null,
    payload: {
      scope: 'global',
      labels: ['security', 'auth'],
      shortcut: 'Always validate JWT tokens',
      detail: 'JWT tokens must be validated on every request...',
    },
    requiredLevel: 3,
    createdAt,
    preReview: await runPreReview({...}),
  });
  globalEntry.lifecycleState = 'approved';
  data.knowledgeEntries.push(globalEntry);
  // ... more entries
});
```

**Key Insight:** Direct `data.knowledgeEntries.push()` after `createKnowledgeEntryRecord`. Lifecycle state set directly on the record after creation. Uses `runPreReview()` for agent review simulation.

#### Closest Analog: `evals/retrieval/lib/load.ts`

**Scenario loading pattern:**

```typescript
// evals/retrieval/lib/load.ts:47-57
export function loadScenario(scenarioId: string): RetrievalEvalScenario | undefined {
  // Check smoke scenarios first
  const smokeScenario = smokeScenariosMap[scenarioId];
  if (smokeScenario) return smokeScenario;

  // Check core scenarios
  const coreScenario = coreScenariosMap[scenarioId];
  if (coreScenario) return coreScenario;

  return undefined;
}
```

#### Scenario Fixture Shape (from `evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts`)

```typescript
// evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts:29-77
export const smokePositiveVisibleScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-positive-visible',
  description: '...',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_smoke_approved',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['docker', 'deployment'],
        shortcut: 'Docker Compose Setup',
        detail: 'Use docker-compose for multi-container setups...',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_smoke_approved',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['docker', 'containerization'],
        title: 'Docker Skills',
        slug: 'docker-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_docker',
            content: 'Use docker-compose for multi-container setups',
            situation: 'Deploying multiple containers',
            problem: 'Manual networking is error-prone',
            goal: 'Simplify deployment with compose',
            labels: ['docker', 'compose'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
});
```

#### Implementation Approach

1. Load scenario via `loadScenario(case_.scenarioId)`
2. For each `fixtures.knowledgeEntries`, create `KnowledgeRecord` with simplified mock for `preReview`
3. For each `fixtures.skillArtifacts`, create `SkillArtifactRecord` with embedded `capsules`
4. Create team records if referenced
5. Create/update membership for actor permissions
6. Update session with actor context

---

### 2. `evals/summary/run.ts` (MODIFY)

**Role:** Real endpoint execution replacing mocks
**Data Flow:** Case → Fastify inject → Response → Extract summary + context → Judge evaluation

#### Gap (Current Mock Implementation)

```typescript
// evals/summary/run.ts:197-244
export async function executeSummaryCase(
  ctx: ExecutionContext,
  case_: SummaryEvalCase,
): Promise<SummaryCaseResult> {
  // ...
  // For Phase 27-02, we use mock summary execution.
  // In a full implementation, this would:
  // 1. Execute the retrieval request against the endpoint
  // 2. Extract the summary from the response
  // 3. Build context from returned hits/capsules content

  // Generate a mock summary for testing
  const mockSummary = generateMockSummary(case_);
  const mockContext = generateMockContext(case_);
  // ...
}

// evals/summary/run.ts:250-278
function generateMockSummary(case_: SummaryEvalCase): string {
  const parts: string[] = [];
  if (case_.expected.requiredFacts.length > 0) {
    parts.push(case_.expected.requiredFacts[0]!);
  }
  parts.push('This is a summary of the retrieved knowledge.');
  return parts.join(' ');
}

function generateMockContext(case_: SummaryEvalCase): string[] {
  const context: string[] = [];
  for (const fact of case_.expected.requiredFacts) {
    context.push(`Knowledge entry: ${fact}. This is relevant information.`);
  }
  return context;
}
```

#### Closest Analog: `evals/retrieval/lib/adapters.ts`

**Real route execution pattern:**

```typescript
// evals/retrieval/lib/adapters.ts:226-304
export async function executeThroughRoute(
  ctx: ExecutionContext,
  case_: RetrievalEvalCase,
): Promise<AdapterResult> {
  const startTime = Date.now();
  const warnings: AdapterWarning[] = [];
  // ...

  try {
    const response = await ctx.app.inject({
      method: 'POST',
      url: case_.endpoint,
      headers: {
        authorization: `Bearer ${ctx.sessionToken}`,
      },
      payload: case_.request,
    });

    const durationMs = Date.now() - startTime;
    // ... error handling ...

    const responseBody = response.json();
    const result = normalizeResponse(responseBody, case_.endpoint);

    return { result, execution: {...}, warnings };
  } catch (error) {
    // ... error handling ...
  }
}
```

#### Implementation Approach

1. Import `createExecutionContext`, `executeThroughRoute` from retrieval adapters
2. Build execution context with fixture seeding
3. Execute retrieval request against endpoint
4. Extract `summary.text` from response (if present)
5. Build context array from:
   - v1: `globalConstraints[].detail` + `projectKnowledge[].detail`
   - v2: `capsules[].content` + `capsules[].problem` + `capsules[].goal`
6. Pass to judge evaluation

---

### 3. `packages/server/src/lib/retrieval/summary.ts` (NO CHANGE NEEDED)

**Role:** Reference implementation for summary building
**Data Flow:** Filtered hits/citations → Extractive summary → Validated RetrievalSummary

**Already implemented correctly:**

```typescript
// packages/server/src/lib/retrieval/summary.ts:67-97
export function buildSummary(options: BuildSummaryOptions): RetrievalSummary | null {
  const { query, includeSummary, hits, citations } = options;

  if (!includeSummary) return null;
  if (!hits || hits.length === 0) return null;
  if (!citations || citations.length === 0) return null;

  const text = generateExtractiveSummary(query, hits);
  const summary = { text, citations };
  return retrievalSummarySchema.parse(summary);
}

// packages/server/src/lib/retrieval/summary.ts:174-213
export function buildCapsuleSummary(options: {...}): RetrievalSummary | null {
  // Similar pattern for capsule-based summaries
}
```

**Key Insight:** Both `buildSummary` and `buildCapsuleSummary` are pure functions already implemented. No changes needed to this file - only need to wire the v2 path in the orchestrator.

---

### 4. `packages/server/src/lib/retrieval/orchestrator.ts` (MODIFY)

**Role:** Integrate v2 summary path
**Data Flow:** Capsule matches → buildCapsuleSummary → V2 response with summary

#### Gap (Current v2 No Summary)

```typescript
// packages/server/src/lib/retrieval/orchestrator.ts:851-855
// Build activation hints from governed clientManifest (T-15-02)
const activationHints = buildAllActivationHints(capsules, artifacts);

const result = buildV2RetrievalResponse(capsules, profileHints, null, activationHints);
//                                                   ^^^^ summary is always null
```

#### Closest Analog: v1 Summary Path (Same File)

```typescript
// packages/server/src/lib/retrieval/orchestrator.ts:272-290
const allMatches = [...globalConstraints, ...projectKnowledge];
const summaryCitations = citations ? Array.from(citations.values()) : undefined;
const summary =
  parsed.includeSummary && summaryCitations && summaryCitations.length > 0
    ? await timedStep('summary',
        () => Promise.resolve(buildSummary({
          query: parsed.seed,
          includeSummary: true,
          hits: allMatches.map((m) => ({
            shortcut: m.shortcut,
            detail: m.detail,
            labels: m.labels,
          })),
          citations: summaryCitations,
        })),
        steps
      )
    : null;
```

#### Implementation Approach

1. After building `capsules` array (line 841), check `parsed.includeSummary`
2. Build citations from capsules (need to add `buildCitationsFromCapsules` helper or reuse pattern)
3. Call `buildCapsuleSummary` with capsules and citations
4. Pass summary to `buildV2RetrievalResponse`

---

### 5. `evals/retrieval/lib/normalize.ts` (NO CHANGE - REFERENCE)

**Role:** Normalization substrate for v1/v2 responses
**Data Flow:** Raw response → NormalizedResult (common shape)

```typescript
// evals/retrieval/lib/normalize.ts:32-65
export function normalizeV1Response(response: RetrievalResponse): NormalizedResult {
  const globalConstraints = response.globalConstraints ?? [];
  const projectKnowledge = response.projectKnowledge ?? [];

  const allMatches = [...globalConstraints, ...projectKnowledge]
    .sort((a, b) => b.score - a.score);

  const hits: NormalizedHit[] = allMatches.map((match) => ({
    id: match.entryId,
    score: match.score,
    reason: match.reason,
    scope: match.scope,
  }));

  return {
    hits,
    returnedIds: hits.map((h) => h.id),
    buckets: {
      globalConstraints: globalConstraints.map((m) => m.entryId),
      projectKnowledge: projectKnowledge.map((m) => m.entryId),
    },
    profileHintArtifactIds: [],
    isEmpty: hits.length === 0,
    rawResponse: response,
    endpoint: '/v1/retrieval/search',
  };
}
```

**Key Insight:** Normalization already preserves `rawResponse` - summary eval can extract context from this.

---

### 6. `evals/retrieval/lib/metrics.ts` (NO CHANGE - REFERENCE)

**Role:** Deterministic metric calculators
**Data Flow:** NormalizedResult + relevantIds → CaseMetrics

```typescript
// evals/retrieval/lib/metrics.ts:37-42
export function hitAtK(returnedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0;
  const topK = new Set(returnedIds.slice(0, k));
  return relevantIds.some((id) => topK.has(id)) ? 1 : 0;
}
```

**Key Insight:** Already correctly implemented. Fixture materialization enables these metrics to work with real data.

---

### 7. `evals/retrieval/lib/governance.ts` (NO CHANGE - REFERENCE)

**Role:** Governance assertion layer
**Data Flow:** NormalizedResult + forbiddenIds → GovernanceResult

```typescript
// evals/retrieval/lib/governance.ts:24-40
function checkForbiddenHits(
  result: NormalizedResult,
  forbiddenIds: string[],
): GovernanceFailure | null {
  const returnedSet = new Set(result.returnedIds);
  const forbiddenHits = forbiddenIds.filter((id) => returnedSet.has(id));

  if (forbiddenHits.length > 0) {
    return {
      kind: 'forbidden-hit',
      description: `Forbidden IDs found in results: ${forbiddenHits.join(', ')}`,
      ids: forbiddenHits,
    };
  }
  return null;
}
```

**Key Insight:** Already correctly implemented. Fixture materialization enables governance checks with real filtered data.

---

## Trace/Context Attachment Patterns

### From `packages/server/src/lib/rag-log.ts`

```typescript
// packages/server/src/lib/rag-log.ts:29-45
export interface RagLogEntry {
  timestamp: string;
  queryId: string;
  seed: string;
  mode: 'semantic' | 'hybrid' | 'graph-assisted' | 'v2-capsule';
  actorId: string;
  teamId: string | null;
  pipelineSteps: PipelineStep[];
  totalLatencyMs: number;
  resultCount: number;
  metadata: {
    filters?: { labels: string[]; scopes: string[] };
    maxResults: number;
    includeSummary: boolean;
    includeRefinement: boolean;
  };
}
```

**Key Insight:** Pipeline steps already captured with timing. For eval trace, consider adding to `metadata.routingTrace`.

### From `packages/contracts/src/domain/retrieval.ts`

```typescript
// packages/contracts/src/domain/retrieval.ts:422-435
export const routingTraceSchema = z.object({
  selectedMode: retrievalStrategySchema,
  routeFamily: routeFamilySchema,
  routingReason: routingReasonSchema,
  fallbackApplied: z.boolean().default(false),
  channelsUsed: z.array(z.enum(['semantic', 'keyword', 'graph', 'capsule', 'profile'])).default([]),
});

export type RoutingTrace = z.infer<typeof routingTraceSchema>;
```

**Key Insight:** RoutingTrace already defined in contracts. Orchestrator already logs this via RAG log. For eval, can attach to `NormalizedResult` or extract from `rawResponse`.

---

## Store Data Shapes (for Fixture Materialization)

### From `packages/server/src/lib/store.ts`

```typescript
// packages/server/src/lib/store.ts:546-559
export interface StoreData {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  knowledgeEntries: KnowledgeRecord[];
  auditEvents: AuditEventRecord[];
  skillArtifacts: SkillArtifactRecord[];
  artifactFilePayloads: ArtifactFilePayloadRecord[];
}

// packages/server/src/lib/store.ts:185-210
export interface KnowledgeRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  latestRevision: KnowledgeRevisionRecord;
  history: KnowledgeRevisionRecord[];
  metadata: KnowledgeMetadataRecord;
  // ... more fields
}

// packages/server/src/lib/store.ts:483-520
export interface SkillArtifactRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  title: string;
  slug: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  latestRevision: SkillArtifactRevisionRecord;
  // ... more fields
}

// packages/server/src/lib/store.ts:293-318
export interface DerivedSkillCapsuleRecord {
  capsuleId: string;
  artifactId: string;
  revision: number;
  sourcePaths: string[];
  content: string;
  situation: string;
  problem: string;
  goal: string;
  errorText: string | null;
  labels: string[];
  scope: Scope;
  requiredLevel: number;
}
```

---

## Summary Eval Types (for Context Extraction)

### From `evals/summary/lib/types.ts`

```typescript
export interface SummaryCaseResult {
  case: SummaryEvalCase;
  judgeResult: JudgeResult;
  passed: boolean;
  durationMs: number;
  warnings: Array<{ code: string; message: string }>;
}
```

**Key Insight:** Need to add `rawResponse` or `context` field to capture trace data for downstream groundedness checks.

---

## Implementation Priority

1. **HIGH:** `seedScenarioFixtures` in adapters.ts - enables all retrieval eval
2. **HIGH:** Real endpoint execution in summary run.ts - enables real summary eval
3. **MEDIUM:** v2 summary integration in orchestrator.ts - completes v2 path
4. **LOW:** Trace field additions to NormalizedResult/SummaryCaseResult - observability enhancement

---

## File Dependency Graph

```
evals/retrieval/lib/adapters.ts
  └─→ uses: evals/retrieval/lib/load.ts (loadScenario)
  └─→ uses: packages/server/src/lib/store.ts (JsonStore, StoreData)
  └─→ uses: packages/server/src/lib/knowledge.ts (createKnowledgeEntryRecord)

evals/summary/run.ts
  └─→ uses: evals/retrieval/lib/adapters.ts (createExecutionContext, executeThroughRoute)
  └─→ uses: evals/summary/lib/judge.ts (createJudge)

packages/server/src/lib/retrieval/orchestrator.ts
  └─→ uses: packages/server/src/lib/retrieval/summary.ts (buildCapsuleSummary)
  └─→ uses: packages/server/src/lib/retrieval/citations.ts (buildCitations)
```
