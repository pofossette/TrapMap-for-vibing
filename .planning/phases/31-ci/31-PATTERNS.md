# Phase 31: CI - Pattern Mapping

**Generated:** 2026-04-24
**Purpose:** Extract patterns from existing code to guide Phase 31 implementation

---

## File Inventory

Based on CONTEXT.md and RESEARCH.md, Phase 31 requires modifications to:

| File | Action | Phase Section | Priority |
|------|--------|---------------|----------|
| `packages/contracts/src/domain/evals/report.ts` | Extend | 31-01, 31-02 | High |
| `evals/retrieval/lib/types.ts` | Extend | 31-01, 31-02 | High |
| `evals/retrieval/lib/report.ts` | Extend | 31-01, 31-02 | High |
| `evals/retrieval/lib/format.ts` | Extend | 31-01, 31-02 | High |
| `evals/scripts/eval-ci.ts` | Extend | 31-03 | High |
| `.github/workflows/eval.yml` | Extend | 31-03 | High |
| `evals/retrieval/datasets/**/*.ts` | Tag | 31-01 | Medium |
| `reports/baselines/` (new dir) | Create | 31-03 | Medium |

---

## 1. Contracts: Report Schema Extensions

### Role
Canonical Zod schemas for machine-readable evaluation reports. All downstream code derives types from these schemas.

### Data Flow
```
Case Execution → CaseResult → buildReport() → RetrievalEvalReport → JSON/terminal
                                        ↓
                              Schema validation (parse)
```

### Existing Analog: `RetrievalEvalSliceKey`

**File:** `packages/contracts/src/domain/evals/report.ts:110-116`

```typescript
export const retrievalEvalSliceKeySchema = z.object({
  tier: retrievalEvalTierSchema,
  endpoint: retrievalEvalEndpointSchema,
  mode: z.enum(['semantic', 'hybrid', 'graph-assisted']).optional(),
});

export type RetrievalEvalSliceKey = z.infer<typeof retrievalEvalSliceKeySchema>;
```

**Pattern:** Slice keys use a flat object with enum fields. Each dimension is optional if it may not apply to all cases.

### Existing Analog: `RetrievalEvalSliceSummary`

**File:** `packages/contracts/src/domain/evals/report.ts:135-153`

```typescript
export const retrievalEvalSliceSummarySchema = z.object({
  slice: retrievalEvalSliceKeySchema,
  caseCount: z.number().int().min(0),
  passedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  passRate: z.number().min(0).max(1),
  avgHitAt1: z.number().min(0).max(1),
  avgHitAt5: z.number().min(0).max(1),
  avgHitAt10: z.number().min(0).max(1),
  avgMrr: z.number().min(0).max(1),
  avgNdcg: z.number().min(0).max(1),
  avgRecallAt10: z.number().min(0).max(1),
  governanceFailureCount: z.number().int().min(0),
  outcomeMismatchCount: z.number().int().min(0),
  executionIssueCount: z.number().int().min(0),
  selectedMode: retrievalStrategySchema.optional(),
  fallbackApplied: z.boolean().default(false),
  regressionStatus: z.enum(['regressed', 'stable', 'improved', 'no-baseline']).default('no-baseline'),
});
```

**Pattern:** Slice summaries contain:
- Slice key (identity)
- Counts (caseCount, passedCount, failedCount)
- Rate metrics (passRate, avgHitAt1, etc.)
- Failure category counts
- Phase-specific optional fields (selectedMode, fallbackApplied)
- Regression status with default

### Pattern for 31-01: Cohort Key Schema

**Recommended approach (Option B from RESEARCH.md):**

```typescript
// New cohort aggregation dimension (separate from slice key)
export const queryTypeCohortSchema = z.enum([
  'error-debugging',
  'how-to',
  'global-constraints',
  'governance-sensitive',
  'general',
]);

export type QueryTypeCohort = z.infer<typeof queryTypeCohortSchema>;

export const cohortKeySchema = z.object({
  queryType: queryTypeCohortSchema,
  routeFamily: routeFamilySchema, // 'entry' | 'capsule'
});

export type CohortKey = z.infer<typeof cohortKeySchema>;

export const cohortSummarySchema = z.object({
  cohort: cohortKeySchema,
  caseCount: z.number().int().min(0),
  passedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  passRate: z.number().min(0).max(1),
  avgHitAt1: z.number().min(0).max(1),
  avgMrr: z.number().min(0).max(1),
  governanceFailureCount: z.number().int().min(0),
});

export type CohortSummary = z.infer<typeof cohortSummarySchema>;
```

### Pattern for 31-03: Baseline Report Schema

**Existing baseline structure (in `run.ts`):**

```typescript
const baselineReport = {
  timestamp: new Date().toISOString(),
  tier: options.tier,
  slices: slices.map(s => ({
    slice: s.slice,
    avgHitAt1: s.avgHitAt1,
    avgHitAt5: s.avgHitAt5,
    avgHitAt10: s.avgHitAt10,
    avgMrr: s.avgMrr,
    avgNdcg: s.avgNdcg,
    avgRecallAt10: s.avgRecallAt10,
    selectedMode: s.selectedMode,
    fallbackApplied: s.fallbackApplied,
  })),
  governanceFailures: results.filter(r => !r.governance.passed).map(r => ({
    caseId: r.case.caseId,
    failures: r.governance.failures,
  })),
};
```

**Pattern:** Baseline files need a schema version field for future compatibility:

```typescript
export const baselineReportSchema = z.object({
  schemaVersion: z.literal(1),
  timestamp: z.string().datetime(),
  tier: retrievalEvalTierSchema,
  slices: z.array(z.object({
    slice: retrievalEvalSliceKeySchema,
    avgHitAt1: z.number().min(0).max(1),
    avgHitAt5: z.number().min(0).max(1),
    avgHitAt10: z.number().min(0).max(1),
    avgMrr: z.number().min(0).max(1),
    avgNdcg: z.number().min(0).max(1),
    avgRecallAt10: z.number().min(0).max(1),
    selectedMode: retrievalStrategySchema.optional(),
    fallbackApplied: z.boolean().default(false),
  })),
  governanceFailures: z.array(z.object({
    caseId: z.string().min(1),
    failures: z.array(z.object({
      kind: z.string(),
      description: z.string(),
      ids: z.array(z.string()),
    })),
  })),
  // Phase 31: Add cohort summaries for regression tracking
  cohortSummaries: z.array(cohortSummarySchema).optional(),
});
```

---

## 2. Types: Runner Internal Types

### Role
TypeScript interfaces for internal runner operations. Not serialized directly; feeds into report builder.

### Data Flow
```
CaseResult[] → aggregateSliceMetrics() → SliceMetrics[] → buildReport()
```

### Existing Analog: `SliceMetrics`

**File:** `evals/retrieval/lib/types.ts:174-200`

```typescript
export interface SliceMetrics {
  /** Slice key */
  slice: SliceKey;
  /** Number of cases in this slice */
  caseCount: number;
  /** Average Hit@1 */
  avgHitAt1: number;
  /** Average Hit@5 */
  avgHitAt5: number;
  /** Average Hit@10 */
  avgHitAt10: number;
  /** Average MRR */
  avgMrr: number;
  /** Average nDCG */
  avgNdcg: number;
  /** Average Recall@10 */
  avgRecallAt10: number;
  /** Number of governance failures in slice */
  governanceFailures: number;
  /** The internal strategy selected for this slice (Phase 29-03) */
  selectedMode?: RetrievalStrategy;
  /** Whether fallback was applied in this slice (Phase 29-03) */
  fallbackApplied: boolean;
  /** Regression status relative to baseline (Phase 29-03) */
  regressionStatus: 'regressed' | 'stable' | 'improved' | 'no-baseline';
}
```

**Pattern:** Internal types mirror report schemas but are interfaces (not Zod schemas). They carry computed values during execution.

### Pattern for 31-01: Cohort Metrics Type

```typescript
/**
 * Cohort key for aggregating by query type and route family.
 * Phase 31-01: EOPS-01 (query-type cohorts)
 */
export interface CohortKey {
  queryType: QueryTypeCohort;
  routeFamily: 'entry' | 'capsule';
}

/**
 * Aggregated metrics for a cohort.
 * Phase 31-01: EOPS-01 (query-type cohorts)
 */
export interface CohortMetrics {
  /** Cohort key */
  cohort: CohortKey;
  /** Number of cases in this cohort */
  caseCount: number;
  /** Average metrics */
  avgHitAt1: number;
  avgMrr: number;
  avgNdcg: number;
  /** Governance failure count */
  governanceFailures: number;
  /** Pass count */
  passedCount: number;
  /** Fail count */
  failedCount: number;
  /** Pass rate */
  passRate: number;
  /** Regression status relative to baseline */
  regressionStatus: 'regressed' | 'stable' | 'improved' | 'no-baseline';
}
```

### Pattern for 31-02: Mode Comparison Type

```typescript
/**
 * Mode comparison for analyzing client-requested vs router-selected modes.
 * Phase 31-02: EOPS-01 (mode-aware reporting)
 */
export interface ModeComparison {
  /** Client-requested mode (v1 only) */
  clientMode?: 'semantic' | 'hybrid' | 'graph-assisted';
  /** Router-selected internal mode */
  selectedMode?: RetrievalStrategy;
  /** Routing reason code */
  routingReason?: RoutingReason;
  /** Whether fallback was applied */
  fallbackApplied: boolean;
  /** Count of cases with this combination */
  caseCount: number;
  /** Average metrics for this mode combination */
  avgHitAt1: number;
  avgMrr: number;
}
```

---

## 3. Report: Report Builder

### Role
Builds canonical machine-readable reports from case results. Single source of truth for both JSON and terminal output.

### Data Flow
```
CaseResult[] + options + durationMs → buildReport() → RetrievalEvalReport
```

### Existing Analog: `buildSliceSummaries`

**File:** `evals/retrieval/lib/report.ts:110-128`

```typescript
function buildSliceSummaries(caseResults: CaseResult[]): RetrievalEvalSliceSummary[] {
  // Group by slice key
  const sliceMap = new Map<string, CaseResult[]>();

  for (const result of caseResults) {
    const key = getSliceKeyString({
      tier: result.case.tier,
      endpoint: result.case.endpoint,
      mode: result.case.request.mode,
    });

    const existing = sliceMap.get(key) ?? [];
    existing.push(result);
    sliceMap.set(key, existing);
  }

  // Build summary for each slice
  return Array.from(sliceMap.values()).map(buildSliceSummary);
}
```

**Pattern:**
1. Create `Map<string, CaseResult[]>` for grouping
2. Define a key string function for stable grouping
3. Iterate and push to map
4. Map values to summary objects

### Pattern for 31-01: Build Cohort Summaries

```typescript
/**
 * Build cohort summaries from case results.
 * Phase 31-01: EOPS-01 (query-type cohorts)
 */
function buildCohortSummaries(caseResults: CaseResult[]): CohortSummary[] {
  // Group by cohort key
  const cohortMap = new Map<string, CaseResult[]>();

  for (const result of caseResults) {
    const key = getCohortKeyString({
      queryType: deriveQueryType(result.case),
      routeFamily: result.case.endpoint === '/v1/retrieval/search' ? 'entry' : 'capsule',
    });

    const existing = cohortMap.get(key) ?? [];
    existing.push(result);
    cohortMap.set(key, existing);
  }

  // Build summary for each cohort
  return Array.from(cohortMap.values()).map(buildCohortSummary);
}

/**
 * Derive query type from case tags or seed pattern.
 * Phase 31-01: EOPS-01
 */
function deriveQueryType(case_: RetrievalEvalCase): QueryTypeCohort {
  // Check tags first (explicit classification)
  const queryTypeTags = case_.tags.filter(t =>
    ['error-debugging', 'how-to', 'global-constraints', 'governance-sensitive', 'general'].includes(t)
  );

  if (queryTypeTags.length > 0) {
    return queryTypeTags[0] as QueryTypeCohort;
  }

  // Default to general if not tagged
  return 'general';
}

/**
 * Get a stable string key for a cohort.
 */
function getCohortKeyString(key: CohortKey): string {
  return `${key.queryType}:${key.routeFamily}`;
}
```

### Pattern for 31-02: Build Mode Comparison

```typescript
/**
 * Build mode comparison summaries showing client vs router-selected modes.
 * Phase 31-02: EOPS-01 (mode-aware reporting)
 */
function buildModeComparisons(caseResults: CaseResult[]): ModeComparison[] {
  // Group by mode combination
  const modeMap = new Map<string, CaseResult[]>();

  for (const result of caseResults) {
    const key = getModeComparisonKey({
      clientMode: result.case.request.mode,
      selectedMode: result.execution.selectedMode,
      routingReason: result.execution.routingReason,
      fallbackApplied: result.execution.fallbackApplied,
    });

    const existing = modeMap.get(key) ?? [];
    existing.push(result);
    modeMap.set(key, existing);
  }

  // Build comparison for each mode combination
  return Array.from(modeMap.values()).map(buildModeComparison);
}
```

---

## 4. Format: Terminal Output

### Role
Human-readable terminal formatting for evaluation reports. Receives canonical report, outputs formatted text.

### Data Flow
```
RetrievalEvalReport → formatReport() → string (terminal output)
```

### Existing Analog: `formatSliceComparison`

**File:** `evals/retrieval/lib/format.ts:208-302`

```typescript
export function formatSliceComparison(report: RetrievalEvalReport): string {
  const lines: string[] = [];

  if (report.slices.length === 0) {
    return 'No slices to compare.';
  }

  // Header
  lines.push('');
  lines.push('=== Slice Comparison ===');
  lines.push('');

  // Table header
  lines.push('Tier     | Endpoint              | Mode          | Cases | Pass Rate | Avg Hit@1 | Avg MRR | Avg nDCG');
  lines.push('---------|----------------------|---------------|-------|-----------|-----------|---------|----------');

  // Sort slices for consistent display
  const sortedSlices = [...report.slices].sort((a, b) => {
    // Sort by tier, then endpoint, then mode
    if (a.slice.tier !== b.slice.tier) {
      return a.slice.tier === 'smoke' ? -1 : 1;
    }
    if (a.slice.endpoint !== b.slice.endpoint) {
      return a.slice.endpoint.localeCompare(b.slice.endpoint);
    }
    const modeA = a.slice.mode ?? 'none';
    const modeB = b.slice.mode ?? 'none';
    return modeA.localeCompare(modeB);
  });

  // Table rows
  for (const slice of sortedSlices) {
    const mode = slice.slice.mode ?? 'default';
    const tier = slice.slice.tier.padEnd(8);
    const endpoint = slice.slice.endpoint.padEnd(20);
    const modeStr = mode.padEnd(13);
    const cases = String(slice.caseCount).padStart(5);
    const passRate = `${(slice.passRate * 100).toFixed(1)}%`.padStart(9);
    const hitAt1 = slice.avgHitAt1.toFixed(3).padStart(9);
    const mrr = slice.avgMrr.toFixed(3).padStart(7);
    const ndcg = slice.avgNdcg.toFixed(3).padStart(9);

    lines.push(`${tier} | ${endpoint} | ${modeStr} | ${cases} | ${passRate} | ${hitAt1} | ${mrr} | ${ndcg}`);
  }

  lines.push('');

  // Comparison Summary
  lines.push('=== Comparison Summary ===');
  lines.push('');

  // Best and worst by pass rate
  const byPassRate = [...sortedSlices].sort((a, b) => b.passRate - a.passRate);
  const best = byPassRate[0];
  const worst = byPassRate[byPassRate.length - 1];

  if (best && worst) {
    const bestMode = best.slice.mode ?? 'default';
    const worstMode = worst.slice.mode ?? 'default';

    lines.push(`Best performing slice:  ${best.slice.endpoint} (${bestMode}) - ${(best.passRate * 100).toFixed(1)}% pass rate`);
    lines.push(`Worst performing slice: ${worst.slice.endpoint} (${worstMode}) - ${(worst.passRate * 100).toFixed(1)}% pass rate`);
    lines.push('');
  }

  // ... more sections

  return lines.join('\n');
}
```

**Pattern:**
1. Build lines array
2. Section headers with `===`
3. ASCII table with column alignment using `padEnd`/`padStart`
4. Sort data for consistent display
5. Summary section with best/worst analysis

### Pattern for 31-01: Format Cohort Comparison

```typescript
/**
 * Format a cohort comparison table for query-type analysis.
 * Phase 31-01: EOPS-01
 */
export function formatCohortComparison(report: RetrievalEvalReport): string {
  const lines: string[] = [];

  if (!report.cohorts || report.cohorts.length === 0) {
    return 'No cohort data to compare.';
  }

  lines.push('');
  lines.push('=== Cohort Comparison ===');
  lines.push('');

  // Table header
  lines.push('Query Type        | Route    | Cases | Pass Rate | Avg Hit@1 | Avg MRR | Governance');
  lines.push('------------------|----------|-------|-----------|-----------|---------|------------');

  // Sort cohorts
  const sortedCohorts = [...report.cohorts].sort((a, b) => {
    if (a.cohort.queryType !== b.cohort.queryType) {
      return a.cohort.queryType.localeCompare(b.cohort.queryType);
    }
    return a.cohort.routeFamily.localeCompare(b.cohort.routeFamily);
  });

  // Table rows
  for (const cohort of sortedCohorts) {
    const queryType = cohort.cohort.queryType.padEnd(16);
    const routeFamily = cohort.cohort.routeFamily.padEnd(8);
    const cases = String(cohort.caseCount).padStart(5);
    const passRate = `${(cohort.passRate * 100).toFixed(1)}%`.padStart(9);
    const hitAt1 = cohort.avgHitAt1.toFixed(3).padStart(9);
    const mrr = cohort.avgMrr.toFixed(3).padStart(7);
    const governance = String(cohort.governanceFailureCount).padStart(10);

    lines.push(`${queryType} | ${routeFamily} | ${cases} | ${passRate} | ${hitAt1} | ${mrr} | ${governance}`);
  }

  lines.push('');

  // Summary
  lines.push('=== Cohort Summary ===');
  lines.push('');

  // Group by query type
  const byQueryType = new Map<string, typeof sortedCohorts>();
  for (const c of sortedCohorts) {
    const existing = byQueryType.get(c.cohort.queryType) ?? [];
    existing.push(c);
    byQueryType.set(c.cohort.queryType, existing);
  }

  for (const [queryType, cohorts] of byQueryType) {
    const totalCases = cohorts.reduce((sum, c) => sum + c.caseCount, 0);
    const avgPassRate = cohorts.reduce((sum, c) => sum + c.passRate * c.caseCount, 0) / totalCases;
    lines.push(`${queryType}: ${totalCases} cases, ${(avgPassRate * 100).toFixed(1)}% avg pass rate`);
  }

  return lines.join('\n');
}
```

### Pattern for 31-03: Format Regression Summary

```typescript
/**
 * Format regression status for CI output.
 * Phase 31-03: EOPS-03
 */
export function formatRegressionSummary(report: RetrievalEvalReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('=== Regression Status ===');
  lines.push('');

  // Count by status
  const regressed = report.slices.filter(s => s.regressionStatus === 'regressed');
  const improved = report.slices.filter(s => s.regressionStatus === 'improved');
  const stable = report.slices.filter(s => s.regressionStatus === 'stable');
  const noBaseline = report.slices.filter(s => s.regressionStatus === 'no-baseline');

  if (regressed.length > 0) {
    lines.push('REGRESSED slices:');
    for (const s of regressed) {
      const mode = s.slice.mode ?? 'default';
      lines.push(`  ${s.slice.endpoint} (${mode}): Hit@1=${s.avgHitAt1.toFixed(3)} MRR=${s.avgMrr.toFixed(3)}`);
    }
    lines.push('');
  }

  if (improved.length > 0) {
    lines.push('IMPROVED slices:');
    for (const s of improved) {
      const mode = s.slice.mode ?? 'default';
      lines.push(`  ${s.slice.endpoint} (${mode}): Hit@1=${s.avgHitAt1.toFixed(3)} MRR=${s.avgMrr.toFixed(3)}`);
    }
    lines.push('');
  }

  lines.push(`Summary: ${regressed.length} regressed, ${improved.length} improved, ${stable.length} stable, ${noBaseline.length} no-baseline`);

  return lines.join('\n');
}
```

---

## 5. CI Runner: eval-ci.ts

### Role
CI-optimized entry point that writes JSON reports, sets GitHub Actions outputs, and exits with appropriate codes.

### Data Flow
```
Environment (TIER, GITHUB_OUTPUT) → eval-ci.ts → CIReport → reports/eval-report.json
                                                    ↓
                                        GitHub Actions outputs
```

### Existing Analog: GitHub Actions Output Helpers

**File:** `evals/scripts/eval-ci.ts:29-58`

```typescript
/**
 * Set a GitHub Actions output variable.
 * Uses GITHUB_OUTPUT env var if available (actions/runner v2+).
 */
function setGitHubOutput(name: string, value: string | number): void {
  const githubOutput = process.env.GITHUB_OUTPUT;

  if (githubOutput) {
    // New format: name=value (append to file)
    const line = `${name}=${value}\n`;
    appendFileSync(githubOutput, line, 'utf8');
  } else {
    // Legacy format or local run: print to stdout
    console.log(`::set-output name=${name}::${value}`);
  }
}

/**
 * Output a GitHub Actions group start.
 */
function startGroup(name: string): void {
  console.log(`::group::${name}`);
}

/**
 * Output a GitHub Actions group end.
 */
function endGroup(): void {
  console.log('::endgroup::');
}
```

**Pattern:**
- Check `process.env.GITHUB_OUTPUT` for modern GitHub Actions
- Fall back to legacy `::set-output` format
- Use `::group::`/`::endgroup::` for collapsible sections

### Pattern for 31-03: Baseline Comparison in CI

```typescript
/**
 * Compare current results against baseline and set CI outputs.
 * Phase 31-03: EOPS-03
 */
async function compareWithBaseline(
  report: CIReport,
  tier: 'smoke' | 'core'
): Promise<RegressionSummary> {
  const baselinePath = resolve(process.cwd(), 'reports', 'baselines', `baseline-${tier}.json`);

  try {
    const baselineContent = await fs.readFile(baselinePath, 'utf-8');
    const baseline = JSON.parse(baselineContent) as BaselineReport;

    const regression: RegressionSummary = {
      regressed: [],
      improved: [],
      stable: [],
      hasRegressions: false,
    };

    // Compare slices
    for (const currentSlice of report.retrieval?.summary?.slices ?? []) {
      const key = `${currentSlice.tier}:${currentSlice.endpoint}:${currentSlice.mode ?? 'none'}`;
      const baselineSlice = baseline.slices.find(s =>
        `${s.slice.tier}:${s.slice.endpoint}:${s.slice.mode ?? 'none'}` === key
      );

      if (baselineSlice) {
        const hitAt1Diff = currentSlice.avgHitAt1 - baselineSlice.avgHitAt1;
        const mrrDiff = currentSlice.avgMrr - baselineSlice.avgMrr;

        if (hitAt1Diff < -0.05 || mrrDiff < -0.05) {
          regression.regressed.push({ key, hitAt1Diff, mrrDiff });
          regression.hasRegressions = true;
        } else if (hitAt1Diff > 0.05 || mrrDiff > 0.05) {
          regression.improved.push({ key, hitAt1Diff, mrrDiff });
        } else {
          regression.stable.push(key);
        }
      }
    }

    return regression;
  } catch {
    // No baseline exists
    return {
      regressed: [],
      improved: [],
      stable: [],
      hasRegressions: false,
      noBaseline: true,
    };
  }
}

/**
 * Set regression-specific GitHub Actions outputs.
 */
function setRegressionOutputs(regression: RegressionSummary): void {
  setGitHubOutput('regressed_count', regression.regressed.length);
  setGitHubOutput('improved_count', regression.improved.length);
  setGitHubOutput('stable_count', regression.stable.length);
  setGitHubOutput('has_regressions', regression.hasRegressions ? 'true' : 'false');

  if (regression.noBaseline) {
    setGitHubOutput('baseline_status', 'no-baseline');
  } else {
    setGitHubOutput('baseline_status', 'available');
  }
}
```

---

## 6. GitHub Actions Workflow

### Role
Orchestrates evaluation runs in CI with appropriate triggers, artifact retention, and conditional logic.

### Data Flow
```
push/PR/schedule → eval.yml → eval-smoke job → reports/eval-report.json
                         ↓
                   eval-core-scheduled job → reports/baseline-core.json (artifact)
```

### Existing Analog: eval.yml

**File:** `.github/workflows/eval.yml:1-86`

```yaml
name: Evaluation

on:
  pull_request:
    branches: [main]
    paths:
      - 'packages/contracts/src/domain/evals/**'
      - 'evals/**'
      - 'packages/server/src/**'
  workflow_dispatch:
    inputs:
      tier:
        description: 'Evaluation tier to run'
        required: false
        default: 'smoke'
        type: choice
        options:
          - smoke
          - core
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday at 6 AM UTC

jobs:
  eval-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... setup steps ...
      - name: Run smoke evaluation
        run: pnpm eval:ci
        env:
          NODE_ENV: test
      - name: Upload eval report (on failure)
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: reports/
          retention-days: 7

  eval-core-scheduled:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.tier == 'core')
    steps:
      # ... setup steps ...
      - name: Run core evaluation
        run: pnpm eval:ci:core
        env:
          NODE_ENV: test
      - name: Upload eval report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-core-report
          path: reports/
          retention-days: 30
```

**Pattern:**
- PR triggers: `pull_request` with path filters
- Manual trigger: `workflow_dispatch` with inputs
- Scheduled: `schedule` with cron
- Conditional job: `if:` expression
- Artifact upload: `actions/upload-artifact@v4`
- Retention: `retention-days` parameter

### Pattern for 31-03: Baseline Persistence Jobs

```yaml
jobs:
  # ... existing eval-smoke job ...

  # New: Download baseline for PR comparison
  download-baseline:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - name: Download latest baseline
        uses: actions/download-artifact@v4
        continue-on-error: true
        with:
          name: baseline-core
          path: reports/baselines/
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # Enhanced: PR smoke with baseline comparison
  eval-smoke-with-baseline:
    needs: download-baseline
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      # ... setup steps ...
      - name: Run smoke evaluation with baseline comparison
        run: pnpm eval:ci
        env:
          NODE_ENV: test
          BASELINE_PATH: reports/baselines/baseline-smoke.json
      - name: Upload eval report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: reports/
          retention-days: 7

  # Enhanced: Scheduled core with baseline write
  eval-core-scheduled:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.tier == 'core')
    steps:
      - uses: actions/checkout@v4
      # ... setup steps ...
      - name: Run core evaluation
        run: pnpm eval:ci:core
        env:
          NODE_ENV: test
          WRITE_BASELINE: 'true'
          BASELINE_PATH: reports/baselines/baseline-core.json
      - name: Upload eval report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-core-report
          path: reports/
          retention-days: 30
      - name: Upload baseline
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: baseline-core
          path: reports/baselines/
          retention-days: 90  # Longer retention for baselines
```

---

## 7. Dataset Tagging

### Role
Evaluation cases carry tags for categorization and filtering. Tags feed into cohort derivation.

### Data Flow
```
Case.tags[] → deriveQueryType() → QueryTypeCohort → CohortKey
```

### Existing Analog: Case Tags

**File:** `evals/retrieval/datasets/core/v1-retrieval-core.ts:64,112,158,204,248`

```typescript
tags: ['ranked', 'v1', 'core', 'semantic', 'multi-hit'],
tags: ['ranked', 'v1', 'core', 'hybrid'],
tags: ['ranked', 'v1', 'core', 'graph-assisted'],
tags: ['bucket-shape', 'v1', 'core', 'semantic', 'governance'],
tags: ['governance', 'v1', 'core', 'semantic', 'mixed-visibility'],
```

**Pattern:**
- Tags are string arrays
- Include: result type, endpoint version, tier, mode, scenario-specific tags
- Multiple classification dimensions possible

### Pattern for 31-01: Query-Type Tags

Add canonical query-type tags to existing cases:

```typescript
// Example: Add query-type tag to governance case
export const v1GovernanceCore = retrievalEvalCaseSchema.parse({
  // ... existing fields ...
  tags: ['governance', 'v1', 'core', 'semantic', 'mixed-visibility', 'governance-sensitive'],
}) as RetrievalEvalCase;

// New tag constants for consistency
export const QUERY_TYPE_TAGS = [
  'error-debugging',
  'how-to',
  'global-constraints',
  'governance-sensitive',
  'general',
] as const;

export type QueryTypeTag = typeof QUERY_TYPE_TAGS[number];
```

---

## Summary: Pattern Application Map

| Phase Section | File | Pattern Source | Key Pattern |
|---------------|------|----------------|-------------|
| 31-01 | `report.ts` | `retrievalEvalSliceKeySchema` | Cohort key schema |
| 31-01 | `types.ts` | `SliceMetrics` | Cohort metrics interface |
| 31-01 | `report.ts` | `buildSliceSummaries` | Map-based grouping |
| 31-01 | `format.ts` | `formatSliceComparison` | ASCII table + summary |
| 31-01 | `datasets/*.ts` | Existing tag arrays | Query-type tags |
| 31-02 | `report.ts` | `retrievalEvalSliceSummarySchema` | Mode comparison fields |
| 31-02 | `types.ts` | `SliceMetrics.selectedMode` | Mode comparison type |
| 31-02 | `format.ts` | `formatSliceComparison` | Mode comparison table |
| 31-03 | `eval-ci.ts` | `setGitHubOutput` | Regression outputs |
| 31-03 | `eval.yml` | Artifact upload pattern | Baseline persistence |
| 31-03 | `report.ts` | Baseline structure | Schema version field |

---

*Pattern mapping complete. Ready for implementation planning.*