---
phase: 52
slug: boundary-capture-in-submission-flow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-02
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (root + per-package) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | BOUND-02 | — | Validate boundary JSON input | unit | `npx vitest run packages/cli` | ❌ W0 | ⬜ pending |
| 52-01-02 | 01 | 1 | BOUND-02 | — | Parse all 6 layers | unit | `npx vitest run packages/cli` | ❌ W0 | ⬜ pending |
| 52-02-01 | 02 | 1 | BOUND-02 | T-52-01 | LLM prompt injection safe | unit | `npx vitest run packages/server` | ❌ W0 | ⬜ pending |
| 52-02-02 | 02 | 1 | BOUND-02 | — | Extract boundary from content | unit | `npx vitest run packages/server` | ❌ W0 | ⬜ pending |
| 52-03-01 | 03 | 2 | BOUND-02 | — | Display boundary in review UI | unit | `npx vitest run packages/server` | ❌ W0 | ⬜ pending |
| 52-03-02 | 03 | 2 | BOUND-02 | — | Modify/add/remove boundary | unit | `npx vitest run packages/server` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for boundary CLI flag parsing
- [ ] Test stubs for LLM boundary extraction
- [ ] Test stubs for review UI boundary rendering

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM extraction quality | BOUND-02 | Requires live LLM API call | Submit content with known boundary patterns, verify extraction accuracy |

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
