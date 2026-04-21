# Phase 27: Summary Evaluation and Judge Integration - Research

**Researched:** 2026-04-21
**Goal:** Answer "What do I need to know to PLAN this phase well?"

---

## Executive Summary

Phase 27 builds a **summary/refinement evaluation layer** that uses LLM-as-judge to check groundedness, coverage, and citation adherence for retrieval summaries. This extends the existing retrieval evaluation framework (Phases 25-26) with a new evaluation mode that targets the `summary` and `refinementSummary` fields in v1/v2 retrieval responses.

**Key insight:** The existing evaluation framework already has the patterns needed — verdicts, governance separation, and report building. Summary evaluation adds a new dimension: **LLM-based claim verification** against retrieved context.

---

## Requirements Mapping

| Requirement | Success Criteria Addressed |
|-------------|---------------------------|
| **SEVAL-01** | Summary evaluation command scores retrieval summaries against milestone-owned cases |
| **SEVAL-02** | Cases define required facts and forbidden claims for judge-driven checks |

---

## Existing Codebase Context

### 1. Retrieval Evaluation Framework (Phases 25-26)

**Location:** `evals/retrieval/`

**Key Components:**

| File | Purpose | Relevance to Phase 27 |
|------|---------|----------------------|
| `run.ts` | CLI entry point with argument parsing | Template for summary eval runner |
| `lib/types.ts` | `CaseResult`, `NormalizedResult`, `GovernanceResult`, `Verdict` | Extend with summary verdict types |
| `lib/assertions.ts` | Verdict evaluation pattern | Pattern for summary verdicts |
| `lib/report.ts` | Canonical report builder | Extend for summary metrics |
| `lib/adapters.ts` | Execution context and case execution | May need extension for summary injection |

**Key Pattern — Verdict-based Evaluation:**

```typescript
// From lib/assertions.ts
export interface CaseVerdicts {
  caseId: string;
  verdicts: Verdict[];
  passed: boolean;
  governance: GovernanceResult;
  outcome: { expected: 'empty' | 'non-empty'; actual: 'empty' | 'non-empty'; matched: boolean };
  warnings: AdapterWarning[];
}
```

This pattern can be extended with a new verdict kind: `'summary'` for groundedness/coverage checks.

### 2. Summary Builder in Server

**Location:** `packages/server/src/lib/retrieval/summary.ts`

**Key Functions:**

| Function | Description |
|----------|-------------|
| `buildSummary()` | Builds v1 summary from filtered hits |
| `buildCapsuleSummary()` | Builds v2 summary from capsule hits |
| `generateExtractiveSummary()` | Deterministic extractive summary |

**Current implementation is extractive** (no LLM calls). This means:
- Summary text is derived directly from hit content
- Citations are passed through from orchestrator
- No hallucination risk from generation
- **But** evaluation should still verify citation correctness and coverage

### 3. Retrieval Contracts

**Location:** `packages/contracts/src/domain/retrieval.ts`

**Summary Types:**

```typescript
export const retrievalSummarySchema = z.object({
  text: z.string().min(1),
  citations: z.array(retrievalCitationSchema).min(1),
});

export type RetrievalSummary = z.infer<typeof retrievalSummarySchema>;
```

**Retrieval Response Fields:**

| Field | v1 | v2 | Description |
|-------|----|----|-------------|
| `refinementSummary` | ✓ | ✓ | Optional string summary |
| `summary` | ✓ | ✓ | Structured summary with citations |

### 4. Evaluation Case Contracts

**Location:** `packages/contracts/src/domain/evals/retrieval.ts`

Current `RetrievalEvalCase` has expectations for:
- `relevance` — ranking quality
- `governance` — permission correctness
- `shape` — response structure

**Gap:** No summary expectations. Need to add summary-specific expectations.

### 5. LLM Integration in Codebase

**Location:** `packages/server/src/lib/embeddings.ts`

**Current Pattern:**

```typescript
// OpenAI embeddings via LangChain
import { OpenAIEmbeddings } from '@langchain/openai';

// Also has fallback for CI/local without API keys
class FallbackEmbeddings implements EmbeddingsAdapter { ... }
```

**Dependencies (from `packages/server/package.json`):**

```json
{
  "@langchain/core": "^1.1.39",
  "@langchain/openai": "^1.4.4"
}
```

These provide:
- `ChatOpenAI` for LLM calls
- Structured output support with Zod schemas
- Runnable patterns for chaining

---

## Summary Evaluation Concepts

### What Needs Evaluation

For a retrieval summary, three quality dimensions matter:

| Dimension | Question | Detection Method |
|-----------|----------|------------------|
| **Groundedness** | Is every claim in the summary supported by retrieved context? | Claims extraction + NLI check |
| **Coverage** | Does the summary capture required facts from the case? | Required facts check |
| **Citation Adherence** | Do citations actually support the claims they're attached to? | Citation-claim alignment |

### Faithfulness/Groundedness Metric

Based on RAGAS/DeepEval patterns:

1. **Claims Extraction:** Break summary into atomic statements
2. **NLI Verification:** For each claim, check if it can be inferred from retrieved context
3. **Score Calculation:** `Faithfulness = Supported Claims / Total Claims`

**Example:**

```
Summary: "Einstein was born in Germany on March 20, 1879."

Claims:
  1. "Einstein was born in Germany" → Supported by context ✓
  2. "Einstein was born on March 20, 1879" → NOT in context ✗

Faithfulness Score: 1/2 = 0.5
```

### Forbidden Claims

For cases where certain information should NEVER appear in summaries:
- Cross-team data leakage
- Security-sensitive information
- Unverified claims

---

## Design Decisions for Planning

### 1. Evaluation Case Extension

**Option A: Extend `RetrievalEvalCase`**
```typescript
// Add to expected.shape
summary?: {
  requiredFacts: string[];    // Must appear in summary
  forbiddenClaims: string[];  // Must NOT appear
  minGroundedness: number;    // Threshold 0-1
}
```

**Option B: Separate `SummaryEvalCase` type**
```typescript
// New type for summary-focused evaluation
interface SummaryEvalCase {
  caseId: string;
  endpoint: '/v1/retrieval/search' | '/v2/retrieval/search';
  request: RetrievalEvalRequest;
  scenarioId: string;
  expectedSummary: {
    requiredFacts: string[];
    forbiddenClaims: string[];
    minGroundedness: number;
    minCoverage: number;
  };
}
```

**Recommendation:** Start with Option A (extend existing case type) for simplicity, migrate to Option B if summary eval diverges significantly.

### 2. Judge Integration Architecture

**Components Needed:**

```
evals/summary/
├── run.ts                    # CLI entry point (mirrors retrieval/run.ts)
├── lib/
│   ├── types.ts              # SummaryCaseResult, SummaryVerdict types
│   ├── judge.ts              # LLM-as-judge integration
│   ├── claims.ts             # Claims extraction from summary
│   ├── groundedness.ts       # Faithfulness scoring
│   ├── coverage.ts           # Required facts coverage
│   ├── assertions.ts         # Summary verdict evaluation
│   └── report.ts             # Summary report builder
├── datasets/
│   ├── smoke/                # Smoke-tier summary cases
│   └── core/                 # Core-tier summary cases
└── scenarios/                # Shared with retrieval or separate
```

### 3. LLM-as-Judge Integration

**Pattern using LangChain JS:**

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// Claims extraction schema
const claimsSchema = z.object({
  claims: z.array(z.object({
    text: z.string(),
    citationId: z.string().optional(),
  })),
});

// NLI verification schema
const nliSchema = z.object({
  claims: z.array(z.object({
    text: z.string(),
    supported: z.boolean(),
    evidence: z.string().optional(),
  })),
});

// Judge chain
const model = new ChatOpenAI({ modelName: 'gpt-4o-mini' });
const claimsExtractor = model.withStructuredOutput(claimsSchema);
const nliChecker = model.withStructuredOutput(nliSchema);
```

**Fallback Strategy (matching embeddings pattern):**

When no OpenAI key is configured:
- Use deterministic rules-based claims extraction (regex patterns)
- Use keyword overlap for groundedness estimation
- Skip LLM-based evaluation with warning

### 4. Integration with Existing Runner

**Option A: Separate runner (`eval:summary`)**
- Pros: Clean separation, different execution model
- Cons: Duplicate infrastructure

**Option B: Integrated into retrieval eval**
- Pros: Single runner, comprehensive reports
- Cons: Complexity, retrieval-only cases still need LLM calls

**Recommendation:** Start with Option A (separate runner). Summary evaluation has different:
- Dependencies (requires LLM)
- Execution time (LLM calls add latency)
- Failure modes (API rate limits, LLM errors)

### 5. Report Structure

Extend the canonical report from Phase 26:

```typescript
// Add to retrievalEvalReportSchema or create summaryEvalReportSchema
interface SummaryEvalReport {
  meta: {
    schemaVersion: 1;
    timestamp: string;
    llmProvider: 'openai' | 'fallback';
  };
  summary: {
    totalCases: number;
    avgGroundedness: number;
    avgCoverage: number;
    forbiddenClaimHits: number;
  };
  cases: Array<{
    caseId: string;
    groundednessScore: number;
    coverageScore: number;
    claimsSupported: number;
    claimsTotal: number;
    requiredFactsCovered: string[];
    requiredFactsMissing: string[];
    forbiddenClaimsFound: string[];
  }>;
}
```

---

## Technical Considerations

### 1. Determinism

LLM-as-judge introduces non-determinism. Mitigation strategies:
- Set temperature=0 for judge calls
- Use same model version consistently
- Log raw LLM outputs for debugging
- Accept some variance in CI (focus on trend analysis)

### 2. API Cost and Rate Limits

Summary evaluation requires multiple LLM calls per case:
- 1 call for claims extraction
- 1 call for NLI verification (per claim batch)
- 1 call for coverage check (optional)

**Mitigation:**
- Batch claims for NLI (send all claims in one prompt)
- Cache judge responses for identical inputs
- Allow skip-list for expensive cases in CI

### 3. Scenario Reuse

Summary eval scenarios can reuse retrieval eval scenarios:
- Same fixture corpus state
- Same actor context
- Different assertions (summary-focused)

### 4. Citation Verification

The `RetrievalSummary` contract requires citations. Evaluation should verify:
1. Each citation in summary exists in the returned results
2. Cited content supports the associated claims
3. No claims lack citations when citations are expected

---

## Implementation Phases

Within Phase 27, consider this sequence:

| Step | Deliverable | Depends On |
|------|-------------|------------|
| 1 | Summary eval contracts in `packages/contracts` | None |
| 2 | Summary eval types in `evals/summary/lib/types.ts` | Step 1 |
| 3 | Judge integration in `evals/summary/lib/judge.ts` | Step 2 |
| 4 | Claims extraction + groundedness in `evals/summary/lib/` | Step 3 |
| 5 | Smoke dataset in `evals/summary/datasets/smoke/` | Step 1, 2 |
| 6 | Runner in `evals/summary/run.ts` | Steps 2-5 |
| 7 | Report builder in `evals/summary/lib/report.ts` | Step 6 |
| 8 | CLI integration (`eval:summary` script) | Step 6, 7 |

---

## Open Questions for Planning

1. **Case Scope:** Should summary eval cases be separate from retrieval cases, or embedded as optional fields?
   - Current lean: Extend `RetrievalEvalCase` with optional `expected.summary`

2. **LLM Provider:** OpenAI only for now, or design for provider abstraction?
   - Current lean: OpenAI only with fallback to rules-based (match embeddings pattern)

3. **Threshold Defaults:** What are reasonable defaults for `minGroundedness` and `minCoverage`?
   - Suggestion: Start conservative (0.8 for groundedness, 0.7 for coverage)

4. **Summary Source:** Evaluate only `summary` field, or also `refinementSummary`?
   - Suggestion: Both, with separate metrics

5. **Integration Point:** Should summary eval be a post-processing step on retrieval eval results?
   - Suggestion: Yes — run retrieval eval first, then feed results to summary eval

---

## Files to Create/Modify

### New Files

| Path | Purpose |
|------|---------|
| `packages/contracts/src/domain/evals/summary.ts` | Summary eval case schema |
| `evals/summary/run.ts` | CLI entry point |
| `evals/summary/lib/types.ts` | Types for summary eval |
| `evals/summary/lib/judge.ts` | LLM-as-judge integration |
| `evals/summary/lib/claims.ts` | Claims extraction |
| `evals/summary/lib/groundedness.ts` | Groundedness scoring |
| `evals/summary/lib/coverage.ts` | Coverage calculation |
| `evals/summary/lib/report.ts` | Report builder |
| `evals/summary/datasets/smoke/v2-summary-smoke.ts` | Smoke cases |
| `evals/summary/scenarios/` | Shared scenarios |

### Modified Files

| Path | Change |
|------|--------|
| `package.json` | Add `eval:summary` script |
| `packages/contracts/src/domain/evals/retrieval.ts` | Add optional summary expectations |
| `packages/contracts/src/index.ts` | Export summary eval types |

---

## Success Criteria Checklist

For each success criterion from the phase description:

| Criterion | How to Verify |
|-----------|---------------|
| Summary evaluation command scores retrieval summaries against milestone-owned cases | `pnpm eval:summary --tier smoke` runs successfully |
| Cases define required facts and forbidden claims for judge-driven checks | Cases have `expectedSummary.requiredFacts` and `expectedSummary.forbiddenClaims` |
| Summary scoring distinguishes unsupported claims from grounded summaries | Groundedness score correctly identifies hallucinations |
| Evaluation config fits existing Node/TypeScript workflow | Uses tsx, pnpm, same patterns as retrieval eval |

---

## References

- RAGAS Faithfulness Metric: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/
- DeepEval Faithfulness: https://deepeval.com/docs/metrics-faithfulness
- LangChain JS OpenAI Integration: `@langchain/openai` package
- Existing Retrieval Eval: `evals/retrieval/` directory

---

*Research completed: 2026-04-21*