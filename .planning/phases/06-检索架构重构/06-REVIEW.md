---
phase: 06-检索架构重构
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/lib/retrieval/types.ts
  - packages/server/src/lib/retrieval/filters.ts
  - packages/server/src/lib/retrieval/recall/semantic.ts
  - packages/server/src/lib/retrieval/assembly.ts
  - packages/contracts/src/domain/retrieval.ts
  - packages/cli/src/commands/retrieval.ts
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-04-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the retrieval architecture implementation consisting of orchestrator, types, filters, semantic recall, assembly, contracts, and CLI commands. The code demonstrates a well-structured modular design with clear separation of concerns. Security filtering is properly implemented with approval state, team access, and security level checks before any semantic search occurs. However, there are several areas requiring attention: missing error handling in parallel embedding operations, unused type definitions, and insufficient input validation in the CLI.

## Critical Issues

### CR-01: Unhandled Promise Rejection in Parallel Embedding Generation

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:58-65`
**Issue:** The `Promise.all()` call for generating embeddings has no error handling. If a single entry fails to embed, the entire search operation will fail with an unhandled rejection, potentially crashing the server or leaving the client with an error instead of partial results.
**Fix:**
```typescript
// Compute embeddings and scores for all eligible entries
const scoredEntries = await Promise.all(
  eligibleEntries.map(async (entry) => {
    try {
      const entryVector = await semanticGetEntryEmbedding(entry);
      const similarity = cosineSimilarity(queryVector, entryVector);
      const score = computeScore(similarity, entry, parsed.filters);
      return { entry, score };
    } catch (error) {
      // Log and return a low score instead of failing the entire search
      console.error(`Failed to generate embedding for entry ${entry.id}:`, error);
      return { entry, score: 0 };
    }
  }),
);
```

### CR-02: Missing NaN Check in CLI Input Parsing

**File:** `packages/cli/src/commands/retrieval.ts:118`
**Issue:** `Number.parseInt(flags.maxResults, 10)` can return `NaN` if the input is not a valid number string. This `NaN` value would then be sent to the API, potentially causing unexpected behavior or bypassing the API's validation.
**Fix:**
```typescript
const maxResults = Number.parseInt(flags.maxResults, 10);
if (Number.isNaN(maxResults)) {
  throw new Error('--max-results must be a valid number');
}

// Build request body
const body = {
  seed: searchSeed,
  filters,
  maxResults,
  includeRefinement: flags.refinement ?? true,
};
```

## Warnings

### WR-01: Unused Type Definition - RetrievalPipelineContext

**File:** `packages/server/src/lib/retrieval/types.ts:14-23`
**Issue:** The `RetrievalPipelineContext` interface is defined but never used in the orchestrator. This suggests incomplete refactoring or dead code.
**Fix:** Either implement the context passing pattern or remove the unused type definition. If planning to use it in future extensions, add a comment indicating its purpose.

### WR-02: Unused Type Definition - RetrievalStats

**File:** `packages/server/src/lib/retrieval/types.ts:40-49`
**Issue:** The `RetrievalStats` interface is defined but never used. This indicates incomplete implementation of metrics/observability features.
**Fix:** Either implement stats collection in the orchestrator or remove the unused type. Consider adding basic stats tracking for debugging.

### WR-03: TODO Comment for Unimplemented Refinement

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:118-129`
**Issue:** There's a TODO comment indicating unimplemented LLM-based refinement functionality. The function always returns `null`, which is fine for now, but the TODO should be tracked.
**Fix:** Create a tracking issue in the project management system and reference it in the TODO comment:
```typescript
// TODO: Implement actual LLM-based refinement here
// Tracking: https://github.com/your-repo/issues/XXX
```

### WR-04: Redundant Null Coalescing in CLI

**File:** `packages/cli/src/commands/retrieval.ts:119`
**Issue:** `flags.refinement ?? true` is redundant because the option definition `--no-refinement` already sets `refinement` to `false` when the flag is present, and `undefined` otherwise.
**Fix:** The code is functionally correct but could be clearer. Consider using `flags.refinement !== false` for explicit intent.

### WR-05: Missing Error Context in Vector Dimension Check

**File:** `packages/server/src/lib/retrieval/recall/semantic.ts:30-33`
**Issue:** The error thrown when vector dimensions don't match doesn't include the actual dimensions, making debugging difficult.
**Fix:**
```typescript
if (a.length !== b.length) {
  throw new Error(`Vector dimensions must match: got ${a.length} and ${b.length}`);
}
```

## Info

### IN-01: Inconsistent Parameter Type in generateRefinement

**File:** `packages/server/src/lib/retrieval/orchestrator.ts:103-107`
**Issue:** The `generateRefinement` function uses `unknown[]` for `globalConstraints` and `projectKnowledge` parameters instead of the proper `RetrievalMatch[]` type, losing type safety.
**Fix:**
```typescript
async function generateRefinement(
  query: string,
  globalConstraints: RetrievalMatch[],
  projectKnowledge: RetrievalMatch[],
): Promise<string | null> {
```

### IN-02: Inefficient Label Matching Algorithm

**File:** `packages/server/src/lib/retrieval/recall/semantic.ts:70-71`
**Issue:** Using `filter()` + `includes()` for label matching creates an intermediate array. Using `some()` would be more efficient for counting matches.
**Fix:**
```typescript
if (filters.labels.length > 0) {
  const matchingLabels = filters.labels.filter((label) => entry.labels.includes(label));
  const labelBoost = matchingLabels.length * 0.05;
  score = Math.min(1, score + labelBoost);
}
```
Could be optimized to:
```typescript
if (filters.labels.length > 0) {
  const matchCount = filters.labels.reduce((count, label) => count + (entry.labels.includes(label) ? 1 : 0), 0);
  const labelBoost = matchCount * 0.05;
  score = Math.min(1, score + labelBoost);
}
```

---

_Reviewed: 2026-04-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
