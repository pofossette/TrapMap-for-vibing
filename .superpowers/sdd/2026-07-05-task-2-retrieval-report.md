# Task 2 Report: Move Retrieval Platform Events Into The Retrieval Suite

## Status

DONE

## Scope Executed

- Added suite-owned retrieval platform event builder at `evals/retrieval/lib/platform-events.ts`.
- Added focused builder coverage at `evals/retrieval/lib/platform-events.test.ts`.
- Exported suite-owned read helpers from `evals/retrieval/lib/runner-api.ts` and consumed them directly from the builder.
- Rewired `evals/scripts/eval-all.ts` so retrieval mirroring is delegated to the retrieval suite builder, matching the ownership shape already used by `summary` and `agent-planning`.
- Added unified-runner delegation coverage in `evals/scripts/__tests__/eval-all.test.ts`.

## Design Notes

- `RetrievalEvalReport` remains the truth source for mirrored retrieval platform events.
- Retrieval-specific semantics were preserved:
  - score emission still mirrors `hitAt1`, `hitAt5`, `hitAt10`, `mrr`, `ndcg`, and `recallAt10`
  - failure routing still distinguishes `/v3/retrieval/search` graph-plan failures from non-v3 shape failures
  - platform events remain a warning-only mirror of suite-native output
- `eval-all.ts` now only orchestrates retrieval platform mirroring by delegating to `buildRetrievalPlatformEvents(...)` and publishing the returned events.

## TDD Evidence

### RED

1. `rtk pnpm test:file -- evals/retrieval/lib/platform-events.test.ts`
   - Failed with module load error: `Cannot find module './platform-events.js'`
2. `rtk pnpm test:file -- evals/scripts/__tests__/eval-all.test.ts`
   - Failed in `delegates retrieval platform event construction to the retrieval suite builder`
   - Assertion showed `buildRetrievalPlatformEvents` was called `0` times

### GREEN

1. `rtk pnpm test:file -- evals/retrieval/lib/platform-events.test.ts`
   - Passed: `1` test
2. `rtk pnpm test:file -- evals/scripts/__tests__/eval-all.test.ts`
   - Passed: `10` tests

## Files Changed

- `evals/retrieval/lib/platform-events.ts`
- `evals/retrieval/lib/platform-events.test.ts`
- `evals/retrieval/lib/runner-api.ts`
- `evals/scripts/eval-all.ts`
- `evals/scripts/__tests__/eval-all.test.ts`

## Commits

- Created during closeout; see git history for the final SHA/message.

## Concerns

- None in the implemented scope.
- The worktree contains unrelated pre-existing changes outside this task; they were left untouched.
