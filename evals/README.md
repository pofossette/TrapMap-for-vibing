# Skill Shareer Evaluation Workspace

This directory contains the evaluation datasets and runner entrypoints for TrapMap's retrieval and summary evaluation system.

## Quick Start

Run unified evaluation across both retrieval and summary:

```bash
# Run smoke tier (fast feedback)
pnpm eval:smoke

# Run core tier (broader coverage)
pnpm eval:core

# Run full evaluation with JSON output
pnpm eval:all:json

# Dry-run validation without execution
pnpm exec tsx evals/scripts/eval-all.ts --tier smoke --dry-run --allow-empty
```

Run evaluation for a specific type:

```bash
# Retrieval only
pnpm eval:retrieval:smoke
pnpm eval:retrieval:core

# Summary only
pnpm eval:summary:smoke
pnpm eval:summary:core
```

## Workspace Layout

```text
evals/
├── README.md                    # This file
├── scripts/
│   └── eval-all.ts              # Unified runner for both eval types
├── retrieval/
│   ├── README.md                # Retrieval eval conventions and endpoint specifics
│   ├── run.ts                   # Retrieval runner entrypoint
│   ├── smoke.ts                 # Smoke-tier dataset export
│   ├── core.ts                  # Core-tier dataset export
│   ├── datasets/                # Retrieval case definitions
│   └── lib/                     # Runner infrastructure
└── summary/
    ├── README.md                # Summary eval documentation
    ├── run.ts                   # Summary runner entrypoint
    ├── smoke.ts                 # Smoke-tier dataset export
    ├── core.ts                  # Core-tier dataset export
    ├── datasets/                # Summary case definitions
    └── lib/                     # Judge and scoring infrastructure
```

## Phase Status

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 25 | Contracts, workspace layout, thin entrypoints | Complete |
| Phase 26 | Dataset authoring, metrics runner, report generation | Complete |
| Phase 27 | Summary evaluation with judge-based checks | Complete |
| Phase 28 | CI integration and regression gates | **Current** |

## How to Add Cases

### Adding a Retrieval Case

1. **Create the case definition** in the appropriate dataset file under `evals/retrieval/datasets/`:

```typescript
import { retrievalEvalCaseSchema, type RetrievalEvalCase } from '@trapmap/contracts';

export const myNewCase = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-new-case-id',
  tier: 'smoke', // or 'core'
  endpoint: '/v2/retrieval/search', // or '/v1/retrieval/search'
  request: {
    seed: 'my search query',
    mode: 'semantic', // optional: 'hybrid', 'graph-assisted'
    maxResults: 10,
  },
  scenarioId: 'my-scenario-id',
  expected: {
    outcome: 'non-empty', // or 'empty'
    relevance: {
      relevantIds: ['entry_1', 'entry_2'],
      idealOrder: ['entry_1', 'entry_2'], // optional
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
  },
}) as RetrievalEvalCase;
```

2. **Export the case** in the tier file (`smoke.ts` or `core.ts`).

3. **Add the scenario** if needed in `evals/retrieval/scenarios/` for fixture state.

### Adding a Summary Case

1. **Create the case definition** in the appropriate dataset file under `evals/summary/datasets/`:

```typescript
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const mySummaryCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-summary-case',
  tier: 'smoke', // or 'core'
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'my query for summary',
    maxResults: 10,
  },
  scenarioId: 'my-summary-scenario',
  expected: {
    requiredFacts: ['fact that must appear in summary'],
    forbiddenClaims: ['claim that must not appear'],
    minGroundedness: 0.8,
    minCoverage: 0.7,
    expectSummary: true,
  },
}) as SummaryEvalCase;
```

2. **Export the case** in the tier file (`smoke.ts` or `core.ts`).

### Schema Reference

All schemas are defined in `packages/contracts/src/domain/evals/`:
- `retrieval.ts` - Retrieval case and request schemas
- `summary.ts` - Summary case and expected outcome schemas
- `report.ts` - Report structure schemas

## Interpreting Failures

### Governance Failures

Governance failures indicate permission or policy violations, not ranking issues:

| Failure Kind | Meaning |
|--------------|---------|
| `forbidden-hit` | A result was returned that should have been filtered by RBAC, security level, or lifecycle state |
| `unexpected-empty` | Expected results but got none (possibly over-filtering) |
| `unexpected-non-empty` | Expected no results but got some (possibly under-filtering) |
| `shape-mismatch` | Response structure doesn't match endpoint contract |

**Action**: Check RBAC configuration, security levels, and lifecycle states for the affected entries.

### Metric Failures (Retrieval)

Low metric scores indicate ranking quality issues:

| Metric | Target | Meaning |
|--------|--------|---------|
| Hit@1 | > 0.8 | First result is relevant |
| Hit@5 | > 0.9 | Relevant result in top 5 |
| MRR | > 0.7 | Mean reciprocal rank of first relevant |
| nDCG | > 0.7 | Ranking quality normalized |

**Action**: Check embedding quality, reranker configuration, and query preprocessing.

### Groundedness/Coverage Failures (Summary)

Summary evaluation failures indicate hallucination or missing information:

| Issue | Meaning |
|-------|---------|
| Low Groundedness | Summary contains claims not supported by retrieved context |
| Low Coverage | Summary misses required facts from the expected set |
| Forbidden Claims | Summary contains hallucinated or disallowed content |

**Action**: Check judge configuration, retrieved context quality, and summary generation prompts.

## Report Structure

### JSON Report Format

Both retrieval and summary reports follow a common structure:

```typescript
interface EvalReport {
  meta: {
    schemaVersion: 1;
    timestamp: string;
    durationMs: number;
    options: { tier, endpoint, dryRun, ... };
  };
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    passed: boolean;
  };
  cases: CaseSummary[];
  failures: FailureRecord[];
}
```

### Terminal Output

Run with `--verbose` for detailed per-case output:

```bash
pnpm eval:smoke -- --verbose
```

The unified runner shows:
- Retrieval Evaluation section with slice comparison table
- Summary Evaluation section with groundedness/coverage averages
- Overall Status with pass/fail summary

## CI Integration

Phase 28-02 will add automated CI integration:

- GitHub Actions workflow for PR checks
- Baseline comparison for regression detection
- Automatic failure reporting

Current CI commands (ready for workflow integration):

```bash
# Exit code 0 on pass, 1 on any failure
pnpm eval:smoke

# JSON output for artifact upload
pnpm eval:all:json
```

## Governance vs Relevance

Per REVAL-02 and the v1.4 milestone, retrieval evaluation separates two concerns:

- **Relevance**: Ranking quality (Hit@K, MRR, nDCG)
- **Governance**: Permission/policy correctness (cross-team, security-level, lifecycle leakage)

A high relevance score cannot hide a governance leak. Every eval case carries separate `relevance` and `governance` assertion groups.

## Key Principles

1. **Contracts in `packages/contracts`**: All eval schemas live in the shared contracts package, not here. This workspace only contains datasets and entrypoints.

2. **Datasets are milestone-owned**: Dataset files are `.ts` modules exporting plain objects that validate against the shared contracts.

3. **Endpoint specificity**: Retrieval evaluation targets explicit endpoints (`/v1/retrieval/search`, `/v2/retrieval/search`). Each case declares its target endpoint explicitly.

4. **Separation of concerns**: Governance failures and relevance failures are tracked separately and both must pass for overall success.

## Related Documentation

- [Retrieval Eval README](./retrieval/README.md) - Endpoint-specific conventions
- [Summary Eval README](./summary/README.md) - Judge-based evaluation details
- [PROJECT.md](../.planning/PROJECT.md) - Milestone requirements
- [ROADMAP.md](../.planning/ROADMAP.md) - Phase scope boundaries
