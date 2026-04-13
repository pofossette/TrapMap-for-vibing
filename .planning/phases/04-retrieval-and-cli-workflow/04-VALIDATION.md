---
phase: 04
slug: retrieval-and-cli-workflow
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-13
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.workspace.ts` |
| **Quick run command** | `pnpm --filter @skill-shareer/server test && pnpm --filter @skill-shareer/cli test` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~25 seconds focused, ~45 seconds full wave |

---

## Sampling Rate

- **After every task commit:** Run the narrowest focused command for the touched task, such as `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts`, `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts`, or `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts`.
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | RAG-01, RAG-02, RAG-03 | T-04-01 / T-04-03 | Only approved, authorized, text-only entries participate in retrieval ranking | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | RAG-01, RAG-03 | T-04-02 | Route validates input and requires `knowledge:search` before search | integration | `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | RAG-04 | T-04-04 | Authorized hits are split into `globalConstraints` and `projectKnowledge` without widening access | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | RAG-05 | T-04-05 | Embeddings-backed ranking and optional refinement work with provider fallback instead of hard failure | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts && pnpm --filter @skill-shareer/server typecheck` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 3 | CLI-01, CLI-02, RAG-01 | T-04-07 / T-04-08 | `search` stays imperative, permission-aware, and supports human plus JSON output | integration | `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 3 | CLI-01, CLI-02 | T-04-09 | Command visibility and formatter behavior remain stable for lower- and higher-level users | integration | `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts && pnpm --filter @skill-shareer/cli typecheck` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 4 | CLI-01, CLI-03, CLI-04 | T-04-10 / T-04-11 | Approval gating controls retrieval visibility across submit, reject, resubmit, and later history inspection | e2e | `pnpm --filter @skill-shareer/cli test -- src/workflows/retrieval-workflow.test.ts` | ❌ W0 | ⬜ pending |
| 04-04-02 | 04 | 4 | CLI-01, CLI-02, CLI-03, CLI-04 | T-04-10 / T-04-12 | JSON mode and stdin handling stay consistent across submit, resubmit, search, and review-status | e2e | `pnpm --filter @skill-shareer/cli test -- src/workflows/retrieval-workflow.test.ts && pnpm --filter @skill-shareer/cli typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/retrieval.test.ts` — service coverage for filtering, embeddings path, shaping, and refinement fallback
- [ ] `packages/server/src/routes/retrieval.test.ts` — route auth, validation, and response-shape coverage
- [ ] `packages/cli/src/commands/retrieval.test.ts` — search command text vs JSON output coverage
- [ ] `packages/cli/src/workflows/retrieval-workflow.test.ts` — end-to-end login → team select → submit/review → search → review-status path

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Search output remains concise and useful for terminal users after real knowledge accumulation | CLI-02 | Human judgment is needed to assess readability, not just schema validity | Run `skill-shareer search "seed text"` with and without `--json` against a populated dev dataset and inspect output density |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 60s for focused checks
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
