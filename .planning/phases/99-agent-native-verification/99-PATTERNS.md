# Phase 99: Agent-Native Verification - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 1 (modify) + verification commands (no file creation)
**Analogs found:** 1 / 1

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/cli/src/lib/markdown-formatter.test.ts` | test | N/A (assertions) | Self (existing 12 tests) | exact |

Phase 99 is verification-only. The single file modification is extending the existing markdown-formatter test file with additional test cases. All other verification work is running existing commands (`pnpm test`, `pnpm typecheck`, `pnpm eval:smoke`).

## Pattern Assignments

### `packages/cli/src/lib/markdown-formatter.test.ts` (test, assertions)

**Analog:** Self — existing file at `/home/wunai/project/TrapMap-for-vibing/packages/cli/src/lib/markdown-formatter.test.ts`

**Imports pattern** (line 1-3):
```typescript
import { describe, expect, it } from 'vitest';
import type { GraphPlanSearchResponse, PlanTrapNode, PlanSkillNode } from '@trapmap/contracts';
import { escapeMarkdown, truncateText, formatLoadContext } from './markdown-formatter.js';
```
Note: Import `GraphPlanCapsuleFallback` type from `@trapmap/contracts` for capsule fallback tests.

**Core test structure — existing skill with activationRefs** (lines 87-115):
```typescript
// Existing test covers only references path:
const skill: PlanSkillNode = {
  nodeId: 'skill-1',
  artifactId: 'artifact-1',
  label: 'Use dependency injection',
  situation: 'Testing components',
  problem: 'Hard to mock dependencies',
  goal: 'Inject dependencies for testability',
  scope: 'project',
  requiredLevel: 1,
  score: 0.85,
  activationRefs: { references: [{ path: 'ref/guide.md', sha256: 'abc', sizeBytes: 100 }], assets: [], scripts: [] },
};
```
New tests must populate `assets` and `scripts` arrays (currently always empty).

**New test: scripts and assets in activationRefs** (to add after line 115):
Follow the same structure as the existing skill test (lines 87-115) but with populated assets and scripts:
```typescript
it('formats plan with skills containing assets and scripts', () => {
  const skill: PlanSkillNode = {
    nodeId: 'skill-1',
    artifactId: 'artifact-1',
    label: 'Deploy with script',
    situation: 'CI pipeline setup',
    problem: 'Manual deployment steps',
    goal: 'Automated deployment',
    scope: 'project',
    requiredLevel: 1,
    score: 0.8,
    activationRefs: {
      references: [{ path: 'ref/deploy.md', sha256: 'abc123', sizeBytes: 200 }],
      assets: [{ path: 'assets/config.json', sha256: 'def456', sizeBytes: 500 }],
      scripts: [{ path: 'scripts/deploy.sh', defaultPolicy: 'allow-with-approval' }],
    },
  };
  const response: GraphPlanSearchResponse = {
    routingTrace: mockTrace,
    plan: {
      blockingTraps: [],
      recommendedSkills: [skill],
      edges: [],
      citations: [],
      graph: { nodes: [], edges: [], focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] } },
    },
    fallback: null,
  };
  const result = formatLoadContext(response);
  expect(result).toContain('References: `ref/deploy.md`');
  expect(result).toContain('Assets: `assets/config.json`');
  expect(result).toContain('Scripts: `scripts/deploy.sh` (allow-with-approval)');
});
```

**New test: capsule fallback formatting** (to add in formatLoadContext describe block):
Follow the `mockTrace` + `GraphPlanSearchResponse` pattern from lines 36-57, but with `plan: null` and populated `fallback`:
```typescript
it('formats capsule fallback when plan is null', () => {
  const response: GraphPlanSearchResponse = {
    routingTrace: mockTrace,
    plan: null,
    fallback: {
      routeFamily: 'capsule',
      response: {
        capsules: [{
          capsuleId: 'cap-1',
          artifactId: 'art-1',
          revision: 1,
          sourcePaths: ['src/main.ts'],
          content: 'Deploy config capsule',
          situation: 'CI pipeline setup',
          problem: 'Manual deployment',
          goal: 'Automated deployment',
          labels: ['backend'],
          scope: 'project',
          requiredLevel: 1,
          score: 0.8,
          reason: 'semantic match',
        }],
        profileHints: [],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      },
    },
  };
  const result = formatLoadContext(response);
  expect(result).toContain('### Capsules (from fallback)');
  expect(result).toContain('cap-1');
  expect(result).toContain('CI pipeline setup');
  expect(result).toContain('Manual deployment');
  expect(result).toContain('Automated deployment');
});
```

**New test: capsule fallback with empty plan (traps=0, skills=0)** (triggers fallback path at formatter line 190-203):
```typescript
it('formats capsule fallback when plan has empty traps and skills', () => {
  const response: GraphPlanSearchResponse = {
    routingTrace: mockTrace,
    plan: {
      blockingTraps: [],
      recommendedSkills: [],
      edges: [],
      citations: [],
      graph: { nodes: [], edges: [], focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] } },
    },
    fallback: {
      routeFamily: 'capsule',
      response: {
        capsules: [{
          capsuleId: 'cap-2',
          artifactId: 'art-2',
          revision: 1,
          sourcePaths: ['README.md'],
          content: 'General guidance',
          situation: 'New project setup',
          problem: 'No conventions',
          goal: 'Establish patterns',
          labels: ['general'],
          scope: 'global',
          requiredLevel: 0,
          score: 0.6,
          reason: 'keyword match',
        }],
        profileHints: [],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      },
    },
  };
  const result = formatLoadContext(response);
  expect(result).toContain('### Capsules (from fallback)');
  expect(result).toContain('cap-2');
});
```

**New test: capsule fallback truncation** (exercises maxSkills limit on capsules):
```typescript
it('respects maxSkills option for capsule fallback', () => {
  const capsules = Array.from({ length: 10 }, (_, i) => ({
    capsuleId: `cap-${i}`,
    artifactId: `art-${i}`,
    revision: 1,
    sourcePaths: [`src/file${i}.ts`],
    content: `Content ${i}`,
    situation: `Situation ${i}`,
    problem: `Problem ${i}`,
    goal: `Goal ${i}`,
    labels: ['test'],
    scope: 'project' as const,
    requiredLevel: 1,
    score: 0.5 + i * 0.04,
    reason: 'match',
  }));
  const response: GraphPlanSearchResponse = {
    routingTrace: mockTrace,
    plan: null,
    fallback: {
      routeFamily: 'capsule',
      response: {
        capsules,
        profileHints: [],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      },
    },
  };
  const result = formatLoadContext(response, { maxSkills: 3 });
  expect(result).toContain('...and 7 more capsules');
});
```

**Error handling pattern** — no error handling needed; tests are pure assertion-based with vitest `expect()`.

## Shared Patterns

### Test Data Construction
**Source:** `packages/cli/src/lib/markdown-formatter.test.ts` lines 36-45
**Apply to:** All new test cases in this file
```typescript
const mockTrace = {
  selectedMode: 'graph-assisted' as const,
  routeFamily: 'capsule' as const,
  routingReason: 'test' as const,
  channelsUsed: ['semantic', 'keyword'],
  fallbackTarget: null,
  confidenceScore: 0.85,
  confidenceBucket: 'high' as const,
};
```
All test cases reuse this `mockTrace` to keep responses minimal and focused on the behavior under test.

### Response Construction Pattern
**Source:** `packages/cli/src/lib/markdown-formatter.test.ts` lines 47-57
**Apply to:** All new test cases
```typescript
const response: GraphPlanSearchResponse = {
  routingTrace: mockTrace,
  plan: null, // or populated plan object
  fallback: null, // or populated fallback object
};
const result = formatLoadContext(response);
expect(result).toContain('...');
```
Pattern: construct minimal `GraphPlanSearchResponse`, call `formatLoadContext()`, assert on output string.

### vi.importActual Integration Pattern
**Source:** `packages/cli/src/commands/load.test.ts` lines 201-274
**Apply to:** If integration-level tests are desired (not required for Phase 99 since formatter tests use real formatter directly)
```typescript
const { formatLoadContext: realFormatter } = await vi.importActual<
  typeof import('../lib/markdown-formatter.js')
>('../lib/markdown-formatter.js');
const output = realFormatter(realMockResponse);
expect(output).toContain('<!-- trapmap-load-context -->');
```

## Contracts Reference (for test data construction)

### GraphPlanSearchResponse
**Source:** `/home/wunai/project/TrapMap-for-vibing/packages/contracts/src/domain/retrieval.ts` line 460-567
```typescript
export const graphPlanSearchResponseSchema = z.object({
  routingTrace: graphPlanRoutingTraceSchema,
  plan: trapFirstPlanSchema.nullable().default(null),
  fallback: graphPlanFallbackSchema.nullable().default(null),
});
```

### GraphPlanCapsuleFallback
**Source:** `/home/wunai/project/TrapMap-for-vibing/packages/contracts/src/domain/retrieval.ts` line 506-514
```typescript
export const graphPlanCapsuleFallbackSchema = z.object({
  routeFamily: z.literal('capsule'),
  response: retrievalV2ResponseWithHintsSchema,  // includes capsules, profileHints, activationHints, refinementSummary, summary
});
```

### CapsuleMatch (shape for each capsule in fallback.response.capsules)
**Source:** `/home/wunai/project/TrapMap-for-vibing/packages/contracts/src/domain/retrieval.ts` line 106-137
Key fields: `capsuleId`, `artifactId`, `revision`, `sourcePaths`, `content`, `situation`, `problem`, `goal`, `labels`, `scope`, `requiredLevel`, `score`, `reason`

### PlanSkillNode activationRefs
**Source:** `/home/wunai/project/TrapMap-for-vibing/packages/contracts/src/domain/plans.ts` line 88+
Fields: `references: [{ path, sha256, sizeBytes }]`, `assets: [{ path, sha256, sizeBytes }]`, `scripts: [{ path, defaultPolicy }]`

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/cli/src/commands/init.ts` | command | request-response | Phase 97 not yet implemented; no init.ts exists |
| `packages/cli/src/commands/init.test.ts` | test | assertions | Phase 97 not yet implemented; no init.test.ts exists |

These files are conditional on Phase 97 completion. Phase 99 should gate their verification behind a file-existence check.

## Metadata

**Analog search scope:** `packages/cli/src/`
**Files scanned:** 11 test files + 1 formatter source + contracts/types
**Pattern extraction date:** 2026-05-06
