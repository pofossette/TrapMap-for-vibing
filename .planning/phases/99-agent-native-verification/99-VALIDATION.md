---
phase: 99
slug: agent-native-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 99 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/cli/vitest.config.ts |
| **Quick run command** | `pnpm --filter cli test` |
| **Full suite command** | `pnpm test && pnpm tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter cli test`
- **After every plan wave:** Run `pnpm test && pnpm tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 99-01-01 | 01 | 1 | V99-02 (scripts/assets formatter tests) | — | N/A | unit/tdd | `pnpm --filter cli test -- packages/cli/src/lib/markdown-formatter.test.ts` | ✅ existing | ⬜ pending |
| 99-02-01 | 02 | 2 | V99-01, V99-03, V99-04 (typecheck + tests + build gate) | — | N/A | gate | `pnpm typecheck && pnpm test && pnpm build` | N/A | ⬜ pending |
| 99-02-02 | 02 | 2 | V99-05, V99-06 (SKILL.md consistency + Phase 97/98 conditional) | — | N/A | integration | `diff` + `grep` checks | conditional | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing test infrastructure covers Phase 96 verification (321 tests baseline)
- [ ] Phase 97 test stubs depend on Phase 97 implementation status
- [ ] `packages/cli/src/lib/markdown-formatter.test.ts` — add test cases for scripts/assets edge cases and capsule fallback (V99-02, covered by Plan 01)

*If Phase 97/98 not implemented: tests will verify Phase 96 only and conditionally skip Phase 97/98 verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `trapmap init` end-to-end in clean env | Phase 97 (V99-05) | Requires npx/npm environment | Run `npx skills add` in a temp directory and verify SKILL.md is installed |

*If Phase 97 not implemented: defer to Phase 97 verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
