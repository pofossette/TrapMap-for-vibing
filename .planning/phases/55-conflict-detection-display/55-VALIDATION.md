---
phase: 55
slug: conflict-detection-display
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.2.4 |
| **Config file** | vitest.config.ts (root) |
| **Quick run command** | `pnpm test -- packages/contracts/src/domain/conflict.test.ts packages/server/src/lib/conflict/` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- packages/contracts packages/server/src/lib/conflict`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | CONFLICT-01 | — | N/A | unit | `pnpm test -- packages/contracts/src/domain/conflict.test.ts` | ❌ W0 | ⬜ pending |
| 55-02-01 | 02 | 1 | CONFLICT-01 | — | N/A | unit | `pnpm test -- packages/server/src/lib/conflict/detect.test.ts` | ❌ W0 | ⬜ pending |
| 55-03-01 | 03 | 1 | CONFLICT-01 | — | N/A | integration | `pnpm test -- packages/server/src/routes/review.test.ts` | ✅ existing | ⬜ pending |
| 55-04-01 | 04 | 2 | CONFLICT-02 | T-55-01 | Conflict enrichment respects governance filters (team, level) | unit | `pnpm test -- packages/server/src/lib/conflict/enrich.test.ts` | ❌ W0 | ⬜ pending |
| 55-05-01 | 05 | 2 | CONFLICT-02 | — | N/A | unit | `pnpm test -- packages/cli/src/commands/retrieval.test.ts` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/contracts/src/domain/conflict.ts` — conflict schema definitions
- [ ] `packages/contracts/src/domain/conflict.test.ts` — schema validation tests
- [ ] `packages/server/src/lib/conflict/detect.ts` — detection algorithm
- [ ] `packages/server/src/lib/conflict/detect.test.ts` — detection algorithm tests
- [ ] `packages/server/src/lib/conflict/enrich.ts` — retrieval enrichment
- [ ] `packages/server/src/lib/conflict/enrich.test.ts` — enrichment tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Conflict display formatting in terminal | CONFLICT-02 | Visual formatting requires human inspection | Run retrieval with conflicting entries, verify conflict section appears and is readable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
