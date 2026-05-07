---
phase: 102
slug: indexadapter-generalization-and-retrieval-plugin-dynamic-ada
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 102 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | (project config, already configured) |
| **Quick run command** | `pnpm test -- --run packages/server/src/lib/indexing/` or `pnpm test -- --run packages/server/src/lib/retrieval/` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run` on affected subsystem (indexing or retrieval)
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 102-01-01 | 01 | 1 | — | — | N/A | unit | `pnpm test -- --run packages/server/src/lib/indexing/registry.test.ts` | ❌ W0 | ⬜ pending |
| 102-01-02 | 01 | 1 | — | — | N/A | unit | `pnpm test -- --run packages/server/src/lib/indexing/pipeline.test.ts` | ✅ | ⬜ pending |
| 102-02-01 | 02 | 2 | — | — | N/A | unit | `pnpm test -- --run packages/server/src/lib/retrieval/channel-registry.test.ts` | ❌ W0 | ⬜ pending |
| 102-02-02 | 02 | 2 | — | — | N/A | unit | `pnpm test -- --run packages/server/src/lib/retrieval/strategy-registry.test.ts` | ❌ W0 | ⬜ pending |
| 102-02-03 | 02 | 2 | — | — | N/A | unit | `pnpm test -- --run packages/server/src/lib/retrieval/recall-coordinator.test.ts` | ✅ | ⬜ pending |
| 102-02-04 | 02 | 2 | — | — | N/A | unit | `pnpm test -- --run packages/server/src/lib/retrieval/merge.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/indexing/registry.test.ts` — covers AdapterRegistry register/get/all/kinds/has
- [ ] `packages/server/src/lib/retrieval/channel-registry.test.ts` — covers ChannelRegistry register/get/all
- [ ] `packages/server/src/lib/retrieval/strategy-registry.test.ts` — covers StrategyRegistry register/get

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| KnowledgeIndexStateRecord backward compat with old JSON format | — | Requires loading actual JSON store files | Load a pre-migration JSON store file, verify indexState reads correctly with both old and new format |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
