# Retrieval Evaluation Datasets

This directory contains golden datasets and entrypoints for evaluating TrapMap's retrieval endpoints.

## Endpoints in Scope

| Endpoint | Response Shape | Notes |
|----------|----------------|-------|
| `/v1/retrieval/search` | Bucketed (`globalConstraints`, `projectKnowledge`) | Legacy endpoint, compatibility-sensitive |
| `/v2/retrieval/search` | Capsule-first (`capsules`, `profileHints`) | Current recommended endpoint |

### v1 vs v2 Distinction

v1 and v2 have materially different response contracts:

- **v1** returns knowledge entries split into `globalConstraints` and `projectKnowledge` buckets
- **v2** returns distilled capsules with `profileHints` for activation

Evaluation cases must specify the target endpoint explicitly. Do not normalize v1 and v2 into a single response shape at the dataset level.

### v1 Compatibility Risk

The `/v1/retrieval/search` endpoint has known route-path sensitivity. Current integration tests show governance scenarios returning 500 under authenticated route execution. This is a planning consideration for Phase 26 execution:

- The v1 endpoint remains an active contract per `docs/api-surface.md`
- Phase 26 may need an internal adapter if route instability persists
- Dataset authors should target v1 cases for coverage, but runners should handle execution failures gracefully

## Tier Organization

### Smoke Tier

Fast feedback, minimal coverage. Proves the evaluation pipeline is wired correctly.

| Case ID | Endpoint | Scenario Type |
|---------|----------|---------------|
| `v1-semantic-positive-smoke` | `/v1/retrieval/search` | Positive visible hit |
| `v1-semantic-empty-smoke` | `/v1/retrieval/search` | Empty result |
| `v1-semantic-forbidden-smoke` | `/v1/retrieval/search` | Forbidden result |
| `v2-capsule-positive-smoke` | `/v2/retrieval/search` | Positive visible hit |
| `v2-capsule-empty-smoke` | `/v2/retrieval/search` | Empty result |
| `v2-capsule-forbidden-smoke` | `/v2/retrieval/search` | Forbidden result |

### Core Tier

Broader coverage for regression detection. Includes mode variations and response shape checks.

| Case ID | Endpoint | Slice |
|---------|----------|-------|
| `v1-semantic-ranked-core` | `/v1/retrieval/search` | Semantic mode, multiple relevant |
| `v1-hybrid-ranked-core` | `/v1/retrieval/search` | Hybrid mode |
| `v1-graph-assisted-ranked-core` | `/v1/retrieval/search` | Graph-assisted mode |
| `v1-bucket-shape-core` | `/v1/retrieval/search` | Bucket split verification |
| `v2-capsule-ranked-core` | `/v2/retrieval/search` | Capsule ranking |
| `v2-profile-hints-core` | `/v2/retrieval/search` | Profile hints verification |
| `v2-governance-core` | `/v2/retrieval/search` | Forbidden leakage |

## Dataset Contract

Each dataset module exports plain objects validated against `@trapmap/contracts`:

```typescript
import { retrievalEvalCaseSchema } from '@trapmap/contracts';

export const myCase = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-case-id',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: { seed: 'my query' },
  scenarioId: 'my-scenario',
  expected: {
    outcome: 'non-empty',
    relevance: { relevantIds: ['entry_1'] },
    governance: { forbiddenIds: [] },
  },
});
```

## Governance Assertions

Every case has separate `relevance` and `governance` sections in the `expected` field:

```typescript
expected: {
  outcome: 'empty',
  relevance: {
    relevantIds: ['entry_1'],  // Would be relevant by content
    idealOrder: [],
  },
  governance: {
    forbiddenIds: ['entry_1'],  // But forbidden by policy
    forbiddenReasons: ['cross-team'],  // Why forbidden
  },
}
```

This separation ensures:

1. Governance leaks are detected independently of ranking quality
2. A forbidden result cannot hide in relevance metrics
3. Failure reports clearly identify cross-team, security-level, or lifecycle issues

## Out of Scope for Phase 25

- Metrics calculators (Hit@K, MRR, nDCG) → Phase 26
- Report serialization → Phase 26
- CI wiring → Phase 28
- Summary/judge evaluation → Phase 27

## Entrypoints

| File | Purpose |
|------|---------|
| `run.ts` | Tier/endpoint-aware loader, supports `--dry-run --allow-empty` |
| `smoke.ts` | Smoke-tier dataset export |
| `core.ts` | Core-tier dataset export |

### Dry-Run Mode

Phase 25-01 defines the entrypoint convention before Plan 25-02 creates datasets. Use `--dry-run --allow-empty` to validate layout and contract wiring without authored datasets:

```bash
pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run --allow-empty
```
