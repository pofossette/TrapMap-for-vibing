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
