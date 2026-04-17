# Phase 16: Compatibility Migration and Boundary Hardening - Research

**Researched:** 2026-04-17 [VERIFIED: system date]  
**Domain:** legacy knowledge-to-artifact migration, v1/v2 coexistence enforcement, and compatibility-window sunset controls [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`]  
**Confidence:** MEDIUM [VERIFIED: roadmap, requirements, prior phase artifacts, and current server/cli/contracts code were reviewed]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No `16-CONTEXT.md` exists, so Phase 16 planning must derive decisions from roadmap, requirements, and current code state rather than additional phase-local design choices. [VERIFIED: `node ".codex/get-shit-done/bin/gsd-tools.cjs" init plan-phase 16`]

### Claude's Discretion
Implementation latitude is bounded by the additive coexistence model already established in Phases 12-15: keep shared contracts canonical, keep `/v1` paths reachable during migration, and do not weaken review/scope/security controls while artifacts become the new source of truth. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `.planning/phases/14-seed-intent-retrieval-and-capsule-ranking/VERIFICATION.md`] [VERIFIED: `.planning/phases/15-client-activation-for-references-assets-and-scripts/15-03-SUMMARY.md`]

### Deferred Ideas (OUT OF SCOPE)
- Immediate hard removal of legacy `/v1` knowledge and retrieval routes is out of scope for this phase; the roadmap explicitly keeps a migration window. [VERIFIED: `.planning/ROADMAP.md`]
- Browser UI, multimodal retrieval, or server-side script execution remain out of scope. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARTF-04 | 旧知识模型可迁移到最小 skill artifact 表达 [VERIFIED: `.planning/REQUIREMENTS.md`] | Build a deterministic migration path that maps legacy `shortcut/detail/labels/scope/requiredLevel` records into minimal artifact bundles centered on `SKILL.md`, preserving provenance and revision lineage. [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [ASSUMED] |
| COMP-02 | 现有 RBAC、审批、team scope、security level 与审计流程在 v1.2 中保持有效 [VERIFIED: `.planning/REQUIREMENTS.md`] | Reuse existing auth, team, level, review, and audit seams already enforced in operations and retrieval routes; do not bypass them with a one-off migration path. [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] |
| COMP-03 | 旧 `/v1` 检索与知识接口在迁移阶段保留兼容路径 [VERIFIED: `.planning/REQUIREMENTS.md`] | Keep `/v1/retrieval/search`, `/v1/operations/knowledge`, import/export, and deactivation paths reachable while artifact-native flows become preferred and migration status is measurable. [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] |
| COMP-04 | v1.2 新结构不引入服务端脚本执行、浏览器 UI 依赖或多模态检索要求 [VERIFIED: `.planning/REQUIREMENTS.md`] | Migration and coexistence hardening should stay contracts/server/CLI focused, with server responses remaining metadata-only around scripts and activation. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [VERIFIED: `.planning/phases/15-client-activation-for-references-assets-and-scripts/15-03-SUMMARY.md`] |
</phase_requirements>

## Summary

Phase 16 is not a new feature surface so much as a boundary-consolidation phase. The repo now has two governed models living side by side: the original `knowledgeEntries` path and the newer `skillArtifacts` path. Retrieval v2 and activation already depend on artifacts, but legacy `/v1` retrieval and `/v1/operations/knowledge` still operate directly on knowledge entries. The clean Phase 16 move is to make artifact-native data the preferred long-term model while preserving the current `/v1` APIs as compatibility shims during a measured migration window. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`]

The highest-risk seam is not data conversion itself; it is governance drift during coexistence. Legacy entries carry lifecycle state, submission history, review notes, team scope, security level, and audit trails. Artifacts also carry required level, scope, revision, derived outputs, and activation metadata, but they cannot be allowed to create a second, weaker path around approval/audit guarantees. Phase 16 therefore needs explicit parity tests and migration rules that preserve or derive governance from the legacy record instead of inventing looser defaults. [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] [ASSUMED]

The recommended decomposition matches the roadmap exactly:
1. Introduce deterministic legacy-entry -> minimal-artifact migration primitives.
2. Verify parity of approval, audit, team scope, level checks, and no-script-execution guarantees across v1/v2 coexistence.
3. Add measurable sunset-readiness/status reporting so the compatibility window can close based on evidence rather than assumption.

**Primary recommendation:** plan Phase 16 around migration tooling plus coexistence verification, not a flag day replacement. The system should be able to answer: which legacy entries have migrated, which `/v1` paths still matter, and whether v1/v2 produce governance-equivalent behavior for the same caller. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Canonical migration payload shape | `packages/contracts` | CLI/server | Shared contracts must remain the only truth for migration request/report shapes. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Legacy-to-artifact normalization | Server library | Operations route | Conversion logic should be pure and testable, not embedded in route handlers. [VERIFIED: `packages/server/src/lib/import-export.ts`] [ASSUMED] |
| Approval, team, level, and audit enforcement | Server routes / RBAC helpers | Store records | Existing route seams already enforce these checks; Phase 16 should reuse them. [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] |
| Migration invocation and reporting | CLI operations commands | Server operations routes | This keeps the workflow terminal-friendly and automation-safe. [VERIFIED: `packages/cli/src/commands/operations.ts`] |
| Compatibility-window status and sunset readiness | Server report builder | CLI formatting | Operators need stable machine-readable output plus human-readable summaries. [ASSUMED] |

## Project Constraints (from AGENTS.md)

- Keep CLI, server, and contracts separated; migration contracts belong in `packages/contracts`, not ad hoc JSON shapes in CLI or route files. [VERIFIED: `AGENTS.md`]
- Preserve imperative, bash-friendly CLI behavior with optional JSON mode for migration/status commands. [VERIFIED: `AGENTS.md`]
- Keep skill artifacts Claude-compatible; migrated legacy records should become minimal valid artifact directories centered on `SKILL.md`, not bespoke packaging. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/ROADMAP.md`]
- Keep the server from executing scripts; activation remains metadata-only and client-controlled even after migration. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`]

## Concrete Code Seams

| Module | Current Role | Phase 16 Change |
|--------|--------------|-----------------|
| `packages/contracts/src/domain/knowledge.ts` | Legacy knowledge record/request schemas. [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] | Keep as compatibility truth for `/v1`; do not silently break request/response shapes during migration. [ASSUMED] |
| `packages/contracts/src/domain/artifacts.ts` | Canonical artifact/profile/capsule/client-manifest schemas. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] | Reuse as the target model for migrated records; avoid duplicating another compatibility artifact type. [ASSUMED] |
| `packages/contracts/src/domain/operations.ts` | Import/export/activation contracts. [VERIFIED: `packages/server/src/routes/operations.ts`] | Likely add migration/status request/response schemas here so CLI and server share rollout/reporting contracts. [ASSUMED] |
| `packages/server/src/lib/import-export.ts` | Canonical artifact bundle normalization and legacy import helpers. [VERIFIED: `packages/server/src/lib/import-export.ts`] | Best seam for transforming a legacy knowledge record into a minimal artifact bundle before persistence. [ASSUMED] |
| `packages/server/src/lib/artifacts/model.ts` | Artifact record creation and derived-output application. [VERIFIED: `packages/server/src/lib/artifacts/model.ts`] | Reuse to persist migrated artifacts and stamp provenance fields linking back to the legacy entry. [ASSUMED] |
| `packages/server/src/routes/operations.ts` | Knowledge export/import/deactivate and artifact import/export/activate endpoints. [VERIFIED: `packages/server/src/routes/operations.ts`] | Natural home for explicit migration and compatibility-status endpoints because this is already the admin/governance boundary. [ASSUMED] |
| `packages/server/src/routes/retrieval.ts` | Exposes `/v1` and `/v2` retrieval routes side by side. [VERIFIED: `packages/server/src/routes/retrieval.ts`] | Needs coexistence verification, not necessarily large new logic, to prove governance parity and safe sunset gates. [ASSUMED] |
| `packages/cli/src/commands/operations.ts` | Import/export/activate admin-facing terminal commands. [VERIFIED: `packages/cli/src/commands/operations.ts`] | Best place for migration and compatibility status commands with shell-friendly output. [ASSUMED] |

## Recommended Migration Model

### Pattern 1: Minimal Artifact From Legacy Knowledge
Convert one approved legacy knowledge entry into a single-file artifact bundle:
- `SKILL.md` contains normalized frontmatter plus the legacy shortcut/detail body.
- `labels`, `scope`, `requiredLevel`, `teamId`, and ownership metadata are preserved or mapped into artifact metadata/provenance.
- No synthetic `references/`, `assets/`, or `scripts/` directories are invented unless source material actually exists.

This satisfies ARTF-04 without pretending old entries were richer than they were. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/cli/src/commands/operations.ts`] [ASSUMED]

### Pattern 2: Governed Migration Through Existing Operations Boundary
Migration should look like a governed operation, not a backdoor store mutation:
- require existing import/admin permissions,
- record audit events with source entity IDs and migration mode,
- preserve lifecycle/approval semantics,
- reject migrations that would widen scope or lower required level.

This keeps COMP-02 intact. [VERIFIED: `packages/server/src/routes/operations.ts`] [ASSUMED]

### Pattern 3: Evidence-Based Compatibility Window
Sunset should depend on measurable facts:
- count of legacy entries still unmigrated,
- count of `/v1` compatibility routes still exercised in tests or commands,
- parity checks proving `/v1` and `/v2` enforce the same auth/team/level boundaries,
- explicit operator-facing “ready / not ready” reasons.

Without this, COMP-03 becomes indefinite and untestable. [ASSUMED]

## Anti-Patterns to Avoid

- **Direct store rewrites that bypass routes/audit:** This would satisfy migration volume while violating COMP-02. [VERIFIED: `packages/server/src/routes/operations.ts`]
- **Treating migrated artifacts as implicitly approved regardless of legacy state:** approval parity must be explicit. [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [ASSUMED]
- **Breaking `/v1` schemas in place while claiming compatibility:** keep `/v1` reachable until status tooling says the window can close. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/routes/retrieval.ts`]
- **Embedding script bodies or new execution behavior into migration responses:** activation remains metadata-only. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`]

## Recommended Plan Decomposition

### 16-01: Migrate legacy knowledge entries into minimal skill artifacts
- Add shared migration/status contracts if needed in `packages/contracts/src/domain/operations.ts`. [ASSUMED]
- Build a pure legacy-entry -> minimal-artifact normalization seam in the server. [ASSUMED]
- Expose governed migration through operations route + CLI command with audit coverage. [ASSUMED]

### 16-02: Preserve approval, audit, scope, and security behavior across v1/v2 coexistence
- Add focused parity tests across `/v1` knowledge operations, `/v1` retrieval, `/v2` retrieval, and artifact activation. [ASSUMED]
- Verify team scope, required level, lifecycle state, and audit output remain enforced. [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`]
- Pin “server never executes scripts” as an explicit coexistence invariant. [VERIFIED: `.planning/REQUIREMENTS.md`]

### 16-03: Sunset criteria, verification, and rollout safety
- Add operator-readable compatibility status/reporting. [ASSUMED]
- Add testable readiness criteria for shrinking the v1 window. [ASSUMED]
- Document rollout blocks when unmigrated entries or parity failures remain. [ASSUMED]

## Validation Architecture

### Test Framework
- `vitest` is already the project-wide test runner for contracts, server, and CLI. [VERIFIED: `package.json`]
- Focused package commands are available via `pnpm --filter @skill-shareer/{contracts|server|cli} test`. [VERIFIED: `package.json`] [VERIFIED: existing phase artifacts]

### Phase Requirements -> Test Map

| Requirement | Coverage Strategy | Primary Commands |
|-------------|-------------------|------------------|
| ARTF-04 | Unit + route + CLI coverage for legacy-entry migration into minimal artifact bundle/record | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts` and `pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts` |
| COMP-02 | Integration tests that compare auth/team/level/audit behavior across legacy and artifact-native operations | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/routes/retrieval.test.ts` |
| COMP-03 | Route/CLI tests for coexistence plus migration-status reporting | `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts src/routes/operations.test.ts` and `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts src/commands/operations.test.ts` |
| COMP-04 | Negative tests proving no server-side script execution or new multimodal/browser dependencies were introduced | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts` |

### Sampling Rate
- After every task commit: run the focused package tests for the touched package.
- After every plan wave: run server + cli + contracts focused suites for Phase 16.
- Before execute-phase closeout: run `pnpm --filter @skill-shareer/server exec tsc --noEmit`, `pnpm --filter @skill-shareer/cli exec tsc --noEmit`, and relevant focused tests.

### Wave 0 Gaps
- No new test framework is needed.
- The main gap is dedicated parity coverage for coexistence; current tests prove individual endpoints, but not Phase 16 migration equivalence. [ASSUMED]

## Environment Availability

- `pnpm`, Node, TypeScript, Vitest, Fastify, and Zod are already present in the monorepo. [VERIFIED: `package.json`] [VERIFIED: `packages/*/package.json`]
- No external service dependency is required to plan or implement the compatibility layer. [VERIFIED: current repo structure]

## Canonical References

- `.planning/ROADMAP.md` — authoritative phase split and coexistence-window intent
- `.planning/REQUIREMENTS.md` — ARTF-04 / COMP-02 / COMP-03 / COMP-04 definitions
- `.planning/phases/14-seed-intent-retrieval-and-capsule-ranking/VERIFICATION.md` — evidence that `/v1` + `/v2` coexistence already exists and needs hardening, not invention
- `.planning/phases/15-client-activation-for-references-assets-and-scripts/15-03-SUMMARY.md` — activation and policy invariants that must stay intact during migration
- `packages/contracts/src/domain/knowledge.ts` — legacy knowledge model
- `packages/contracts/src/domain/artifacts.ts` — canonical artifact model
- `packages/server/src/routes/operations.ts` — admin/governance route boundary
- `packages/server/src/routes/retrieval.ts` — coexistence retrieval boundary

## Metadata

- Research mode: local repo analysis
- External browsing: not used
- CONTEXT.md available: no
- Existing Phase 16 artifacts before run: none

## RESEARCH COMPLETE
