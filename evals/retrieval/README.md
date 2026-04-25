# Retrieval Evaluation Datasets

This directory contains golden datasets and entrypoints for evaluating TrapMap's retrieval endpoints.

## Quick Start

Run retrieval evaluation from root pnpm scripts:

```bash
# Run smoke tier evaluation
pnpm eval:retrieval:smoke

# Run core tier evaluation
pnpm eval:retrieval:core

# Dry-run (validate layout without execution)
pnpm eval:retrieval:dry-run

# Run with options
pnpm eval:retrieval --tier smoke --endpoint /v2/retrieval/search
```

## Endpoints in Scope

| Endpoint | Response Shape | Notes |
|----------|----------------|-------|
| `/v1/retrieval/search` | Bucketed (`globalConstraints`, `projectKnowledge`) | Legacy endpoint, compatibility-sensitive |
| `/v2/retrieval/search` | Capsule-first (`capsules`, `profileHints`) | Current recommended endpoint |
| `/v3/retrieval/search` | Graph-plan wrapper (`plan` or governed `fallback`) | Additive GraphRAG-lite route with routing trace |

### v1 vs v2 vs v3 Distinction

The retrieval surfaces have materially different response contracts:

- **v1** returns knowledge entries split into `globalConstraints` and `projectKnowledge` buckets
- **v2** returns distilled capsules with `profileHints` for activation
- **v3** returns either a trap-first execution plan or a governed fallback payload plus routing trace metadata

Evaluation cases must specify the target endpoint explicitly. Do not normalize these surfaces into a single response shape at the dataset level.

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
| `v3-graph-plan-selected-smoke` | `/v3/retrieval/search` | Graph-plan selected |
| `v3-graph-plan-fallback-v2-smoke` | `/v3/retrieval/search` | Capsule fallback |
| `v3-graph-plan-fallback-v1-smoke` | `/v3/retrieval/search` | Entry fallback |

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
| `v3-graph-plan-selected-core` | `/v3/retrieval/search` | Multi-skill selected plan |
| `v3-graph-plan-governance-core` | `/v3/retrieval/search` | Governance-sensitive graph-plan |

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

- Metrics calculators (Hit@K, MRR, nDCG) → Phase 26 ✓ COMPLETE
- Report serialization → Phase 26 ✓ COMPLETE
- CI wiring → Phase 28
- Summary/judge evaluation → Phase 27

## Metrics (Phase 26)

The runner computes the following ranking metrics per case and per slice:

| Metric | Description |
|--------|-------------|
| Hit@K | Whether any relevant ID appears in top K results (K=1,5,10) |
| MRR | Mean Reciprocal Rank: 1/rank of first relevant result |
| nDCG | Normalized Discounted Cumulative Gain (binary relevance) |
| Recall@K | Fraction of relevant items found in top K results (K=10) |

Empty target policy: All metrics return 0 when no relevant IDs exist.

## Entrypoints

| File | Purpose |
|------|---------|
| `run.ts` | Main runner entrypoint with execution, metrics, and reporting |
| `smoke.ts` | Smoke-tier dataset export |
| `core.ts` | Core-tier dataset export |
| `lib/types.ts` | Shared runner result and slice types |
| `lib/adapters.ts` | Endpoint execution boundary |
| `lib/normalize.ts` | Endpoint-specific response normalization |
| `lib/metrics.ts` | Ranking metric calculators |
| `lib/governance.ts` | Governance assertion layer |
| `lib/load.ts` | Case loading and validation |

## Runner Options

| Option | Description |
|--------|-------------|
| `--tier` | Evaluation tier: `smoke` or `core` (default: `smoke`) |
| `--endpoint` | Filter by endpoint: `/v1/retrieval/search`, `/v2/retrieval/search`, or `/v3/retrieval/search` |
| `--dry-run` | Validate layout without executing evaluation |
| `--allow-empty` | Exit successfully if no cases found |
| `--json` | Output JSON report |
| `--json-path` | Write JSON report to file |
| `--verbose` | Enable verbose output |
| `--baseline` | Path to baseline report for comparison (Phase 29-03) |
| `--write-baseline` | Write current results as new baseline (Phase 29-03) |

### Dry-Run Mode

Phase 25-01 defines the entrypoint convention before Plan 25-02 creates datasets. Use `--dry-run --allow-empty` to validate layout and contract wiring without authored datasets:

```bash
pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run --allow-empty
```

### Baseline Flow (Phase 29-03)

The runner supports baseline write and compare for regression detection:

```bash
# Write a new baseline
pnpm eval:retrieval --tier smoke --write-baseline --baseline ./reports/baseline.json

# Compare against baseline
pnpm eval:retrieval --tier smoke --baseline ./reports/baseline.json
```

Baseline artifacts are stored at the path specified by `--baseline`. Comparison shows per-slice regression status:
- `REGRESSED`: Hit@1 or MRR dropped >5% from baseline
- `IMPROVED`: Hit@1 or MRR improved >5% from baseline
- `STABLE`: Metrics within 5% of baseline
- `NO-BASELINE`: No matching slice in baseline

## Failure Policy (Phase 29-03)

The evaluation runner enforces an explicit failure policy:

| Failure Kind | Policy | Description |
|--------------|--------|-------------|
| Governance leaks | **Always fail** | Forbidden IDs appearing in results |
| Empty-result mismatch | **Always fail** | Expected empty but got non-empty, or vice versa |
| Ranking regression | **Report only** | Hit@1 or MRR dropped compared to baseline |

**Governance leaks always fail** - Any case where a forbidden ID appears in results causes immediate failure, regardless of ranking metrics.

**Empty-result expectation mismatches always fail** - If a case expects an empty result but gets results (or vice versa), this is a hard failure.

**Ranking regressions compare against baseline** - When a baseline is provided, ranking drift is reported but does not cause exit code 1 unless accompanied by governance leaks or empty-result mismatches.
