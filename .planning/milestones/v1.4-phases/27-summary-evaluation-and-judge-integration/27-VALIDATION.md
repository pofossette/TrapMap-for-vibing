---
phase: "27"
slug: summary-evaluation-and-judge-integration
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
updated: 2026-04-28
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm exec vitest run evals/summary/**/*.test.ts` |
| **Full suite command** | `pnpm test --run` |
| **Direct runner (dry-run)** | `node --import tsx evals/summary/run.ts --tier smoke --dry-run` |
| **Direct runner (live smoke)** | `node --import tsx evals/summary/run.ts --tier smoke` |
| **Direct runner (live core, allow-empty)** | `node --import tsx evals/summary/run.ts --tier core --allow-empty` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run evals/summary/**/*.test.ts`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Files Verified | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|----------------|--------|
| 27-01-01 | 01 | 1 | SEVAL-01 | — | Claims extraction splits summary text into verifiable units with citation references | unit | `pnpm exec vitest run evals/summary/__tests__/claims.test.ts` | `evals/summary/__tests__/claims.test.ts` | verified |
| 27-01-02 | 01 | 1 | SEVAL-01 | — | Fallback judge verifies groundedness, coverage, and forbidden-claim detection without external API | unit | `pnpm exec vitest run evals/summary/__tests__/judge.test.ts` | `evals/summary/__tests__/judge.test.ts` | verified |
| 27-02-01 | 02 | 2 | SEVAL-02 | — | Groundedness and coverage scoring compute correctly from judge verdicts | unit | `pnpm exec vitest run evals/summary/__tests__/scoring.test.ts` | `evals/summary/__tests__/scoring.test.ts` | verified |
| 27-02-02 | 02 | 2 | SEVAL-02 | — | End-to-end summary runner executes cases, builds report, and formats output | integration | `node --import tsx evals/summary/run.ts --tier smoke --dry-run` and `node --import tsx evals/summary/run.ts --tier smoke` | `evals/summary/run.ts` | verified |

*Status: verified - all task rows map to concrete test files or direct runner commands that exist on disk.*

---

## Direct Runner Commands

These commands exercise the full summary evaluation runner end-to-end:

| Command | Purpose | Tier |
|---------|---------|------|
| `node --import tsx evals/summary/run.ts --tier smoke --dry-run` | Validate case loading and schema checks without executing judges | smoke |
| `node --import tsx evals/summary/run.ts --tier smoke` | Execute smoke-tier summary cases with judge evaluation | smoke |
| `node --import tsx evals/summary/run.ts --tier core --allow-empty` | Execute core-tier cases; succeeds even if core dataset is currently empty | core |

---

## SEVAL-01 Completeness Caveat

Summary evaluation proves execution coverage (the runner loads cases, runs the judge pipeline, and builds reports) but does not silently upgrade SEVAL-01 completeness. Known limitations:

1. **Core tier remains empty:** The `core` tier dataset has no cases populated yet. The `--allow-empty` flag is required to run core without error. This is truthful -- the runner and judge infrastructure exist, but core-tier golden cases have not been authored.
2. **Citation adherence not explicit in report/verdict surface:** Claims extraction supports citation references (`[1]`, `[2]`), but the summary report and verdict surface do not yet enforce citation adherence as a pass/fail criterion. This means a summary with ungrounded claims that lack citations can still pass if the fallback judge's text-matching heuristic considers them supported.

These caveats are documented here so that validation proves what exists without overstating coverage.

---

## Red-Case Boundaries

Red (failing) summary cases are valid proof of evaluator capability. A red case demonstrates that:

1. The judge correctly identifies unsupported claims (groundedness failure)
2. The judge detects forbidden content in summaries (forbidden-claim violation)
3. Coverage scoring accurately reflects missing required facts

Red cases do NOT indicate that the validation artifact itself is invalid. They reflect the current health of the summary generation pipeline under test.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM judge responses (OpenAI provider) | SEVAL-02 | External API dependency, requires OPENAI_API_KEY | Run `node --import tsx evals/summary/run.ts --tier smoke --provider openai` with a valid API key, inspect groundedness and coverage scores |

---

## Validation Sign-Off

- [x] All tasks map to concrete automated test files or direct runner commands on disk
- [x] Sampling continuity: no task row points to a missing or placeholder file
- [x] Every task row references a real `evals/summary/__tests__/*.test.ts` file or runner command
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter — all rows verified against existing files
- [x] `wave_0_complete: true` — no W0 placeholders remain

**Approval:** complete
