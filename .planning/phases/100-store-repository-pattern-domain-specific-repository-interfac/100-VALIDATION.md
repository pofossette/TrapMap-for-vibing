---
phase: 100
slug: store-repository-pattern-domain-specific-repository-interfac
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 100 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/server/vitest.config.ts |
| **Quick run command** | `cd packages/server && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd packages/server && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/server && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd packages/server && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 100-01-T1 | 01 | 1 | Feedback repo creation | T-100-01 | N/A | unit | `npx vitest run src/lib/feedback/repository.test.ts` | New | Pending |
| 100-01-T2 | 01 | 1 | Audit/Duplicates repo creation | T-100-01 | N/A | unit | `npx vitest run src/lib/audit/repository.test.ts src/lib/duplicates/repository.test.ts` | New | Pending |
| 100-01-T3 | 01 | 1 | Unit tests for feedback/audit/duplicates | T-100-01 | N/A | unit | `npx vitest run src/lib/feedback/repository.test.ts src/lib/audit/repository.test.ts src/lib/duplicates/repository.test.ts` | New | Pending |
| 100-02-T1 | 02 | 1 | Lineage/GraphIndex repo creation | T-100-02 | N/A | unit | `npx vitest run src/lib/lineage/repository.test.ts src/lib/graph-index/repository.test.ts` | New | Pending |
| 100-02-T2 | 02 | 1 | Async repos factory + context.ts | T-100-02 | N/A | unit+typecheck | `npx vitest run src/lib/repos/index.test.ts && npx tsc --noEmit` | New | Pending |
| 100-02-T3 | 02 | 1 | Unit tests for lineage/graph-index/repos | T-100-02 | N/A | unit | `npx vitest run src/lib/lineage/repository.test.ts src/lib/graph-index/repository.test.ts src/lib/repos/index.test.ts` | New | Pending |
| 100-03-T1 | 03 | 2 | Wire repos in app.ts | T-100-03 | N/A | typecheck | `npx tsc --noEmit --project packages/server/tsconfig.json` | Existing | Pending |
| 100-04-T1 | 04 | 3 | Migrate feedback/decay/candidates | T-100-04, T-100-05 | N/A | integration | `npx vitest run src/routes/feedback*.test.ts src/routes/decay.test.ts src/routes/candidates*.test.ts` | Existing | Pending |
| 100-04-T2 | 04 | 3 | Migrate session.ts | T-100-04 | Auth chain intact | integration | `npx vitest run src/lib/session.test.ts` | Existing | Pending |
| 100-05-T1 | 05 | 4 | Migrate knowledge.ts + review.ts | T-100-07 | N/A | integration | `npx vitest run src/routes/knowledge*.test.ts src/routes/review*.test.ts` | Existing | Pending |
| 100-05-T2 | 05 | 4 | Migrate retrieval.ts + operations/ | T-100-08, T-100-09 | N/A | integration | `npx vitest run src/routes/retrieval*.test.ts src/routes/operations/*.test.ts` | Existing | Pending |

*Status: Pending · Green · Red · Flaky*

---

## Wave 0 Requirements

- Test files for new repos (feedback, audit, duplicates) — addressed in Plan 01 Task 3
- Test files for new repos (lineage, graph-index) — addressed in Plan 02 Task 3
- Test file for `createAllRepos()` factory — addressed in Plan 02 Task 3
- Existing repository tests from Phase 83 cover knowledge, artifact, session, accessKey, team, membership, user, candidate repos
- Integration test verifying route migration doesn't break auth chain — covered by existing session.test.ts

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Json/PG parity | — | Requires both backends running | Run full suite with JsonStore and PostgresStore, verify same test pass |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
