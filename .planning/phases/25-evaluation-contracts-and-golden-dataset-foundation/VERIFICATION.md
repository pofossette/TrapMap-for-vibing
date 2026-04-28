---
phase: 25-evaluation-contracts-and-golden-dataset-foundation
verified: 2026-04-28T14:55:00Z
status: verified
requirements_verified:
  - REVAL-02
---

# Phase 25 Verification: Evaluation Contracts and Golden Dataset Foundation

**Phase scope:** Establish shared retrieval-eval contract surface and repo-root `evals/` workspace so subsequent phases can build golden datasets and execute deterministic evaluations.

**Verification date:** 2026-04-28 (backfilled from current codebase evidence)
**Plans verified:** 25-01, 25-02

---

## Executive Summary

Phase 25 is **VERIFIED** within its foundation scope. It establishes contract schemas, workspace layout, and golden datasets. It does not implement the retrieval runner, metrics calculators, or report serialization -- those are Phase 26 deliverables.

---

## Requirement Traceability

| Requirement | Phase 25 Contribution | Status | Evidence |
|-------------|-----------------------|--------|----------|
| REVAL-01 | Contract surface and workspace only; runner deferred to Phase 26 | **PARTIAL** | Schemas in `packages/contracts/src/domain/evals/retrieval.ts`; thin entrypoints in `evals/retrieval/run.ts` (dry-run mode) |
| REVAL-02 | Golden datasets for both v1 and v2 endpoints | **VERIFIED** | Smoke/core datasets exist for both endpoints |

Phase 25 does not retroactively claim REVAL-01 completion. The runner execution, metric computation, and governance assertions were delivered by Phase 26 (plans 26-01 and 26-02).

---

## Artifacts Verification

### Plan 25-01: Evaluation Contracts

| Artifact | Purpose | Status |
|----------|---------|--------|
| `packages/contracts/src/domain/evals/retrieval.ts` | Zod schemas for eval scenarios, cases, tiers, endpoints | **EXISTS** -- exports `retrievalEvalScenarioSchema`, `retrievalEvalCaseSchema`, endpoint enum with `/v1/retrieval/search`, `/v2/retrieval/search`, `/v3/retrieval/search` |
| `packages/contracts/src/index.ts` | Package export surface | **EXISTS** -- exports eval contracts |
| `packages/contracts/src/index.test.ts` | Contract regression tests | **EXISTS** -- 195 tests pass |
| `evals/README.md` | Workspace layout documentation | **EXISTS** |
| `evals/retrieval/README.md` | Endpoint conventions and tier matrix | **EXISTS** -- documents endpoint split, v1 compatibility risk |
| `evals/retrieval/run.ts` | Tier/endpoint-aware loader | **EXISTS** -- dry-run entrypoint (Phase 26 later extended it with execution, metrics, reporting, and baseline features) |
| `evals/retrieval/smoke.ts` | Smoke-tier dataset export | **EXISTS** |
| `evals/retrieval/core.ts` | Core-tier dataset export | **EXISTS** |

### Plan 25-02: Golden Datasets

| Artifact | Purpose | Status |
|----------|---------|--------|
| `evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts` | Deterministic smoke fixtures (positive, empty, forbidden) | **EXISTS** |
| `evals/retrieval/scenarios/core/retrieval-core-scenarios.ts` | Core fixtures (ranked-hits, mixed-visibility, bucket-shape, profile-hints) | **EXISTS** |
| `evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts` | 3 v1 smoke cases | **EXISTS** |
| `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts` | 3 v2 smoke cases | **EXISTS** |
| `evals/retrieval/datasets/core/v1-retrieval-core.ts` | 5 v1 core cases | **EXISTS** |
| `evals/retrieval/datasets/core/v2-retrieval-core.ts` | 4 v2 core cases | **EXISTS** |
| `evals/retrieval/datasets/retrieval-datasets.test.ts` | 23 coverage regression tests | **EXISTS** -- tests pass |

---

## Key Design Properties Verified

1. **Endpoint specificity preserved.** The endpoint enum is explicit: `z.enum(['/v1/retrieval/search', '/v2/retrieval/search', '/v3/retrieval/search'])`. Each case declares its target endpoint. v1 bucketed responses and v2 capsule-first responses are not conflated.

2. **Governance/relevance separation.** `retrievalEvalExpectedSchema` requires separate `relevance` and `governance` fields. All 15 authored cases carry both. Governance expectations include `forbiddenIds` and `forbiddenReasons` even when empty.

3. **Deterministic fixture state.** Scenarios encode explicit `actor` context (subjectType, activeTeamId, securityLevel, permissions) and `fixtures` corpus (knowledgeEntries, skillArtifacts). No dependency on mutable local data.

4. **Ideal order arrays for future metrics.** `relevance.idealOrder` supports Hit@K, MRR, nDCG calculation (consumed by Phase 26 `lib/metrics.ts`).

---

## Scope Boundaries

Phase 25 does not include and does not retroactively claim:

| Capability | Delivered By |
|------------|-------------|
| Retrieval runner with endpoint execution | Phase 26-01 (`evals/retrieval/lib/adapters.ts`) |
| Response normalization | Phase 26-01 (`evals/retrieval/lib/normalize.ts`) |
| Ranking metrics (Hit@K, MRR, nDCG, Recall@K) | Phase 26-01 (`evals/retrieval/lib/metrics.ts`) |
| Governance assertion execution | Phase 26-01 (`evals/retrieval/lib/governance.ts`) |
| First-class verdicts | Phase 26-02 (`evals/retrieval/lib/assertions.ts`) |
| Canonical report builder | Phase 26-02 (`evals/retrieval/lib/report.ts`) |
| Terminal/JSON report formatting | Phase 26-02 (`evals/retrieval/lib/format.ts`) |
| v3 endpoint cases | Later phases (documented in `evals/retrieval/README.md`) |
| Baseline write/compare flow | Phase 29-03 |
| Summary evaluation | Phase 27 |

---

## Automated Evidence

### Contract Tests

```
pnpm exec vitest run --project=contracts packages/contracts/src/index.test.ts
195 tests passed
```

### Dataset Regression Tests

```
pnpm exec vitest run --project=evals evals/retrieval/datasets/retrieval-datasets.test.ts
23 tests passed
```

### Dry-Run Entrypoints

The `evals/retrieval/run.ts` entrypoint loaded 6 smoke cases and 9 core cases in dry-run mode during original verification. The current `run.ts` has been extended by Phases 26 and 29 to support execution, metrics, reporting, and baselines; the dry-run path remains functional.

---

## Conclusion

Phase 25 established the contract surface and golden datasets that Phases 26-29 built upon. The foundation is intact and the scope boundaries are clean: Phase 25 delivered schemas and data; execution and scoring came later.

---

*Backfilled: 2026-04-28*
*Original verification: 2026-04-21*
