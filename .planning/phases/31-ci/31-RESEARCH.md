# Phase 31: CI - Research Notes

**Gathered:** 2026-04-24
**Status:** Complete
**Purpose:** Answer "What do I need to know to PLAN this phase well?"

---

## Executive Summary

Phase 31 extends the existing evaluation automation so regressions are visible by retrieval mode, query slice, and benchmark cohort — not just by endpoint/tier. This phase builds on Phase 28's CI integration, Phase 29's unified routing strategy layer, and Phase 30's real fixture execution with context traces.

---

## 1. Current State Analysis

### 1.1 Existing CI/Reporting Infrastructure

**Files:**
- `evals/scripts/eval-all.ts` - Unified runner for retrieval + summary evaluation
- `evals/scripts/eval-ci.ts` - CI-optimized runner with GitHub Actions integration
- `.github/workflows/eval.yml` - GitHub Actions workflow with smoke/core tiers

**Current slice dimensions:**
- `tier`: 'smoke' | 'core'
- `endpoint`: '/v1/retrieval/search' | '/v2/retrieval/search'
- `mode`: 'semantic' | 'hybrid' | 'graph-assisted' | undefined (v1 only)

**Current slice key format (in code):**
```typescript
const keyStr = `${key.tier}:${key.endpoint}:${key.mode ?? 'none'}`;
```

**Current CI report structure (`eval-ci.ts`):**
- Schema version 1
- Combined retrieval + summary sections
- Compact summary format: `[PASS/FAIL] X/Y cases passed | H@1=... MRR=...`
- GitHub Actions output variables: `passed`, `total_cases`, `passed_cases`, `failed_cases`

### 1.2 Existing Report Types (contracts)

**RetrievalEvalSliceKey** (`packages/contracts/src/domain/evals/report.ts`):
```typescript
{
  tier: 'smoke' | 'core';
  endpoint: '/v1/retrieval/search' | '/v2/retrieval/search';
  mode?: 'semantic' | 'hybrid' | 'graph-assisted';
}
```

**RetrievalEvalSliceSummary** includes:
- `selectedMode?: RetrievalStrategy` (Phase 29-03 added)
- `fallbackApplied: boolean` (Phase 29-03 added)
- `regressionStatus: 'regressed' | 'stable' | 'improved' | 'no-baseline'`

**RetrievalStrategy** (internal routing modes, Phase 29):
```typescript
'naive' | 'local' | 'global' | 'hybrid' | 'mix' | 'auto'
```

**RoutingReason** (canonical routing decision codes):
```typescript
'explicit-mode' | 'auto-error-detected' | 'auto-goal-query' |
'auto-broad-context' | 'auto-multi-channel' | 'fallback-default' |
'v2-default-capsule'
```

### 1.3 Existing Dataset Tags

Current tags in datasets (non-exhaustive):
- Endpoint/version: `v1`, `v2`
- Tier: `smoke`, `core`
- Mode: `semantic`, `hybrid`, `graph-assisted`
- Result type: `positive`, `empty`, `forbidden`, `ranked`, `multi-hit`
- Capsule: `capsule`, `profile-hints`
- Governance: `governance`, `mixed-visibility`
- Response shape: `bucket-shape`, `scope`, `distribution`

**Not yet tagged:**
- Query type (error-debugging, how-to, global-constraints)
- Routing family (entry vs capsule)
- Governance sensitivity level

### 1.4 Baseline Comparison (Phase 29-03)

**Current implementation in `run.ts`:**
- `--baseline <path>` flag for baseline comparison
- `--write-baseline` flag to write current results as new baseline
- Baseline JSON structure:
  ```json
  {
    "timestamp": "...",
    "tier": "smoke|core",
    "slices": [...],
    "governanceFailures": [...]
  }
  ```
- Comparison threshold: 5% change in Hit@1 or MRR triggers regression/improvement flag
- Status values: `REGRESSED`, `IMPROVED`, `STABLE`, `NO-BASELINE`

**Limitations:**
- No baseline file currently exists in repo
- No baseline persistence in CI artifacts
- Comparison is per-run only, no historical trend

---

## 2. Gap Analysis

### 2.1 Mode-Aware Slice Reporting

**Current:** Slice key includes v1 `mode` (semantic/hybrid/graph-assisted) but not internal `selectedMode` or `routeFamily`.

**Gap:** Reports don't distinguish between:
- Client-requested mode (v1 `mode` param) vs router-selected mode (`selectedMode`)
- Entry-based vs capsule-based retrieval (`routeFamily`)
- Auto-routing decisions (`routingReason`)

**Impact:** Cannot compare "what the router chose" vs "what the client requested" performance.

### 2.2 Query-Type Cohorts

**Current:** Datasets have ad-hoc tags but no canonical query-type classification.

**Context suggests adding:**
- `error-debugging` - Queries about error messages, stack traces
- `how-to` - Procedural, step-by-step queries
- `global-constraints` - Organization-wide policy queries
- `governance-sensitive` - Queries that involve cross-team/security-level checks

**Gap:** No schema field for `queryType` in `RetrievalEvalCase` or `RetrievalEvalSliceKey`.

### 2.3 Regression Reporting Quality

**Current:** Baseline comparison exists but:
- No baseline file persisted
- No CI artifact retention for baselines
- No diff summary in GitHub Actions output
- Regression/improvement only per-slice, not per-cohort

**Need:**
- Machine-readable baseline file with stable schema
- Baseline artifact retention in CI (30 days for core)
- Mode/cohort comparison summary in CI output
- Separate governance regression tracking

### 2.4 Terminal/CI Output

**Current `formatSliceComparison`:**
- Shows slice comparison table with metrics
- Shows best/worst slices
- Shows governance issues

**Missing:**
- Mode comparison (client mode vs router-selected mode)
- Query-type cohort aggregation
- Regression status per slice with delta indicators
- Routing trace summary (which routingReasons were used)

---

## 3. Requirements Mapping

From `REQUIREMENTS.md`:

| Requirement | Status | Phase 31 Scope |
|-------------|--------|----------------|
| EOPS-01 | Pending | Extend slice comparison by mode, add query-type cohorts |
| EOPS-02 | Pending | Strengthen PR smoke vs scheduled core thresholds |
| EOPS-03 | Pending | Define baseline persistence and comparison policy |

**EOPS-01:** "Evaluation outputs machine-readable and human-readable reports that compare results across endpoint and retrieval mode combinations"
- Need: Add mode-aware and query-type-aware slices

**EOPS-02:** "Repo scripts support a fast smoke evaluation path for pull requests and a broader core evaluation path for regression tracking"
- Need: Define separate thresholds for PR vs scheduled runs

**EOPS-03:** "The milestone defines a baseline and failure policy so future retrieval changes can be checked against regressions instead of ad-hoc judgment"
- Need: Baseline file format, retention, comparison policy

---

## 4. Technical Design Considerations

### 4.1 Slice Key Extension Options

**Option A: Extend existing SliceKey**
```typescript
interface RetrievalEvalSliceKey {
  tier: 'smoke' | 'core';
  endpoint: '/v1/retrieval/search' | '/v2/retrieval/search';
  mode?: 'semantic' | 'hybrid' | 'graph-assisted';
  // New:
  selectedMode?: RetrievalStrategy;  // Internal router choice
  queryType?: QueryTypeCohort;       // New cohort dimension
}
```

**Option B: Separate cohort aggregation**
```typescript
interface CohortKey {
  queryType: QueryTypeCohort;
  routeFamily: 'entry' | 'capsule';
}

// Aggregated separately from slice-by-endpoint
```

**Recommendation:** Option B — keep slice key stable for backward compatibility, add cohort aggregation layer.

### 4.2 Query-Type Classification

**Approaches:**

1. **Tag-based:** Add canonical tags to cases, aggregate by tag
   - Pro: No schema change, uses existing tag field
   - Con: Tags are arrays, need primary classification

2. **Schema field:** Add `queryType` to `RetrievalEvalCase`
   - Pro: Explicit, single value
   - Con: Schema migration, contract change

3. **Derived:** Compute from seed/pattern
   - Pro: Automatic
   - Con: Fragile, may need adjustment

**Recommendation:** Start with tag-based, define canonical tag set, evaluate schema field if needed.

### 4.3 Baseline Persistence

**Current baseline format in `run.ts`:**
```json
{
  "timestamp": "ISO",
  "tier": "smoke|core",
  "slices": [{
    "slice": {...},
    "avgHitAt1": number,
    "avgMrr": number,
    ...
  }],
  "governanceFailures": [...]
}
```

**Needs:**
- Schema version field
- Baseline file path convention (`reports/baseline-{tier}.json`)
- CI artifact upload for scheduled runs
- Baseline comparison in PR runs

### 4.4 CI Workflow Changes

**Current workflow (`eval.yml`):**
- `eval-smoke`: Runs on PRs, uploads on failure
- `eval-core-scheduled`: Runs on schedule/dispatch, uploads always

**Potential additions:**
- Separate baseline upload job for scheduled core
- Baseline comparison job for PR smoke
- Summary comment on PRs with regression status

---

## 5. Dataset Inventory

### 5.1 Retrieval Cases

**Smoke tier:**
- v1: 3 cases (positive, empty, forbidden)
- v2: 3 cases (positive, empty, forbidden)

**Core tier:**
- v1: 5 cases (semantic-ranked, hybrid-ranked, graph-assisted-ranked, bucket-shape, governance)
- v2: 4 cases (capsule-ranked, profile-hints, governance, scope-distribution)

**Mode coverage:**
- semantic: 2 v1 core + 3 v1 smoke
- hybrid: 1 v1 core
- graph-assisted: 1 v1 core
- v2: no explicit mode (auto-selected)

### 5.2 Summary Cases

**Smoke tier:**
- 3 cases (grounded, hallucination, forbidden)

**Core tier:** (check datasets)

---

## 6. Implementation Phases

Based on analysis, Phase 31 can be structured as:

### Phase 31-01: Query-Type Cohort Slices
- Define canonical query-type tags
- Add cohort aggregation layer
- Update report builder with cohort summaries
- Add cohort comparison to terminal output

### Phase 31-02: Mode-Aware Reporting
- Include `selectedMode` and `routingReason` in slice summaries
- Add route family (entry/capsule) to aggregation
- Create mode comparison summary
- Add routing trace distribution to report

### Phase 31-03: Baseline Persistence and CI Regression
- Define baseline file format with schema version
- Add baseline persistence for scheduled core runs
- Add baseline comparison for PR smoke runs
- Define failure thresholds per tier
- Update CI workflow for baseline artifacts

---

## 7. Key Files Reference

| File | Purpose | Phase 31 Impact |
|------|---------|-----------------|
| `evals/retrieval/lib/types.ts` | Slice key, metrics types | Extend for cohorts |
| `evals/retrieval/lib/report.ts` | Report builder | Add cohort aggregation |
| `evals/retrieval/lib/format.ts` | Terminal output | Add cohort/mode comparison |
| `evals/scripts/eval-ci.ts` | CI runner | Add baseline logic |
| `.github/workflows/eval.yml` | CI workflow | Add baseline jobs |
| `packages/contracts/src/domain/evals/report.ts` | Report schemas | May need cohort types |
| `evals/retrieval/datasets/` | Case definitions | Add query-type tags |

---

## 8. Dependencies

**Hard dependencies:**
- Phase 29: Unified routing strategy layer (provides `RetrievalStrategy`, `RoutingReason`, `RoutingTrace`)
- Phase 30: Real fixture execution with context traces (provides execution metadata)

**Soft dependencies:**
- Phase 28: CI integration (provides workflow structure)
- Phase 26-27: Metrics and governance checks (provides measurement foundation)

---

## 9. Open Questions for Planning

1. **Cohort dimension:** Should query-type be a single field or derived from tags?

2. **Baseline storage:** Store in repo (`reports/baselines/`) or only as CI artifacts?

3. **Threshold policy:** What are acceptable regression thresholds for PR vs scheduled?

4. **Routing trace visibility:** How much routing detail should appear in human-readable output?

5. **Governance separation:** Should governance failures have separate baseline comparison?

---

## 10. Recommended Next Steps

1. **Define canonical query-type tag set** — Start with 4 types from context
2. **Add cohort aggregation without schema change** — Use existing tag field
3. **Implement baseline persistence** — Start with CI artifacts, consider repo storage later
4. **Define tier-specific thresholds** — Different expectations for smoke vs core
5. **Extend terminal output** — Add mode and cohort comparison sections

---

*Research completed: 2026-04-24*
*Ready for planning phase*
