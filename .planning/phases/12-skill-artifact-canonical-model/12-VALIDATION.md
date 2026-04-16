---
phase: 12
slug: skill-artifact-canonical-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | none; package scripts call `vitest run` directly |
| **Quick run command** | `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/server test -- src/lib/artifacts/model.test.ts src/lib/artifacts/derive.test.ts` |
| **Full suite command** | `pnpm test && pnpm --filter @skill-shareer/server typecheck` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @skill-shareer/contracts test` plus the smallest affected server test target
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green after baseline issues are absorbed or isolated
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | ARTF-01, ARTF-02, COMP-01 | T-12-01 | Shared contracts define canonical artifact, revision, file-manifest, profile, capsule, and client-manifest schemas before server wiring | contract | `pnpm --filter @skill-shareer/contracts test` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 2 | ARTF-02, ARTF-03, CAPS-02, CAPS-03 | T-12-02 / T-12-03 / T-12-04 | Store records preserve governance inheritance and exclude `assets/` / `scripts/` from model-context payloads | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/model.test.ts` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 3 | CAPS-01, COMP-01, COMP-02 | T-12-02 / T-12-05 | Derivation emits deterministic profile/capsules/client manifest keyed to source hash without changing governance boundaries | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/derive.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/artifacts/model.test.ts` — canonical store record and mapper coverage for ARTF-02/03
- [ ] `packages/server/src/lib/artifacts/derive.test.ts` — deterministic derivation coverage for CAPS-01/02/03
- [ ] `packages/contracts/src/index.test.ts` additions — schema coverage for artifact/revision/file/profile/capsule/client-manifest contracts
- [ ] Export-surface repair in `@skill-shareer/contracts` / server compile path so `pnpm --filter @skill-shareer/server typecheck` is meaningful for Phase 12
- [ ] Red-baseline triage for unrelated retrieval/indexing failures that currently prevent a clean phase gate

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Canonical artifact shape still round-trips the intended skill-directory semantics for downstream Phase 13 import/export work | ARTF-01, ARTF-02 | Phase 12 may define schemas before import/export routes exist | Inspect the final contract/store examples and confirm they preserve `SKILL.md`, `references/`, `assets/`, and `scripts/` distinctions without flattening |
| Derived outputs do not introduce a second governance surface | ARTF-03, COMP-02 | The risk is architectural drift rather than a single command failure | Review generated plan `must_haves` and implementation notes to confirm governance remains at artifact root / revision and is only inherited by profile, capsules, and client manifest |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
