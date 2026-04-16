---
phase: 12
slug: skill-artifact-canonical-model
status: ready
nyquist_compliant: true
wave_0_complete: true
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
| **Quick smoke command** | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` |
| **Quick run command** | `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/server test -- src/lib/artifacts/model.test.ts src/lib/artifacts/derive.test.ts` |
| **Full suite command** | `pnpm test && pnpm --filter @skill-shareer/server typecheck` |
| **Estimated smoke runtime** | ~10-15 seconds |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick smoke command first, then the smallest affected server test target
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green after baseline issues are absorbed or isolated
- **Max feedback latency:** 25 seconds for smoke, ~45 seconds for wave gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | ARTF-01, ARTF-02, COMP-01 | T-12-01 / T-12-04 | Canonical shared schemas define additive artifact roots, revisions, and file manifests without changing legacy knowledge contracts | contract | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` | ✅ | ⬜ pending |
| 12-01-02 | 01 | 1 | CAPS-01, COMP-01 | T-12-02 / T-12-04 | Derived profile, capsule, and client-manifest contracts stay in the shared contracts package and reject asset/script leakage into text outputs | contract | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 2 | ARTF-02, ARTF-03, CAPS-02, CAPS-03 | T-12-05 / T-12-06 / T-12-07 | Additive server tests pin artifact persistence, governance inheritance, and metadata-only handling for assets/scripts before implementation | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/model.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | ARTF-02, ARTF-03, CAPS-02, CAPS-03, COMP-02 | T-12-05 / T-12-06 / T-12-07 / T-12-08 | Store records and mappers serialize governed artifact aggregates beside legacy knowledge entries without changing public routes | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/model.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 2 | COMP-02 | T-12-07 / T-12-08 | Existing review, knowledge, RBAC/team scope/security, and audit flows still work with additive `skillArtifacts` present | regression | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/model.test.ts src/routes/review.test.ts src/routes/knowledge.test.ts src/routes/operations.test.ts` | ✅ | ⬜ pending |
| 12-03-01 | 03 | 3 | CAPS-01, COMP-01, COMP-02 | T-12-09 / T-12-10 / T-12-11 | Derivation tests prove deterministic profile/capsule/client-manifest output from `SKILL.md` plus `references/` only | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/derive.test.ts` | ❌ W0 | ⬜ pending |
| 12-03-02 | 03 | 3 | CAPS-01, COMP-01, COMP-02 | T-12-09 / T-12-10 / T-12-11 / T-12-12 | Cached derived outputs are written back onto governed revisions without introducing new ACL or routing behavior | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/derive.test.ts src/lib/artifacts/model.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/contracts/src/index.test.ts` additions are covered by Plan `12-01` tasks `12-01-01` and `12-01-02`
- [x] `packages/server/src/lib/artifacts/model.test.ts` is covered by Plan `12-02` tasks `12-02-01` and `12-02-02`
- [x] `packages/server/src/lib/artifacts/derive.test.ts` is covered by Plan `12-03` tasks `12-03-01` and `12-03-02`
- [x] Governance coexistence regression coverage is covered by Plan `12-02` task `12-02-03`
- [x] Unrelated contract export drift and red-baseline triage are explicitly excluded from this phase gate; Phase 12 verification uses focused commands that only target new artifact work

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
- [ ] Smoke feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
