---
phase: 53
slug: boundary-indexing-graph-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (per-package) |
| **Quick run command** | `npx vitest run --reporter=verbose packages/server/src/lib/retrieval/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose packages/server/src/lib/retrieval/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | BOUND-03 | — | N/A | unit | `npx vitest run packages/server/src/lib/retrieval/` | ❌ W0 | ⬜ pending |
| 53-02-01 | 02 | 1 | BOUND-03 | — | N/A | unit | `npx vitest run packages/server/src/lib/retrieval/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/retrieval/boundary-index.test.ts` — stubs for boundary facet indexing
- [ ] `packages/server/src/lib/retrieval/boundary-backrefs.test.ts` — stubs for back-reference queries

*Existing infrastructure covers most phase requirements. Wave 0 adds boundary-specific test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | All phase behaviors have automated verification. |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
