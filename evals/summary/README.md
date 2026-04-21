# Summary Evaluation

This directory contains the summary evaluation system for TrapMap's retrieval endpoints.

Summary evaluation scores the quality of LLM-generated summaries over retrieved context using judge-based verification.

## Quick Start

Run summary evaluation from root pnpm scripts:

```bash
# Run smoke tier evaluation
pnpm eval:summary:smoke

# Run core tier evaluation
pnpm eval:summary:core

# Dry-run (validate layout without execution)
pnpm eval:summary:dry-run

# Run with options
pnpm eval:summary --tier smoke --endpoint /v2/retrieval/search

# Run with JSON output
pnpm eval:summary --tier core --json --json-path ./reports/summary.json

# Use specific judge provider
pnpm eval:summary --tier smoke --provider fallback
```

## Summary Evaluation Concepts

Summary evaluation measures three key aspects of LLM-generated summaries:

### Groundedness

The ratio of claims in the summary that are supported by the retrieved context.

- **High groundedness** means the summary accurately reflects the source material
- **Low groundedness** indicates hallucination or fabrication
- **Threshold**: Default minimum is 0.8 (80% of claims must be supported)

Example:
```
Summary: "Docker Compose is a tool for defining multi-container Docker applications."
Context: ["Docker Compose allows you to define and run multi-container Docker applications..."]
Result: Grounded (claim is supported by context)
```

### Coverage

The ratio of required facts that appear in the summary.

- **High coverage** means the summary includes essential information
- **Low coverage** indicates missing important details
- **Threshold**: Default minimum is 0.7 (70% of required facts must be present)

Example:
```typescript
expected: {
  requiredFacts: ['docker-compose', 'multi-container'],
  // Summary must mention both concepts
}
```

### Forbidden Claims

Claims that must NOT appear in the summary (hallucination detection).

- **Zero forbidden claims** is the goal
- **Any forbidden claim found** triggers a failure
- Used to detect sensitive information leakage or fabrication

Example:
```typescript
expected: {
  forbiddenClaims: ['kubernetes', 'production credentials', 'API token'],
  // Summary must NOT mention these terms
}
```

## Case Structure

Each summary evaluation case defines:

```typescript
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const myCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'unique-case-id',
  tier: 'smoke', // or 'core'
  endpoint: '/v2/retrieval/search', // or '/v1/retrieval/search'
  request: {
    seed: 'search query',
    maxResults: 10,
  },
  scenarioId: 'scenario-for-fixtures',
  expected: {
    requiredFacts: ['fact 1', 'fact 2'],  // Must appear in summary
    forbiddenClaims: ['forbidden term'],  // Must NOT appear
    minGroundedness: 0.8,  // Minimum groundedness score
    minCoverage: 0.7,      // Minimum coverage score
    expectSummary: true,   // Whether summary is expected
  },
  tags: ['tag1', 'tag2'],
}) as SummaryEvalCase;
```

## Judge Providers

The summary evaluation uses a judge to verify claims against context.

### Fallback Judge (Default)

- Deterministic, rule-based verification
- No external API calls
- Suitable for CI and local development
- Less sophisticated but reliable

```bash
pnpm eval:summary --provider fallback
```

### OpenAI Judge

- LLM-based verification using OpenAI models
- More sophisticated claim extraction and verification
- Requires `OPENAI_API_KEY` environment variable
- Better for thorough evaluation

```bash
export OPENAI_API_KEY=your-key
pnpm eval:summary --provider openai
```

## Tier Organization

### Smoke Tier

Fast feedback, minimal coverage. Proves the evaluation pipeline is wired correctly.

| Case ID | Endpoint | Focus |
|---------|----------|-------|
| `summary-grounded-smoke` | `/v2/retrieval/search` | Groundedness verification |
| `summary-hallucination-smoke` | `/v2/retrieval/search` | Hallucination detection |
| `summary-forbidden-claims-smoke` | `/v2/retrieval/search` | Forbidden claim detection |

### Core Tier

Broader coverage for regression detection.

| Case ID | Endpoint | Focus |
|---------|----------|-------|
| (Add core cases as needed) | `/v1/retrieval/search`, `/v2/retrieval/search` | Various scenarios |

## Adding Cases

1. **Create the case file** in `evals/summary/datasets/`:

```typescript
// evals/summary/datasets/smoke/my-new-case.ts
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const myNewCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-new-case',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: { seed: 'my query', maxResults: 10 },
  scenarioId: 'my-scenario',
  expected: {
    requiredFacts: ['expected fact'],
    forbiddenClaims: ['forbidden claim'],
    minGroundedness: 0.8,
    minCoverage: 0.7,
    expectSummary: true,
  },
}) as SummaryEvalCase;
```

2. **Export in the tier file** (`evals/summary/smoke.ts` or `evals/summary/core.ts`):

```typescript
import { myNewCase } from './datasets/smoke/my-new-case.js';

export const summarySmokeCases: SummaryEvalCase[] = [
  // ... existing cases
  myNewCase,
];
```

3. **Add scenario** if needed in `evals/summary/scenarios/`.

4. **Validate** with dry-run:

```bash
pnpm eval:summary:dry-run
```

## Runner Options

| Option | Description | Default |
|--------|-------------|---------|
| `--tier` | Evaluation tier: `smoke` or `core` | `smoke` |
| `--endpoint` | Filter by endpoint | All endpoints |
| `--dry-run` | Validate without executing | `false` |
| `--allow-empty` | Exit successfully if no cases | `false` |
| `--json` | Output JSON report | `false` |
| `--json-path` | Write JSON to file | stdout |
| `--verbose` | Enable verbose output | `false` |
| `--provider` | Judge provider: `openai` or `fallback` | `fallback` |

## Output Format

### Terminal Output

```
=== Summary Evaluation Report ===
Timestamp: 2026-04-21T...
Duration: 150ms
LLM Provider: fallback
Tier: smoke

=== Summary ===
Total cases: 3
Passed: 2
Failed: 1
Pass rate: 66.7%
Average Groundedness: 0.85
Average Coverage: 0.72
Forbidden Claim Hits: 0

=== Case Results ===
  ✓ summary-grounded-smoke [/v2/retrieval/search]: G=0.92 C=0.80 2/2 claims
  ✗ summary-hallucination-smoke [/v2/retrieval/search]: G=0.45 C=0.50 1/3 claims | 1 forbidden
```

### JSON Output

```json
{
  "meta": {
    "schemaVersion": 1,
    "timestamp": "2026-04-21T...",
    "durationMs": 150,
    "llmProvider": "fallback"
  },
  "summary": {
    "totalCases": 3,
    "passedCases": 2,
    "failedCases": 1,
    "passRate": 0.667,
    "avgGroundedness": 0.85,
    "avgCoverage": 0.72,
    "forbiddenClaimHits": 0
  },
  "cases": [...],
  "failures": [...]
}
```

## Integration with Unified Runner

Summary evaluation is included in the unified evaluation runner:

```bash
# Runs both retrieval and summary
pnpm eval:smoke
pnpm eval:core
```

The unified runner shows summary evaluation in its own section with groundedness/coverage averages.

## Related Documentation

- [evals/README.md](../README.md) - Overall evaluation workspace
- [Retrieval Eval README](../retrieval/README.md) - Retrieval evaluation details
- [PROJECT.md](../../.planning/PROJECT.md) - Milestone requirements
