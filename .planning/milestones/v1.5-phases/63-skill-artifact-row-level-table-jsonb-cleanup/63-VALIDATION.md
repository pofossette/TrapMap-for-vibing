---
phase: 63
slug: skill-artifact-row-level-table-jsonb-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm test --run && pnpm typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run`
- **After every plan wave:** Run `pnpm test --run && pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-01-01 | 01 | 1 | WRITE-03 | T-63-01 | SQL injection prevention via parameterized queries | migration | `pnpm test --run schema` | ✅ | ⬜ pending |
| 63-01-02 | 01 | 1 | WRITE-03 | — | Schema validates artifact fields | unit | `pnpm test --run artifact` | ✅ | ⬜ pending |
| 63-02-01 | 02 | 1 | WRITE-03 | — | Repository CRUD matches existing patterns | unit | `pnpm test --run repository` | ✅ | ⬜ pending |
| 63-03-01 | 03 | 2 | WRITE-03 | — | JSONB writes removed, snapshot clean | unit | `pnpm test --run snapshot` | ✅ | ⬜ pending |
| 63-04-01 | 04 | 2 | WRITE-03 | — | Migration data consistency validated | integration | `pnpm test --run migration` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/adapters/pg-artifact-repository.test.ts` — repository CRUD tests
- [ ] `tests/integration/migrations/skill-artifacts.test.ts` — migration consistency tests
- [ ] `tests/unit/store/snapshot-cleanup.test.ts` — JSONB write removal tests

*Existing vitest infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration dry-run review | WRITE-03 | Requires human judgment on data consistency | Run migration with `--dry-run`, review output log |
| Production deployment validation | WRITE-03 | Live database access required | Run migration in staging, verify counts match |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
