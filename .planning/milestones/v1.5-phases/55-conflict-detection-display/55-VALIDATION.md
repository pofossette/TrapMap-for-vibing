---
phase: 55
slug: conflict-detection-display
status: ready
nyquist_compliant: true
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
| 55-01-01 | 01 | 0 | CONFLICT-01 | — | N/A | unit | `pnpm test -- packages/contracts/src/domain/conflict.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-02 | 01 | 0 | CONFLICT-01 | — | N/A | unit | `pnpm test -- packages/contracts/src/domain/conflict.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-03 | 01 | 0 | CONFLICT-02 | — | N/A | unit | `pnpm build -- packages/contracts` | ✅ existing | ⬜ pending |
| 55-01-04 | 01 | 0 | CONFLICT-01 | — | N/A | build | `pnpm build -- packages/contracts` | ✅ existing | ⬜ pending |
| 55-02-01 | 02 | 1 | CONFLICT-01 | — | N/A | typecheck | `pnpm typecheck` | ✅ existing | ⬜ pending |
| 55-02-02 | 02 | 1 | CONFLICT-01 | — | N/A | typecheck | `pnpm typecheck` | ❌ W0 | ⬜ pending |
| 55-02-03 | 02 | 1 | CONFLICT-01 | — | N/A | unit | `pnpm test -- packages/server/src/lib/conflict/detect.test.ts` | ❌ W0 | ⬜ pending |
| 55-03-01 | 03 | 2 | CONFLICT-02 | T-55-01 | Conflict enrichment respects governance filters (team, level) | unit | `pnpm test -- packages/server/src/lib/conflict/enrich.test.ts` | ❌ W0 | ⬜ pending |
| 55-03-02 | 03 | 2 | CONFLICT-02 | T-55-01 | N/A | unit | `pnpm test -- packages/server/src/lib/conflict/enrich.test.ts` | ❌ W0 | ⬜ pending |
| 55-03-03 | 03 | 2 | CONFLICT-01 | — | N/A | typecheck | `pnpm typecheck` | ✅ existing | ⬜ pending |
| 55-03-04 | 03 | 2 | CONFLICT-02 | T-55-01 | Conflict enrichment respects governance filters | typecheck | `pnpm typecheck` | ✅ existing | ⬜ pending |
| 55-04-01 | 04 | 3 | CONFLICT-02 | — | N/A | build | `pnpm build -- packages/cli` | ✅ existing | ⬜ pending |

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
| Conflict display formatting in terminal | CONFLICT-02 | Visual formatting requires human inspection | Run retrieval with conflicting entries, verify conflict section appears with [alt], [!], [old] labels |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
