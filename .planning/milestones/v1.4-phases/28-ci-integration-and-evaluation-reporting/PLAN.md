# Phase 28: CI Integration and Evaluation Reporting

**Goal:** Make the evaluation system operational in normal development and CI flows

**Requirements:** EOPS-01, EOPS-02

---

## Wave 1: Maintainer Workflows (28-01)

### 28-01: Wire pnpm scripts, docs, and report summaries for maintainer workflows

**depends_on:** [27-01, 27-02]
**wave:** 1
**files_modified:**
  - evals/README.md
  - evals/summary/README.md
  - package.json
  - evals/retrieval/lib/format.ts
  - evals/summary/lib/format.ts
  - evals/scripts/eval-all.ts (new)
**autonomous:** true

**Summary:**
Consolidate pnpm scripts for unified evaluation entry points, enhance report formatting for cross-endpoint/mode comparison, and update documentation with clear maintainer guidance for adding cases and interpreting failures.

---

## Wave 2: CI Automation (28-02)

### 28-02: Integrate smoke/core evaluation paths into CI-ready automation

**depends_on:** [28-01]
**wave:** 2
**files_modified:**
  - .github/workflows/eval.yml (new)
  - evals/scripts/eval-ci.ts (new)
  - reports/.gitkeep (new)
  - .gitignore
**autonomous:** true

**Summary:**
Create GitHub Actions workflow for smoke evaluations on PRs and core evaluations on schedule/main merges. Add CI-friendly entry point that outputs reports to the reports/ directory and provides clear exit codes for pass/fail status.

---

## Verification Criteria

1. `pnpm eval:smoke` runs both retrieval and summary smoke tests and outputs comparable slice summaries
2. `pnpm eval:core` runs full evaluation suite with JSON report output
3. `evals/README.md` documents how to add cases and interpret failure reports
4. `.github/workflows/eval.yml` exists and runs `eval:smoke` on pull requests
5. Reports written to `reports/` directory are machine-readable JSON

## Must_Haves (Goal-Backward Verification)

- [ ] Unified `pnpm eval:smoke` script that runs both retrieval and summary smoke evaluations
- [ ] Documentation in `evals/README.md` explaining case authoring workflow
- [ ] Report comparison across endpoint and retrieval mode combinations visible in terminal output
- [ ] GitHub Actions workflow file that can be triggered on PRs
- [ ] CI-friendly JSON output path for regression tracking

---

*Phase: 28-ci-integration-and-evaluation-reporting*
*Created: 2026-04-21*
