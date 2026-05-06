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
| 99-01-01 | 01 | 1 | Verify Phase 96 | — | N/A | integration | `pnpm --filter cli test` | ✅ W0 | ⬜ pending |
| 99-02-01 | 02 | 1 | Verify Phase 97 | — | N/A | integration | `pnpm --filter cli test` | ⬜ W0 | ⬜ pending |
| 99-03-01 | 03 | 2 | Scripts/assets coverage | — | N/A | unit | `pnpm --filter cli test` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing test infrastructure covers Phase 96 verification (321 tests baseline)
- [ ] Phase 97 test stubs depend on Phase 97 implementation status
- [ ] `packages/cli/src/__tests__/markdown-formatter.scripts-assets.test.ts` — stubs for scripts/assets edge cases

*If Phase 97/98 not implemented: tests will verify Phase 96 only and stub Phase 97/98 tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `trapmap init` end-to-end in clean env | Phase 97 | Requires npx/npm environment | Run `npx skills add` in a temp directory and verify SKILL.md is installed |

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
