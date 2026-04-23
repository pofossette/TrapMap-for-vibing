# Phase 31: CI - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning
**Mode:** Derived from new Phase 29-30 targets and existing Phase 28 reporting baseline

<domain>
## Phase Boundary

Phase 31 should extend the current evaluation automation so regressions are visible by retrieval mode, query slice, and benchmark cohort rather than only by endpoint/tier.

This phase is about benchmark breadth and regression reporting quality after real execution is in place.

In scope:
- Expand datasets and reporting around retrieval modes and query-type slices
- Compare mode performance explicitly in reports
- Strengthen CI/nightly reporting for regression detection across mode cohorts
- Establish a baseline structure that maintainers can interpret without reading raw JSON manually

Out of scope:
- Fundamental retrieval algorithm rewrites
- First-time fixture seeding or summary execution plumbing
- New product-facing API features unless required for reporting identifiers

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- Phase 31 depends on Phase 30 producing real execution and trustworthy trace/context data.
- CI should keep a fast smoke path and a deeper scheduled path; avoid forcing expensive checks into every PR run.
- Baseline comparison should be machine-readable first, human-friendly second.
- Governance leakage must continue to be reported separately from relevance or groundedness metrics.

### Target direction

- Promote mode-aware slices to a first-class reporting dimension.
- Add benchmark groupings such as error-debugging, how-to, architecture/global, and governance-sensitive scenarios if the datasets support them.
- Keep local developer ergonomics simple with `pnpm` scripts while making reports useful in CI artifacts and scheduled runs.

</decisions>

<code_context>
## Existing Code Insights

### Existing CI/reporting foundation

- Unified eval scripts and combined reporting already exist from Phase 28 in [eval-all.ts](/home/wunai/Disks/Data/my-project/Trap-Map/evals/scripts/eval-all.ts) and [eval-ci.ts](/home/wunai/Disks/Data/my-project/Trap-Map/evals/scripts/eval-ci.ts).
- GitHub Actions workflow wiring already exists in [.github/workflows/eval.yml](/home/wunai/Disks/Data/my-project/Trap-Map/.github/workflows/eval.yml).

### Existing slice reporting

- Retrieval runner already aggregates by `tier + endpoint + mode` in [run.ts](/home/wunai/Disks/Data/my-project/Trap-Map/evals/retrieval/run.ts:184).
- That is a good base, but it does not yet cover richer cohorts like query type, corpus type, or routing family.

### Existing documentation/reporting baseline

- Eval workspace docs already explain maintainer workflows in [evals/README.md](/home/wunai/Disks/Data/my-project/Trap-Map/evals/README.md).
- Phase 31 should extend, not replace, that structure.

### Current limitations inherited from earlier phases

- Current core retrieval datasets cover some mode variation, but they are still thin for benchmarking default mode decisions.
- Summary reporting exists, but without richer real traces it cannot support strong context-quality comparisons yet.

</code_context>

<specifics>
## Specific Ideas

- Add dataset tags or explicit slice fields for query categories such as:
  - error-debugging
  - how-to
  - global-constraints
  - governance-sensitive
- Produce regression summaries that answer:
  - which mode improved
  - which mode regressed
  - whether regressions are relevance, groundedness, or governance related
- Consider separate thresholds for PR smoke, main-branch smoke, and scheduled core runs.
- Add baseline artifact retention and comparison-friendly JSON structure if current reports are too presentation-oriented.

</specifics>

<deferred>
## Deferred Ideas

- Full dashboard service
- External benchmark publishing
- Online experiment routing based on live traffic

</deferred>
