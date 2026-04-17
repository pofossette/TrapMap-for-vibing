---
phase: 14
slug: seed-intent-retrieval-and-capsule-ranking
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-16
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | none; package scripts call `vitest run` directly |
| **Quick smoke command** | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts && pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` |
| **Quick run command** | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts && pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~60 seconds targeted, longer for full suite |

---

## Sampling Rate

- **After every task commit:** Run the smallest affected contract/server/CLI target first
- **After every plan wave:** Run targeted retrieval tests plus `tsc --noEmit` for touched packages
- **Before `$gsd-verify-work`:** Run contracts, targeted retrieval server tests, targeted CLI tests, and typecheck
- **Max feedback latency:** 30 seconds for focused tests, ~60 seconds for the phase gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | RETR-01, COMP-01 | T-14-01 | Shared v2 contract keeps client input seed-only and additive to legacy schemas | contract | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | RETR-02 | T-14-02 / T-14-03 | Deterministic server-only parsed intent exists without exporting internal fields | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/intent.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | RETR-03 | T-14-05 | Derivation consumes governed SKILL.md/reference payload text without exposing assets/scripts | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/derive.test.ts` | ✅ | ⬜ pending |
| 14-02-02 | 02 | 2 | CAPS-04, COMP-02 | T-14-04 / T-14-06 | Retrieval ranks only pre-filtered governed artifact profiles/capsules and does not leak raw payloads | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/capsule-recall.test.ts src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 3 | RETR-04, COMP-01 | T-14-09 | Shared v2 response contract stays capsule-first, distilled, and coexistence-safe with legacy schemas | contract | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` | ✅ | ⬜ pending |
| 14-03-02 | 03 | 3 | RETR-04 | T-14-07 / T-14-08 | Orchestrator hands ranked capsule hits into pure assembly/summary helpers without store re-fetch or bundle leakage | unit + integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/assembly.test.ts src/lib/retrieval/summary.test.ts src/lib/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 14-04-01 | 04 | 4 | COMP-03, RETR-01 | T-14-10 / T-14-12 | `/v1/retrieval/search` stays reachable while `/v2/retrieval/search` remains thin and permission-gated | route | `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` | ✅ | ⬜ pending |
| 14-04-02 | 04 | 4 | RETR-01, COMP-01 | T-14-11 | CLI keeps one-seed UX and prints capsule-first text/JSON without new required flags | unit | `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠ flaky*

---

## Wave 0 Requirements

- [x] `packages/contracts/src/index.test.ts` already exists and can absorb Phase 14 contract coverage
- [x] `packages/server/src/lib/artifacts/derive.test.ts` already exists and is the derivation seam
- [ ] `packages/server/src/lib/retrieval/intent.test.ts` — add deterministic parsed-intent coverage
- [ ] `packages/server/src/lib/retrieval/capsule-recall.test.ts` — add profile-shortlist and capsule-ranking coverage
- [ ] `packages/server/src/lib/retrieval/assembly.test.ts` and `packages/server/src/lib/retrieval/summary.test.ts` — add capsule-first shaping coverage for the new pure helpers
- [x] `packages/server/src/routes/retrieval.test.ts` and `packages/cli/src/commands/retrieval.test.ts` already exist for route/CLI compatibility checks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Capsule-first CLI text output is actually easier to scan than the legacy flat-entry layout | RETR-04 | Contract tests cannot fully judge terminal ergonomics | Run `search <seed>` against representative data and confirm the response stays compact, readable, and does not dump bundle/file payloads |
| `/v1` and `/v2` coexistence remains understandable to operators | COMP-03 | Product migration clarity is partly documentation/UX, not just route behavior | Exercise both routes and confirm help text, errors, and JSON output make it clear which path is legacy vs capsule-native |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or explicit Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 gaps are enumerated
- [x] No watch-mode flags
- [x] Feedback latency target is documented
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
