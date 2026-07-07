# Task 2 Report: Migrate Smoke Test + Create Arch-Freeze Script

## What Was Implemented

### Part 1: Doc-only assertions migrated to complexity-budgets.json

Extended `scripts/complexity-budgets.json` from 37 docRules to 43 docRules (net new entries added to existing + new file entries). All doc-only assertions from the smoke test that were not already covered by existing docRules have been migrated.

Key additions by category:
- **SYSTEM_TRUTH_SOURCES.md**: 46 new mustContain values covering all Phase 1-7 freeze facts, drift categories, and cross-references
- **docs/PACKAGES.md**: 36 new mustContain values covering Phase 1-6 freeze documentation
- **trapmap-architecture-remediation-plan.md**: 31 new mustContain values covering Phase 1-6 closure freeze facts
- **docs/operations/ENVIRONMENT.md**: 25 new mustContain values covering Phase 4/6 freeze, health endpoints, operator runbook
- **docs/operations/TESTING.md**: 24 new mustContain values covering all Phase freeze checks
- **New file entries created**: README.md, docs/architecture/TARGET_ARCHITECTURE.md, docs/architecture/SERVICE_BOUNDARIES.md, docs/todos/open-debt-and-compromises.md, docs/archived/archived-plans/badcase-feedback-loop.md, docs/archived/archived-plans/backend-engineering-optimization-plan.md, docs/architecture/components/ASYNC_MODEL.md, docs/reference/api-surface.md (extended), docs/archived/archived-plans/microservice-platform-evolution-plan.md (new)

### Part 2: Arch-freeze script created

Created `scripts/arch-freeze-rules.json` with 8 rule groups:
1. **phase1-server-boundary** (6 files): app.ts, config.ts, internal-ports.ts, repos/index.ts, schema/index.ts, migration-runner.ts
2. **phase2-store-snapshot-pg-first** (4 files): snapshot-usage-guard.test.ts, pg-first-compat.test.ts, read-model.ts, artifacts-activate.ts
3. **phase3-unified-adapter-boundary** (6 files): adapter-factory.ts, remote.adapter.ts, shared-infra.ts, internal-ports.ts, internal-client.ts, internal-knowledge-write-client.ts
4. **phase4-adapter-env-target-pruning** (3 files): config.ts, host-local config.ts, service-config.ts
5. **phase5-distributed-baseline** (3 files): host-distributed README, docker-compose.yml, distributed-runtime-closeout.test.ts
6. **phase6-mature-capability-boundary** (7 files): resilience.ts, metrics.ts, invalidation.ts, config.ts, graph-query/config.ts, service-config.ts, internal-client.ts
7. **phase7-ci-truth-execution-surface** (2 files): package.json, ci.yml
8. **existence-checks** (5 files): lib/README.md, routes/README.md, app.test.ts, server-live-gap-matrix.md, server-source-pack.md

## Migration Statistics

| Category | Count | Target |
|---|---|---|
| Doc-only assertions (new) | ~280 | docRules in complexity-budgets.json |
| Doc-only assertions (already covered) | ~177 | Already in existing docRules |
| Source-code invariants | ~56 | arch-freeze-rules.json |
| File existence checks | 5 | arch-freeze-rules.json |
| Dynamic path checks (skipped) | ~3 | Cannot be statically migrated |

## What Was Tested

1. **Unit tests**: `scripts/__tests__/check-arch-freeze.test.ts` -- 22 tests (mustContain, mustNotContain, mustExist, combined, multi-file, null content, edge cases)
2. **Unit tests**: `scripts/__tests__/check-doc-drift.test.ts` -- 28 tests (no regressions)
3. **Integration test**: `pnpm check:docs-drift` -- All 43 doc rules passed
4. **Integration test**: `pnpm check:arch-freeze` -- All 8 rules passed

## Files Changed

- `scripts/complexity-budgets.json` -- Extended with ~280 new mustContain/mustNotContain assertions across 25+ files
- `scripts/arch-freeze-rules.json` -- New file: 8 rule groups covering 36 source files
- `scripts/check-arch-freeze.ts` -- New file: CLI script following check-doc-drift.ts pattern
- `scripts/__tests__/check-arch-freeze.test.ts` -- New file: 22 unit tests
- `package.json` -- Added `check:arch-freeze` script

## Self-Review Findings

1. **Incorrect string in agent analysis**: The agent reported `docs/README.md` must contain `DOCS_TRUTH_MATRIX.md`, but the smoke test never checks this file for that string. The smoke test checks `SYSTEM_TRUTH_SOURCES.md` for `DOCS_TRUTH_MATRIX.md`. Fixed by removing the incorrect entry.

2. **Unicode quote encoding**: `docs/PACKAGES.md` uses U+201C/U+201D smart quotes, not ASCII quotes. The docRules were written with the correct Unicode characters from the Write tool output.

3. **Migrated vs. not migrated**: Three assertions in the smoke test use dynamic `existsSync` on paths extracted from `SYSTEM_TRUTH_SOURCES.md` content (the "non-planned truth source paths exist on disk" test). These cannot be statically migrated to either system. They remain as manual/integration concerns.

4. **open-debt evidence paths test**: The smoke test dynamically extracts relative paths from `docs/todos/open-debt-and-compromises.md` and checks each exists. This dynamic test cannot be migrated to a static rule. It's a known limitation.

## Issues or Concerns

- The smoke test has ~50 test blocks and ~457 expect() calls. Some assertions from the Phase tests overlap (e.g., Phase 4 closeout tests check the same files as Phase 4 freeze tests). The docRules were deduplicated to avoid redundancy, which means some Phase closeout assertions are covered by the same docRule entry as Phase freeze assertions.
- The `phase4-closeout-non-doc` rule was initially planned for arch-freeze-rules.json but was moved to docRules since those files (microservice-platform-evolution-plan.md, open-debt-and-compromises.md) are markdown documentation files.
