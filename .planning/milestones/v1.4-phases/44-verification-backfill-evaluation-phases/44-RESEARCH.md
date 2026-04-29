# Phase 44: Verification backfill for evaluation phases (25-29) - Research

**Researched:** 2026-04-28  
**Domain:** Evaluation verification backfill, Nyquist validation compliance, and requirement closure evidence for phases 25-29  
**Confidence:** MEDIUM

## User Constraints

No `44-CONTEXT.md` exists for this phase. Research scope is constrained by the user prompt, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, the existing phase artifacts for 25-29, and the live eval/CI codebase. [VERIFIED: `.planning/phases/44-verification-backfill-evaluation-phases/44-CONTEXT.md`; VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: codebase reads]

- Phase 44 must write to `.planning/phases/44-verification-backfill-evaluation-phases/44-RESEARCH.md`. [VERIFIED: user prompt]
- Phase 44 must focus on phases 25-29 only, with explicit separation between work Phase 44 should verify directly and work deferred to phases 45-47. [VERIFIED: user prompt; VERIFIED: `.planning/ROADMAP.md`]
- Phase 44 must confirm or challenge satisfaction of `REVAL-01/02/03/04`, `SEVAL-01/02`, and `EOPS-03` based on current evidence, not historical assumptions. [VERIFIED: user prompt]
- Phase 44 must backfill `VERIFICATION.md` coverage for evaluation phases 25-29 and fix the Nyquist non-compliance in phases 26 and 27. [VERIFIED: user prompt; VERIFIED: `.planning/ROADMAP.md`]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVAL-01 | Maintainer can run a TypeScript-native retrieval evaluation command against current TrapMap retrieval endpoints from the monorepo. [VERIFIED: `.planning/REQUIREMENTS.md`] | Direct smoke execution of `evals/retrieval/run.ts` works under `node --import tsx`, but the unified runner path is broken and several smoke cases fail. [VERIFIED: command `node --import tsx evals/retrieval/run.ts --tier smoke`; VERIFIED: command `node --import tsx evals/scripts/eval-all.ts --tier smoke`] |
| REVAL-02 | Retrieval evaluation uses labeled golden datasets that cover smoke and core scenarios for `/v1/retrieval/search` and `/v2/retrieval/search`. [VERIFIED: `.planning/REQUIREMENTS.md`] | v1 and v2 smoke/core datasets exist, and the retrieval contract has expanded further to include v3 slices. [VERIFIED: `evals/retrieval/datasets/**`; VERIFIED: `packages/contracts/src/domain/evals/retrieval.ts`] |
| REVAL-03 | Retrieval evaluation reports ranking metrics including Hit@K, MRR, nDCG, and Recall@K per retrieval mode. [VERIFIED: `.planning/REQUIREMENTS.md`] | Retrieval metric tests pass and live smoke execution prints slice metrics. [VERIFIED: command `pnpm exec vitest run evals/retrieval/lib/metrics.test.ts`; VERIFIED: command `node --import tsx evals/retrieval/run.ts --tier smoke`] |
| REVAL-04 | Retrieval evaluation detects governance failures including forbidden-result leakage, scope violations, and empty-result expectation mismatches. [VERIFIED: `.planning/REQUIREMENTS.md`] | Live retrieval smoke execution surfaces `unexpected-empty`, `unexpected-non-empty`, and `shape-mismatch` failures. [VERIFIED: command `node --import tsx evals/retrieval/run.ts --tier smoke`] |
| SEVAL-01 | Maintainer can run a summary/refinement evaluation flow that scores groundedness, coverage, and citation adherence for retrieval summaries. [VERIFIED: `.planning/REQUIREMENTS.md`] | Smoke execution proves groundedness and coverage scoring exists, but the live report has no first-class citation-adherence field or failure kind. [VERIFIED: command `node --import tsx evals/summary/run.ts --tier smoke`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `evals/summary/lib/report.ts`] |
| SEVAL-02 | Summary evaluation uses milestone-owned evaluation cases with required facts and forbidden claims so hallucinations are visible in reports. [VERIFIED: `.planning/REQUIREMENTS.md`] | Smoke cases exist and summary unit tests pass, but the core tier is still empty. [VERIFIED: `evals/summary/datasets/smoke/summary-smoke.ts`; VERIFIED: `evals/summary/core.ts`; VERIFIED: command `pnpm exec vitest run evals/summary/__tests__/claims.test.ts evals/summary/__tests__/judge.test.ts evals/summary/__tests__/scoring.test.ts`] |
| EOPS-03 | The milestone defines a baseline and failure policy so future retrieval changes can be checked against regressions instead of ad-hoc judgment. [VERIFIED: `.planning/REQUIREMENTS.md`] | Baseline-aware retrieval report types, runner flags, and CI baseline comparison code exist, but CI wiring defects remain outside direct Phase 44 closure. [VERIFIED: `evals/retrieval/run.ts`; VERIFIED: `evals/retrieval/lib/types.ts`; VERIFIED: `evals/scripts/eval-ci.ts`; VERIFIED: `.github/workflows/eval.yml`] |

## Summary

Phase 44 is not greenfield verification work. It is a reconciliation phase: several artifacts already claim closure for phases 25-29, but those claims are inconsistent with the current validation metadata, the current codebase, and current live runner behavior. The largest artifact gap is procedural: Phase 26 and Phase 27 still carry `nyquist_compliant: false` and unresolved Wave 0 placeholders even though substantial test files now exist. [VERIFIED: `.planning/phases/26-retrieval-metrics-runner-and-governance-checks/26-VALIDATION.md`; VERIFIED: `.planning/phases/27-summary-evaluation-and-judge-integration/27-VALIDATION.md`; VERIFIED: `evals/retrieval/*.test.ts`; VERIFIED: `evals/summary/__tests__/*.test.ts`]

The largest code-level gap is not in retrieval evaluation itself. Retrieval has a runnable direct runner, dataset coverage, metric calculators, governance detection, and Phase 29 baseline/failure-policy plumbing. The bigger active regressions are: the unified Phase 28 runner path fails real execution because retrieval report code imports `@trapmap/contracts` through an unresolved package boundary; the summary core tier is still empty; the summary evaluation surface does not expose citation adherence as a scored/verdicted output; and the CI workflow references `steps.eval.outputs.*` without any `id: eval` step. [VERIFIED: command `node --import tsx evals/retrieval/run.ts --tier smoke`; VERIFIED: command `node --import tsx evals/scripts/eval-all.ts --tier smoke`; VERIFIED: `evals/summary/core.ts`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `.github/workflows/eval.yml`]

**Primary recommendation:** Phase 44 should directly backfill truthful `VERIFICATION.md` artifacts for phases 25-29, rewrite phases 26 and 27 validation files into Nyquist-compliant form using the tests that actually exist, and explicitly mark Phase 28 CI/unified-runner defects plus any unmet summary-eval citation/core-tier expectations as deferred gap-closure work rather than silently over-signing them. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: codebase and command evidence]

## Project Constraints (from available project instructions)

- Keep the repo TypeScript-native and inside the existing `pnpm` monorepo workflow. [VERIFIED: `AGENTS.md`; VERIFIED: `package.json`]
- Preserve the separation between contracts, server, CLI, and eval workspace; verification should cite the canonical source file rather than restating behavior from memory. [VERIFIED: `AGENTS.md`; VERIFIED: `packages/contracts/src/index.ts`; VERIFIED: `evals/**`]
- Treat shared schemas in `packages/contracts` as the canonical contract surface. [VERIFIED: `AGENTS.md`; VERIFIED: `packages/contracts/src/domain/evals/*.ts`]
- Do not bypass GSD artifact synchronization; Phase 44 is explicitly a planning/verification artifact phase. [VERIFIED: `AGENTS.md`; VERIFIED: user prompt]
- Prefix shell commands with `rtk` when using shell tooling in this environment. [VERIFIED: `/home/wunai/.codex/RTK.md`]
- No repo-root `CLAUDE.md` exists, so there are no additional project-local CLAUDE directives to add. [VERIFIED: command `test -f CLAUDE.md`]

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard Here |
|---------|---------|---------|--------------|
| Node.js | `v20.19.5` | Executes eval runners directly with `node --import tsx`. | This path worked reliably in the current environment when `pnpm exec tsx` and CLI dev flows were sandbox-sensitive. [VERIFIED: command output; VERIFIED: `package.json`] |
| `tsx` | repo pin `^4.20.3` | Runs TypeScript entrypoints without prebuild. | All eval entrypoints are authored as `.ts` scripts and invoked through `tsx`. [VERIFIED: `package.json`; VERIFIED: `evals/retrieval/run.ts`; VERIFIED: `evals/summary/run.ts`] |
| Vitest | repo pin `^3.2.4` | Verifies retrieval and summary eval logic. | The existing evidence surface for Nyquist remediation is test-heavy and already present. [VERIFIED: `package.json`; VERIFIED: commands running retrieval and summary tests] |
| Zod contracts in `@trapmap/contracts` / `packages/contracts` | workspace | Defines eval case and report schemas. | Phase 44 verification must anchor claims in the canonical contract layer. [VERIFIED: `packages/contracts/src/domain/evals/retrieval.ts`; VERIFIED: `packages/contracts/src/domain/evals/summary.ts`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`] |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `evals/retrieval/run.ts` | repo local | Direct retrieval evaluation evidence. | Use for REVAL confirmation and live mismatch capture. [VERIFIED: file exists; VERIFIED: command output] |
| `evals/summary/run.ts` | repo local | Direct summary evaluation evidence. | Use for SEVAL confirmation and live mismatch capture. [VERIFIED: file exists; VERIFIED: command output] |
| `evals/scripts/eval-all.ts` | repo local | Unified EOPS workflow surface. | Use only to document/defer Phase 28 issues; it is not currently trustworthy as closure evidence. [VERIFIED: file exists; VERIFIED: command output] |
| `.github/workflows/eval.yml` | repo local | CI automation evidence for EOPS work. | Use to identify deferred CI defects, not as proof of full EOPS-02 closure. [VERIFIED: file exists; VERIFIED: file contents] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Re-running only historical verification docs | Live runner/test execution plus doc refresh | Historical docs are stale in multiple places and cannot support Phase 44 sign-off alone. [VERIFIED: phase docs; VERIFIED: command output] |
| Treating all failing eval cases as Phase 44 scope | Requirement-capability verification plus explicit deferred bugs | Phase 44 is a backfill/verification phase, not the full implementation closure for Phase 28 CI and later infrastructure gaps. [VERIFIED: `.planning/ROADMAP.md`] |
| Signing off SEVAL-01 from documentation text alone | Verifying report schema and runner output for citation-adherence evidence | The requirement explicitly names citation adherence, and the live report surface does not currently expose it. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `evals/summary/lib/report.ts`] |

**Installation:** No new dependency is required for Phase 44 research or planning. [VERIFIED: `package.json`; VERIFIED: live commands used only existing workspace tools]

## Architecture Patterns

### Recommended Project Structure

```text
.planning/phases/44-verification-backfill-evaluation-phases/
├── 44-RESEARCH.md          # this artifact
├── 44-VERIFICATION.md      # phase-level closure report
├── 25-evidence-notes.md    # optional working notes if needed
└── plan artifacts...       # executable wave/task breakdown
```

### Pattern 1: Verify Capabilities Separately From Case Pass/Fail
**What:** Treat “the evaluator exists and surfaces the right signals” separately from “the current evaluated system passes every authored case.” [VERIFIED: command `node --import tsx evals/retrieval/run.ts --tier smoke`; VERIFIED: command `node --import tsx evals/summary/run.ts --tier smoke`]

**When to use:** Use this for `REVAL-*`, `SEVAL-*`, and `EOPS-03` confirmation in Phase 44. A red smoke run can still prove that the evaluation capability exists and is detecting mismatches correctly. [VERIFIED: live command output]

### Pattern 2: Backfill Nyquist With Real Existing Tests, Not New Placeholder W0 Entries
**What:** Rewrite retrospective validation files so Wave 0 references the tests and commands that actually exist now. [VERIFIED: `evals/retrieval/runner.test.ts`; VERIFIED: `evals/retrieval/lib/*.test.ts`; VERIFIED: `evals/summary/__tests__/*.test.ts`]

**When to use:** Use this specifically for phases 26 and 27, where the current `VALIDATION.md` files still point at missing or generic placeholders. [VERIFIED: `.planning/phases/26-.../26-VALIDATION.md`; VERIFIED: `.planning/phases/27-.../27-VALIDATION.md`]

### Pattern 3: Backfill Verification Per Phase, But Cross-Check Against Current Codebase
**What:** Each `VERIFICATION.md` should explain the phase’s scope truthfully while also noting later additive changes that affect interpretation. [VERIFIED: existing `VERIFICATION.md` files; VERIFIED: current eval codebase]

**When to use:** Use this for Phase 25 and Phase 29 especially. Their original artifacts exist, but current code now includes v3 retrieval, unified runners, and later CI/baseline layers. [VERIFIED: `evals/retrieval/README.md`; VERIFIED: `packages/contracts/src/domain/evals/retrieval.ts`; VERIFIED: `evals/scripts/eval-ci.ts`]

### Gap Matrix

| Phase | Existing Artifact State | Remaining Gap | Class | Phase 44 Action |
|------|--------------------------|---------------|-------|-----------------|
| 25 | `25-VALIDATION.md` is Nyquist-compliant and `VERIFICATION.md` exists. [VERIFIED: phase files] | Verification should be refreshed to state Phase 25 remains partial for REVAL-01 by original scope, even though later code completes the runner. [VERIFIED: `25-VERIFICATION.md`; VERIFIED: `package.json`; VERIFIED: `evals/retrieval/run.ts`] | documentation-only | Refresh evidence; no code change required. |
| 26 | `26-VALIDATION.md` still says `nyquist_compliant: false`, `wave_0_complete: false`, and every task is `❌ W0`. [VERIFIED: `26-VALIDATION.md`] | Validation artifact is stale; live retrieval test suite exists and passes, and direct smoke execution works but reveals red cases. [VERIFIED: retrieval tests; VERIFIED: live smoke run] | validation + verification docs | Rewrite validation file; backfill truthful verification with current red-case evidence. |
| 27 | `27-VALIDATION.md` is also noncompliant, and `VERIFICATION.md` overclaims completion. [VERIFIED: `27-VALIDATION.md`; VERIFIED: `27-VERIFICATION.md`] | Summary core tier is empty; live smoke run is red; citation adherence is not a first-class report/verdict output. [VERIFIED: `evals/summary/core.ts`; VERIFIED: live smoke run; VERIFIED: summary report contracts] | validation + verification docs + likely code gap | Rewrite validation file; verification must explicitly call out the core-tier/citation gap. |
| 28 | No `VERIFICATION.md` exists in the phase directory. [VERIFIED: `find .planning/phases/28-ci-integration-and-evaluation-reporting -maxdepth 1 -type f`] | Unified runner real execution fails on package resolution; CI workflow has missing `id: eval`, unused `BASELINE_PATH`, and no smoke-baseline upload path. [VERIFIED: `evals/scripts/eval-all.ts`; VERIFIED: `evals/retrieval/lib/report.ts`; VERIFIED: `.github/workflows/eval.yml`; VERIFIED: `evals/scripts/eval-ci.ts`] | documentation + deferred code/CI | Backfill `VERIFICATION.md` describing implemented EOPS-01/02 surface and defer code fixes to later phases. |
| 29 | `29-VALIDATION.md` is compliant and `VERIFICATION.md` exists. [VERIFIED: `29-VALIDATION.md`; VERIFIED: `29-VERIFICATION.md`] | EOPS-03 baseline/failure policy exists, but CI wiring defects mean not every operational path is healthy. [VERIFIED: `evals/retrieval/run.ts`; VERIFIED: `evals/scripts/eval-ci.ts`; VERIFIED: `.github/workflows/eval.yml`] | documentation-only for Phase 44; code deferred | Refresh verification evidence and keep CI defects deferred. |

### Direct vs Deferred Scope

**Phase 44 should verify directly:**

- Phase 25 contract/dataset foundation still exists and is traceable to `REVAL-02`. [VERIFIED: `packages/contracts/src/domain/evals/retrieval.ts`; VERIFIED: `evals/retrieval/datasets/**`]
- Phase 26 retrieval runner, metrics, governance verdicts, and report surface exist, with live smoke execution as current proof. [VERIFIED: `evals/retrieval/run.ts`; VERIFIED: retrieval tests; VERIFIED: live smoke run]
- Phase 27 summary runner, smoke datasets, groundedness/coverage scoring, and forbidden-claim detection exist, with live smoke execution as current proof. [VERIFIED: `evals/summary/run.ts`; VERIFIED: summary tests; VERIFIED: live smoke run]
- Phase 29 baseline/failure-policy plumbing exists in retrieval report types, CLI flags, and CI helper code. [VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `evals/retrieval/run.ts`; VERIFIED: `evals/scripts/eval-ci.ts`]
- Nyquist remediation for phases 26 and 27 can be completed by rewriting `VALIDATION.md` around existing tests and executable commands. [VERIFIED: phase validation files; VERIFIED: existing tests]

**Phase 44 should defer explicitly:**

- Phase 28 CI workflow correctness, including the missing `id: eval` step outputs, smoke-baseline publication mismatch, and unified-runner module-resolution break. [VERIFIED: `.github/workflows/eval.yml`; VERIFIED: `evals/scripts/eval-all.ts`; VERIFIED: `evals/retrieval/lib/report.ts`]  
  This belongs with later EOPS-02 closure phases, especially 46 and 47. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/REQUIREMENTS.md`]
- Any attempt to make all retrieval and summary smoke cases pass. [VERIFIED: live smoke runs]  
  Those are code/product expectation mismatches, not just verification artifact gaps. [VERIFIED: live smoke runs]
- Summary core-tier dataset expansion and any true citation-adherence scoring/remediation if the team decides the current implementation is insufficient for SEVAL-01. [VERIFIED: `evals/summary/core.ts`; VERIFIED: summary report/judge code]

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Requirement sign-off | New ad hoc spreadsheets or handwritten checklists | Existing phase docs plus live command evidence | The codebase already contains the authoritative tests, runners, and contracts. [VERIFIED: phase files; VERIFIED: eval files] |
| Nyquist backfill | Fresh placeholder Wave 0 items | Existing tests and direct runner commands | The noncompliance is stale metadata, not absence of all verification assets. [VERIFIED: `26-VALIDATION.md`; VERIFIED: `27-VALIDATION.md`; VERIFIED: existing tests] |
| EOPS-03 proof | New baseline subsystem | Existing retrieval baseline/report types and `eval-ci.ts` comparison code | The baseline/failure-policy model already exists; the gap is operational wiring and truthful verification. [VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `evals/scripts/eval-ci.ts`] |

**Key insight:** Phase 44 should not try to hide code/runtime failures behind cleaner docs. Its job is to make the verification artifacts honest, executable, and scoped correctly. [VERIFIED: user prompt; VERIFIED: command output]

## Common Pitfalls

### Pitfall 1: Treating historical verification docs as authoritative after later phases landed
**What goes wrong:** A `VERIFICATION.md` written on 2026-04-21 is accepted as current truth even though the codebase now contains v3 retrieval, unified runners, and later CI layers. [VERIFIED: phase verification dates; VERIFIED: current eval files]
**Why it happens:** Backfill phases are easy to reduce to editorial cleanup. [ASSUMED]
**How to avoid:** Re-run direct commands and tests for every requirement claim that Phase 44 signs off. [VERIFIED: command set used in this research]
**Warning signs:** The artifact says “complete,” but the nearest executable path is red or missing. [VERIFIED: Phase 27 verification vs live smoke run]

### Pitfall 2: Confusing failing evaluation cases with missing evaluator features
**What goes wrong:** A red smoke run is interpreted as “REVAL/SEVAL does not exist.” [VERIFIED: live retrieval and summary smoke runs]
**Why it happens:** The same command proves both capability and current mismatch. [ASSUMED]
**How to avoid:** Separate “can run and detect” from “currently passes all cases” in the verification narrative. [VERIFIED: command output]
**Warning signs:** Requirement closure is blocked only because the product under test is red, not because the evaluation surface is absent. [ASSUMED]

### Pitfall 3: Over-signing SEVAL-01 from claims/citation parsing helpers alone
**What goes wrong:** Citation extraction utilities are treated as proof that citation adherence is actually scored. [VERIFIED: `evals/summary/lib/claims.ts`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`]
**Why it happens:** The Phase 27 docs mention citation adherence, but the report schema and failure kinds only expose groundedness, coverage, forbidden claims, missing summary, and execution error. [VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `evals/summary/lib/report.ts`]
**How to avoid:** Require an explicit citation-adherence output, verdict, or documented acceptance rationale before final SEVAL-01 sign-off. [ASSUMED]
**Warning signs:** No summary report field, threshold, or failure kind mentions citations. [VERIFIED: `packages/contracts/src/domain/evals/report.ts`]

### Pitfall 4: Letting Phase 28 CI bugs leak into Phase 44 acceptance criteria
**What goes wrong:** Phase 44 becomes a hidden implementation phase for CI fixes. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/REQUIREMENTS.md`]
**Why it happens:** The same files (`eval-all.ts`, `eval-ci.ts`, `eval.yml`) sit adjacent to evaluation verification work. [VERIFIED: file layout]
**How to avoid:** Record the defects in the Phase 28 verification backfill, but defer repair work to the later EOPS closure phases. [VERIFIED: roadmap mapping]
**Warning signs:** Task lists start editing GitHub Actions instead of producing truthful verification artifacts and Nyquist-compliant validation docs. [ASSUMED]

## Code Examples

Verified commands and evidence seams the planner/executor should use:

### Retrieval Direct Evidence
```bash
node --import tsx evals/retrieval/run.ts --tier smoke --dry-run
node --import tsx evals/retrieval/run.ts --tier smoke
pnpm exec vitest run \
  evals/retrieval/datasets/retrieval-datasets.test.ts \
  evals/retrieval/lib/metrics.test.ts \
  evals/retrieval/lib/normalize.test.ts \
  evals/retrieval/lib/report.test.ts \
  evals/retrieval/lib/assertions.test.ts \
  evals/retrieval/runner.test.ts
```
[VERIFIED: command output]

### Summary Direct Evidence
```bash
node --import tsx evals/summary/run.ts --tier smoke --dry-run
node --import tsx evals/summary/run.ts --tier smoke
node --import tsx evals/summary/run.ts --tier core --allow-empty
pnpm exec vitest run \
  evals/summary/__tests__/claims.test.ts \
  evals/summary/__tests__/judge.test.ts \
  evals/summary/__tests__/scoring.test.ts
```
[VERIFIED: command output]

### Canonical CI / Unified Runner Evidence
```bash
node --import tsx evals/scripts/eval-all.ts --tier smoke
rg -n "steps\\.eval\\.outputs|id: eval|baseline-smoke|baseline-core" \
  .github/workflows/eval.yml evals/scripts/eval-ci.ts
```
[VERIFIED: command output]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase-local claims only | Phase-local claims plus live runner/test reconciliation | Phase 44 scope | Makes verification truthful instead of archival. [VERIFIED: user prompt] |
| Retrieval-only v1/v2 foundation | Retrieval stack now includes v3 graph-plan slices and baseline-aware metadata | After phases 29-31 | Older phase docs are partially stale by omission. [VERIFIED: `evals/retrieval/README.md`; VERIFIED: `packages/contracts/src/domain/evals/retrieval.ts`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`] |
| Summary smoke-only artifact claims | Summary code now includes live endpoint execution, but core remains empty and citation scoring is still not explicit | After Phase 27 implementation | Verification must distinguish implemented smoke flow from still-missing completeness. [VERIFIED: `evals/summary/run.ts`; VERIFIED: `evals/summary/core.ts`; VERIFIED: report contracts] |

**Deprecated/outdated:**

- The Phase 26 and 27 validation files are outdated as operational guidance because they still declare missing Wave 0 assets that now exist. [VERIFIED: `26-VALIDATION.md`; VERIFIED: `27-VALIDATION.md`; VERIFIED: existing tests]
- The Phase 27 verification conclusion is outdated because it says the phase “PASSED” while the current code still has an empty core tier and no explicit citation-adherence score/output. [VERIFIED: `27-VERIFICATION.md`; VERIFIED: `evals/summary/core.ts`; VERIFIED: summary report contracts]
- The Phase 28 maintainer/CI surface is not safe to over-sign: the unified runner and workflow still have live defects. [VERIFIED: command `node --import tsx evals/scripts/eval-all.ts --tier smoke`; VERIFIED: `.github/workflows/eval.yml`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 44 is allowed to leave active evaluation-case failures unresolved as long as it documents them truthfully and limits itself to verification backfill. [ASSUMED] | Summary; Direct vs Deferred Scope | The planner might need to expand Phase 44 into implementation work if the stakeholder expects all eval cases green. |
| A2 | SEVAL-01 should be treated as not fully confirmable unless citation adherence is made explicit in outputs or the team accepts groundedness-plus-claims extraction as sufficient. [ASSUMED] | Summary; Common Pitfalls | If the team already considers implicit citation tracking sufficient, the planner may over-allocate remediation work. |
| A3 | The `node --import tsx` command path is acceptable verification evidence for this environment even though repo scripts generally use `pnpm exec tsx`. [ASSUMED] | Standard Stack; Code Examples | If the planner insists on script-only evidence, some commands will need to be re-executed outside this sandbox shape. |

## Open Questions (RESOLVED)

1. **Should Phase 44 treat SEVAL-01 as fully satisfied today?**
   - What we know: the runner scores groundedness and coverage, and claims code preserves citation IDs, but the live report/failure surface has no citation-adherence metric or verdict. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `evals/summary/lib/claims.ts`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `evals/summary/lib/report.ts`]
   - **RESOLVED:** No. Phase 44 should not confirm `SEVAL-01` as unconditionally satisfied on current evidence. The defensible path is to keep citation-adherence uncertainty explicit, allow `SEVAL-01` to remain caveated or deferred in the closure matrix, and revise the Phase 44 roadmap goal so it requires truthful confirmation/caveats/blockers rather than unconditional satisfaction. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `evals/summary/lib/report.ts`; VERIFIED: user revision instructions]

2. **Should Phase 44 merely document the red smoke results or also open follow-on tasks immediately?**
   - What we know: retrieval smoke currently finishes with 6/9 passing, and summary smoke with 1/3 passing. [VERIFIED: command output]
   - **RESOLVED:** Phase 44 should remain artifact-focused. It should record the red smoke results as verification evidence, preserve capability-vs-pass/fail separation, and defer code-fix follow-up work to later phases instead of reopening implementation inside this verification backfill phase. [VERIFIED: user revision instructions; VERIFIED: `.planning/ROADMAP.md`; VERIFIED: live smoke command evidence]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Direct eval runner execution | ✓ | `v20.19.5` | — |
| `pnpm` | Test execution and script references | ✓ | `10.33.0` | — |
| Vitest | Automated evidence for Nyquist remediation | ✓ | `3.2.4` | — |
| `tsx` | TypeScript entrypoint execution | ✓ | repo dependency | Use `node --import tsx` if `pnpm exec tsx` is sandbox-sensitive. [VERIFIED: command behavior] |
| TrapMap CLI dev mode | Skill/trap retrieval before planning | ⚠️ blocked in this sandbox shape | EPERM on `tsx` IPC pipe | Record as blocked; do not fabricate empty retrieval results. [VERIFIED: command output] |

**Missing dependencies with no fallback:**
- None for Phase 44 research itself. [VERIFIED: commands executed successfully with existing tools]

**Missing dependencies with fallback:**
- TrapMap CLI dev-mode retrieval was blocked by sandbox pipe permissions, so this research used direct codebase evidence instead. [VERIFIED: command output]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest 3.2.4` [VERIFIED: command output] |
| Config file | `vitest.config.ts` [VERIFIED: repo file] |
| Quick run command | `pnpm exec vitest run evals/retrieval/runner.test.ts evals/summary/__tests__/judge.test.ts` [VERIFIED: files exist; VERIFIED: command output] |
| Full suite command | `pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts evals/retrieval/lib/metrics.test.ts evals/retrieval/lib/normalize.test.ts evals/retrieval/lib/report.test.ts evals/retrieval/lib/assertions.test.ts evals/retrieval/runner.test.ts evals/summary/__tests__/claims.test.ts evals/summary/__tests__/judge.test.ts evals/summary/__tests__/scoring.test.ts` [VERIFIED: command output] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVAL-01 | Retrieval runner loads and executes cases from the monorepo | smoke / integration | `node --import tsx evals/retrieval/run.ts --tier smoke` | ✅ |
| REVAL-02 | v1/v2 datasets exist and validate | unit | `pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts` | ✅ |
| REVAL-03 | Metrics compute deterministically | unit | `pnpm exec vitest run evals/retrieval/lib/metrics.test.ts evals/retrieval/lib/report.test.ts` | ✅ |
| REVAL-04 | Governance and outcome mismatches surface explicitly | unit + smoke | `pnpm exec vitest run evals/retrieval/lib/assertions.test.ts evals/retrieval/runner.test.ts && node --import tsx evals/retrieval/run.ts --tier smoke` | ✅ |
| SEVAL-01 | Summary runner scores groundedness/coverage on live smoke cases | unit + smoke | `pnpm exec vitest run evals/summary/__tests__/judge.test.ts evals/summary/__tests__/scoring.test.ts && node --import tsx evals/summary/run.ts --tier smoke` | ✅ |
| SEVAL-02 | Summary cases carry required facts and forbidden claims | unit | `pnpm exec vitest run evals/summary/__tests__/claims.test.ts evals/summary/__tests__/judge.test.ts` | ✅ |
| EOPS-03 | Retrieval baseline/failure-policy fields exist | unit + code audit | `pnpm exec vitest run evals/retrieval/lib/report.test.ts && rg -n "baseline|regressionStatus|fallbackApplied|selectedMode" evals/retrieval evals/scripts/eval-ci.ts packages/contracts/src` | ✅ |

### Sampling Rate
- **Per task commit:** run the targeted phase verification command for the touched artifact plus the closest related test file. [VERIFIED: current test layout]
- **Per wave merge:** run the full suite above plus the direct smoke runners. [VERIFIED: current command evidence]
- **Phase gate:** all verification artifacts written, phases 26/27 validation files made Nyquist-compliant, and direct smoke results documented truthfully even if red. [ASSUMED]

### Wave 0 Gaps
- None for Phase 26 retrieval backfill if validation is rewritten around the existing retrieval tests. [VERIFIED: retrieval tests exist]
- None for Phase 27 Nyquist metadata if the validation contract is rewritten around existing summary tests and smoke execution. [VERIFIED: summary tests exist; VERIFIED: summary smoke runner works]
- Functional gaps remain outside Wave 0: summary core dataset absence, citation-adherence non-explicitness, unified runner failure, and CI workflow defects. [VERIFIED: `evals/summary/core.ts`; VERIFIED: summary report contracts; VERIFIED: unified runner command; VERIFIED: `.github/workflows/eval.yml`]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse existing session-backed route execution during live eval runs. [VERIFIED: `evals/retrieval/lib/adapters.ts`; VERIFIED: `evals/summary/run.ts`] |
| V3 Session Management | yes | Use seeded actor sessions rather than bypassing auth in verification claims. [VERIFIED: `evals/retrieval/lib/adapters.ts`; VERIFIED: `evals/summary/run.ts`] |
| V4 Access Control | yes | Governance failures must remain separate and always visible. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: retrieval smoke output] |
| V5 Input Validation | yes | Zod-backed eval case and report schemas in `packages/contracts`. [VERIFIED: contract files] |
| V6 Cryptography | no | No new crypto surface in this phase. [VERIFIED: phase scope] |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Silent governance leak hidden by good ranking | Information Disclosure | Keep `forbidden-hit` and empty-result mismatches as explicit hard failures. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: retrieval output] |
| False sign-off from stale verification docs | Repudiation | Require live command/test evidence in each backfilled `VERIFICATION.md`. [VERIFIED: current artifact drift] |
| CI regression comment using missing outputs | Tampering / Reliability | Fix workflow step wiring in later CI-closure phase; do not claim it works now. [VERIFIED: `.github/workflows/eval.yml`] |

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` - Phase 44 goal and deferred phase boundaries. [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` - Requirement wording and status table. [VERIFIED: file read]
- `.planning/phases/25-29/*` artifacts - Existing validation/verification claims and gaps. [VERIFIED: file reads]
- `package.json` - Canonical eval script surface. [VERIFIED: file read]
- `evals/retrieval/**`, `evals/summary/**`, `evals/scripts/**` - Current eval implementation. [VERIFIED: file reads; VERIFIED: grep]
- `.github/workflows/eval.yml` - Current CI automation evidence. [VERIFIED: file read]
- Direct command evidence on 2026-04-28:
  - `pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts evals/retrieval/lib/metrics.test.ts evals/retrieval/lib/normalize.test.ts evals/retrieval/lib/report.test.ts evals/retrieval/lib/assertions.test.ts`
  - `pnpm exec vitest run evals/retrieval/runner.test.ts`
  - `pnpm exec vitest run evals/summary/__tests__/claims.test.ts evals/summary/__tests__/judge.test.ts evals/summary/__tests__/scoring.test.ts`
  - `node --import tsx evals/retrieval/run.ts --tier smoke --dry-run`
  - `node --import tsx evals/retrieval/run.ts --tier smoke`
  - `node --import tsx evals/summary/run.ts --tier smoke --dry-run`
  - `node --import tsx evals/summary/run.ts --tier smoke`
  - `node --import tsx evals/summary/run.ts --tier core`
  - `node --import tsx evals/scripts/eval-all.ts --tier smoke`

### Secondary (MEDIUM confidence)
- `AGENTS.md` and project skill docs - workflow and project constraints used to scope research. [VERIFIED: file reads]

### Tertiary (LOW confidence)
- None. All material findings above were verified directly in this session. [VERIFIED: session evidence]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - based on repo-local scripts, files, and executed commands.  
- Architecture: MEDIUM - direct file evidence is strong, but final Phase 44 scope still depends on whether the stakeholder expects red eval cases to be fixed in-phase.  
- Pitfalls: MEDIUM - grounded in observed drift, with some planning implications inferred.  

**Research date:** 2026-04-28  
**Valid until:** 2026-05-05

## RESEARCH COMPLETE

**Phase:** 44 - Verification backfill for evaluation phases (25-29)  
**Confidence:** MEDIUM

### Key Findings
- Phases 26 and 27 are procedurally noncompliant with Nyquist today because their `VALIDATION.md` files still declare unresolved Wave 0 placeholders even though the relevant tests now exist. [VERIFIED: `26-VALIDATION.md`; VERIFIED: `27-VALIDATION.md`; VERIFIED: test files]
- Phase 28 has no `VERIFICATION.md`, and its unified runner / CI paths have live defects that should be documented but deferred rather than silently fixed inside verification backfill. [VERIFIED: phase file listing; VERIFIED: unified runner command; VERIFIED: `.github/workflows/eval.yml`]
- Retrieval evaluation capabilities are implemented and directly runnable, but current smoke execution is red on several authored cases; that is evaluator evidence, not proof the evaluator is missing. [VERIFIED: live retrieval smoke run]
- Summary evaluation capabilities are only partially confirmable: smoke execution exists, but the core tier is empty and citation adherence is not explicit in the report/verdict surface. [VERIFIED: live summary smoke/core runs; VERIFIED: summary report contracts]
- EOPS-03 baseline/failure-policy plumbing exists in Phase 29 code, but CI operational correctness remains incomplete and belongs to later closure phases. [VERIFIED: retrieval baseline files; VERIFIED: `.github/workflows/eval.yml`; VERIFIED: roadmap mapping]

### File Created
`.planning/phases/44-verification-backfill-evaluation-phases/44-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Derived from repo files and executed commands. |
| Architecture | MEDIUM | Scope split is evidence-based, but some acceptance decisions still need planner/stakeholder judgment. |
| Pitfalls | MEDIUM | Based on direct drift and runtime failures, with limited inference for future tasking. |

### Open Questions (RESOLVED)
- `SEVAL-01` should not be signed off unconditionally in Phase 44 unless citation-adherence evidence becomes explicit; the roadmap and closure matrix should preserve a caveated or deferred outcome instead. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `packages/contracts/src/domain/evals/report.ts`; VERIFIED: `evals/summary/lib/report.ts`]
- Phase 44 should stay artifact-focused and use red smoke results as truthful verification evidence, with any remediation remaining deferred to later phases. [VERIFIED: user revision instructions; VERIFIED: `.planning/ROADMAP.md`; VERIFIED: live smoke command evidence]

### Ready for Planning
Research complete. Planner can now decompose Phase 44 into: evidence collection/backfill by phase, Nyquist remediation for phases 26 and 27, direct requirement verification runs, and explicit deferred-gap recording for later EOPS closure phases.
