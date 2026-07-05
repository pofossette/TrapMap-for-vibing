# Final Fix Wave Report

Date: 2026-07-05

Scope:
- `evals/retrieval/lib/platform-events.ts`
- `evals/retrieval/lib/platform-events.test.ts`
- `evals/scripts/eval-all.ts`
- `evals/scripts/__tests__/eval-all.test.ts`

Findings addressed:

1. Retrieval `/v3/retrieval/search` graph-plan assertion mirroring no longer depends on the non-canonical `graph-plan-mismatch` failure kind. The builder now derives assertion truth from `caseResult.passed`, which survives normalization in `RetrievalEvalReport`, and uses surviving case failure descriptions for the mirrored reason when the case failed.
2. Unified eval platform mirroring now keeps suite-owned event construction inside warning-only handling. If suite event building throws after native eval completion, the runner warns, still closes the adapter, and preserves aggregate exit semantics.

TDD evidence:

- Added retrieval regression proving a failed `/v3` case with normalized `execution-error` still mirrors `graph-plan` as failed.
- Verified RED with:
  - `rtk pnpm test:file -- evals/retrieval/lib/platform-events.test.ts evals/scripts/__tests__/eval-all.test.ts`
  - Failure observed in `retrieval/lib/platform-events.test.ts` before implementation because the builder emitted `graph-plan: passed=true`.
- Added unified-runner regression proving a suite builder throw is warning-only and does not reject the run.
- Verified GREEN with:
  - `rtk pnpm test:file -- evals/retrieval/lib/platform-events.test.ts`
  - `rtk pnpm test:file -- evals/scripts/__tests__/eval-all.test.ts`

Implementation notes:

- Retrieval fix is intentionally minimal and scoped to `/v3` assertion derivation.
- `eval-all` change wraps suite event construction plus publish loop in a warning-only boundary and leaves adapter close handling intact.
- No broader refactors or contract changes were made.

Concerns:

- None beyond the existing unrelated dirty worktree files outside the four edited targets and this report file.

## Follow-up correction wave

Date: 2026-07-05

Expanded scope:
- `packages/contracts/src/domain/evals/report.ts`
- `evals/retrieval/lib/report.ts`
- `evals/retrieval/lib/report.test.ts`
- `evals/retrieval/lib/platform-events.ts`
- `evals/retrieval/lib/platform-events.test.ts`
- `evals/scripts/eval-all.ts`
- `evals/scripts/__tests__/eval-all.test.ts`

Corrected root cause:

1. Using `caseResult.passed` for `/v3` `graph-plan` mirroring was too broad because it conflated graph-plan failures with unrelated governance/outcome failures.
2. The native retrieval report path was still flattening `graph-plan-mismatch` into `execution-error`, so suite-owned mirroring could not rely on canonical report truth.

Changes made:

1. Added `graph-plan-mismatch` to the canonical `RetrievalEvalFailureKind` contract.
2. Updated `evals/retrieval/lib/report.ts::mapFailureKind()` to preserve `graph-plan-mismatch` through native report construction.
3. Restored `/v3` graph-plan mirroring in `evals/retrieval/lib/platform-events.ts` to derive pass/fail and reason from canonical `graph-plan-mismatch` report failures only.
4. Kept the previously added warning-only handling around suite event construction in `evals/scripts/eval-all.ts` unchanged.

Follow-up TDD evidence:

- Added a native report regression proving a real `/v3` graph-plan mismatch survives as `graph-plan-mismatch` in `RetrievalEvalReport`.
- Replaced the prior over-broad `/v3` platform regression with a governance-only failure case proving `graph-plan` does not fail unless the canonical report carries `graph-plan-mismatch`.
- Reused the existing `eval-all` regression proving suite builder throws remain warning-only.
- Verified RED with:
  - `rtk pnpm test:file -- evals/retrieval/lib/report.test.ts evals/retrieval/lib/platform-events.test.ts evals/scripts/__tests__/eval-all.test.ts`
  - Failure observed in `evals/retrieval/lib/report.test.ts` because the report builder still emitted `execution-error` instead of `graph-plan-mismatch`.
- Verified GREEN with:
  - `rtk pnpm test:file -- evals/retrieval/lib/report.test.ts`
  - `rtk pnpm test:file -- evals/retrieval/lib/platform-events.test.ts`
  - `rtk pnpm test:file -- evals/scripts/__tests__/eval-all.test.ts`

Concerns:

- None beyond the pre-existing unrelated dirty worktree files outside the scoped edits and this report file.
