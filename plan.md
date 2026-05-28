# Documentation Drift Convergence Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the repository's operator-facing documentation, onboarding guides, deployment guidance, and doc-drift guardrails back into alignment with the current codebase and CI reality.

**Architecture:** Treat `package.json`, workspace package manifests, `.github/workflows/ci.yml`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`, and the current persistence schema as the primary truth set. Converge human docs in phases, then expand automated drift checks so the same classes of drift are blocked on future changes.

**Tech Stack:** Markdown, TypeScript, pnpm, tsx, Vitest, GitHub Actions

---

## Plan Metadata

- Archived previous root plan to `docs/archived/archived-plans/plan-2026-05-28-cli-bug-fix.md`
- This file is the active working plan at `plan.md`
- Analysis date: `2026-05-28`
- Current guard status: `rtk pnpm check:docs-drift` passes, but only validates 2 string rules

## Observed Drift Snapshot

- `docs/README.md` still presents JSON file storage as the main local runtime shape and describes the server startup path as "使用 JSON 文件存储", which conflicts with the repo-wide PG-first convergence messaging in `README.md` and `docs/reference/SYSTEM_TRUTH_SOURCES.md`.
- `docs/guides/GETTING_STARTED.md` still frames PostgreSQL as optional and JSON storage as the development default, which no longer matches the current architectural positioning.
- `docs/architecture/DEPLOYMENT.md` still documents a JSON-backed default `docker-compose` path and old `TRAPMAP_DATA_FILE` examples instead of the current PostgreSQL-first deployment posture.
- `docs/reference/DATABASE_SCHEMA.md` and `docs/README.md` advertise "48 张表", while the current schema modules declare 56 `pgTable(...)` definitions across domain files.
- `scripts/check-doc-drift.ts` plus `scripts/complexity-budgets.json` only guard 2 documentation rules, so README, docs index, getting started, deployment, CI, eval, schema-count, and command-surface drift can regress without detection.

## Scope

- In scope:
  - Root and docs-level product descriptions
  - Onboarding and deployment guides
  - CI/testing/eval documentation that should mirror actual scripts and workflows
  - Schema-count and persistence-mode references
  - Automated doc drift checks and their regression tests
- Out of scope:
  - Runtime feature changes unrelated to documentation truth
  - Broad architecture redesign
  - New eval frameworks not required to validate documentation consistency

## Phase Tracker

- [x] Phase 1: Build a documentation truth inventory and drift matrix
- [x] Phase 2: Converge human-facing docs to current code and runtime reality
- [x] Phase 3: Expand automated doc-drift guardrails and tests
- [x] Phase 4: Validate end-to-end and institutionalize the maintenance workflow

## File Structure

**Modify**

- `README.md` - keep root narrative, command surface, and persistence wording aligned with the authoritative sources
- `docs/README.md` - fix docs index positioning, storage/runtime claims, schema count, and command examples
- `docs/guides/GETTING_STARTED.md` - update onboarding flow, environment guidance, validation commands, and storage posture
- `docs/architecture/DEPLOYMENT.md` - update deployment defaults, compose examples, and env guidance to match the current deployment path
- `docs/operations/CI_CD.md` - reconcile CI job descriptions and guardrail expectations with `.github/workflows/ci.yml`
- `docs/operations/TESTING.md` - tighten local verification guidance around `check:docs-drift`, `check:complexity`, and required eval coverage for doc-affecting changes
- `docs/reference/DATABASE_SCHEMA.md` - update table-count claims and any stale schema summaries
- `docs/reference/SYSTEM_TRUTH_SOURCES.md` - extend the authoritative-source table to include docs index, deployment, CI, and schema-count ownership
- `scripts/check-doc-drift.ts` - evolve from simple contains/forbid checks into richer assertions or structured checks
- `scripts/complexity-budgets.json` - add more doc rules and any structured config needed by the drift checker
- `packages/server/src/__tests__/docs-truth-smoke.test.ts` - add regression tests covering truth-source/document consistency

**Create**

- `docs/reference/DOCS_TRUTH_MATRIX.md` - explicit mapping from doc topic to authoritative source and secondary docs
- `scripts/__tests__/check-doc-drift.test.ts` or equivalent Vitest coverage for the drift checker if not already present

## Global Done Criteria

- [x] All observed drift items above are either fixed or explicitly reclassified as intentional with updated truth-source docs
- [x] `README.md`, `docs/README.md`, `GETTING_STARTED.md`, `DEPLOYMENT.md`, `CI_CD.md`, `TESTING.md`, and `DATABASE_SCHEMA.md` agree on persistence posture, key commands, and CI/eval expectations
- [x] Schema-count references match the current `pgTable(...)` reality
- [x] `rtk pnpm check:docs-drift` fails on the previously undetected drift classes and passes after the documentation updates
- [x] `rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts` passes
- [x] `rtk pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts` passes if the checker test file is introduced
- [x] `rtk pnpm check:complexity` passes
- [x] `rtk pnpm eval:smoke` passes after the documentation/guardrail changes

---

### Phase 1: Build Truth Inventory And Drift Matrix

**Files:**

- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Create: `docs/reference/DOCS_TRUTH_MATRIX.md`
- Inspect and cite: `package.json`, `packages/server/package.json`, `packages/cli/package.json`, `.github/workflows/ci.yml`, `packages/server/src/lib/persistence/schema/*.ts`

**Phase completion criteria:**

- Every high-risk documentation area has one named authoritative source
- The current drift list is converted into a concrete matrix of "claim -> truth source -> affected docs"
- Schema-count ownership is documented instead of left as an informal fact

**Documentation updates required:**

- Add a `DOCS_TRUTH_MATRIX.md` table for persistence mode, startup commands, CI jobs, eval entrypoints, deployment defaults, and schema counts
- Extend `SYSTEM_TRUTH_SOURCES.md` so future changes know where to update secondary docs

**Test / eval updates required:**

- Add or extend `docs-truth-smoke` assertions so they verify at least:
  - server entrypoint references remain `buildServer()`
  - guardrail docs mention `pnpm check:docs-drift` and `pnpm check:complexity`
  - schema-count source points to the persistence schema modules instead of hard-coded prose
- Run: `rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Necessary example structure or code:**

```markdown
| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Persistence posture | `README.md` + `docs/reference/SYSTEM_TRUTH_SOURCES.md` + `packages/server/src/lib/persistence/schema/*.ts` | `docs/README.md`, `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` |
| CI jobs | `.github/workflows/ci.yml` | `docs/operations/CI_CD.md`, `docs/operations/TESTING.md` |
| Schema count | `packages/server/src/lib/persistence/schema/*.ts` | `docs/reference/DATABASE_SCHEMA.md`, `docs/README.md` |
```

- [x] Inventory authoritative sources and record them in `DOCS_TRUTH_MATRIX.md`
- [x] Update `SYSTEM_TRUTH_SOURCES.md` to reference the new matrix and broaden ownership rules
- [x] Add a failing docs-truth smoke test for any new truth-source guarantees introduced here
- [x] Run the targeted smoke test and mark the matrix stable

---

### Phase 2: Converge Human-Facing Docs

**Files:**

- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/guides/GETTING_STARTED.md`
- Modify: `docs/architecture/DEPLOYMENT.md`
- Modify: `docs/operations/CI_CD.md`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/reference/DATABASE_SCHEMA.md`

**Phase completion criteria:**

- No major entry doc still describes JSON file storage as the default operating model unless clearly labeled as compatibility/development fallback
- CI docs describe the actual jobs present in `.github/workflows/ci.yml`
- Table-count claims are numerically correct
- Startup, test, and eval commands shown to users exist in `package.json`

**Documentation updates required:**

- `README.md`: keep the top-level product description and command examples consistent with the current monorepo scripts and PG-first messaging
- `docs/README.md`: remove stale JSON-default language, fix schema count, and align the docs catalog with active architecture docs
- `docs/guides/GETTING_STARTED.md`: change persistence wording from "PG optional, JSON default" to "PG-first with compatibility fallback only where still documented"
- `docs/architecture/DEPLOYMENT.md`: replace JSON-first compose examples with PostgreSQL-first deployment guidance and clearly scope any fallback examples
- `docs/operations/CI_CD.md`: ensure listed jobs and responsibilities exactly match `typecheck`, `check`, `test`, `coverage`, `postgres-integration`, and `architecture-guardrails`
- `docs/operations/TESTING.md`: document when `check:docs-drift`, `check:complexity`, and `eval:smoke` are mandatory after docs/architecture changes
- `docs/reference/DATABASE_SCHEMA.md`: update all hard-coded table counts and references to current schema modules

**Test / eval updates required:**

- Extend `docs-truth-smoke` with assertions for:
  - `docs/README.md` no longer advertising JSON as the primary runtime model
  - `CI_CD.md` mentioning the actual guardrail and postgres jobs
  - `DATABASE_SCHEMA.md` matching the current table count source
- Run: `rtk pnpm check:docs-drift`
- Run: `rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`
- Run: `rtk pnpm eval:smoke`

**Necessary example structure or code:**

```markdown
## Persistence mode

TrapMap is operated in a PostgreSQL-first mode. JSON/file-backed storage remains a compatibility or local fallback path only where explicitly called out.
```

```markdown
| Job | Command | Purpose |
|---|---|---|
| `architecture-guardrails` | `pnpm check:docs-drift` + `pnpm check:complexity` | Prevent documentation truth drift and file growth regressions |
| `postgres-integration` | targeted `pnpm test -- --run ...` | Validate PG-backed integration paths |
```

- [x] Rewrite top-level docs to match the truth matrix
- [x] Update schema-count references using the actual current count
- [x] Reconcile CI/testing prose with the current workflow file and package scripts
- [x] Run targeted docs smoke coverage and `eval:smoke`

---

### Phase 3: Expand Automated Doc-Drift Guardrails

**Files:**

- Modify: `scripts/check-doc-drift.ts`
- Modify: `scripts/complexity-budgets.json`
- Create: `scripts/__tests__/check-doc-drift.test.ts`
- Modify: `packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Phase completion criteria:**

- A stale docs edit in any of the currently observed drift classes causes `check:docs-drift` or docs-truth smoke tests to fail
- The checker config is expressive enough to guard count-based or source-based assertions, not just simple substring checks
- The checker itself has direct test coverage

**Documentation updates required:**

- `docs/operations/TESTING.md`: document how to add a new doc rule and when to add one
- `docs/operations/CI_CD.md`: mention that `architecture-guardrails` now covers docs index, deployment, schema-count, and CI drift classes

**Test / eval updates required:**

- Add unit tests for the drift checker:
  - missing required phrase
  - forbidden phrase present
  - numeric/count mismatch
  - referenced workflow job missing from docs
- Add docs smoke assertions for the most important truth-source edges
- Run: `rtk pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts packages/server/src/__tests__/docs-truth-smoke.test.ts`
- Run: `rtk pnpm check:docs-drift`
- Run: `rtk pnpm check:complexity`

**Necessary example structure or code:**

```json
{
  "docRules": [
    {
      "file": "docs/README.md",
      "mustContain": ["PostgreSQL-first"],
      "mustNotContain": ["使用 JSON 文件存储"]
    },
    {
      "file": "docs/operations/CI_CD.md",
      "mustContainAllFromFile": ".github/workflows/ci.yml#jobs"
    }
  ]
}
```

```typescript
interface CountRule {
  file: string;
  label: string;
  expectedCountFromGlob: string;
  pattern: string;
}
```

- [x] Extend the checker config format to represent richer doc assertions
- [x] Add checker unit tests before broadening the rule set
- [x] Add rules for docs index, getting started, deployment, CI, and schema-count drift
- [x] Re-run the full doc guardrail path until it fails for seeded stale edits and passes for the corrected docs

---

### Phase 4: Validate And Institutionalize

**Files:**

- Modify: `plan.md`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/guides/CONTRIBUTING.md`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`

**Phase completion criteria:**

- The active plan checkboxes reflect completed work
- Contribution guidance explains when doc updates are mandatory and which verification commands to run
- Future plan authors have an explicit place to record documentation impact alongside code/test/eval impact

**Documentation updates required:**

- `docs/guides/CONTRIBUTING.md`: add a doc-drift checklist for architecture, persistence, CI, and eval touching changes
- `docs/operations/TESTING.md`: publish a minimal verification matrix by change type
- `SYSTEM_TRUTH_SOURCES.md`: mention the maintenance procedure for updating truth docs and guardrails together

**Test / eval updates required:**

- Final verification run:
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:complexity`
  - `rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts scripts/__tests__/check-doc-drift.test.ts`
  - `rtk pnpm eval:smoke`

**Necessary example structure or code:**

```markdown
## Documentation impact checklist

- [ ] I checked whether this change alters persistence posture, startup flow, CI, evals, or schema shape
- [ ] I updated secondary docs listed in `docs/reference/DOCS_TRUTH_MATRIX.md`
- [ ] I added or updated a doc-drift rule if this drift class could recur
```

- [x] Update contributor guidance with a documentation-impact checklist
- [x] Execute the final verification matrix
- [x] Mark completed phase checkboxes in `plan.md`
- [x] Archive any superseded intermediate notes into the docs archive if they were created during execution

## Risks And Decisions To Lock Early

- Schema-count drift will recur if docs keep hard-coding table numbers without a single authoritative source or automated count check.
- Deployment drift will recur unless JSON fallback examples are explicitly labeled as compatibility-only and separated from the default path.
- Guardrails should stay narrow enough to be maintainable, but they are currently too narrow to be useful for the repo's real drift surface.

## Suggested Execution Order

1. Finish Phase 1 before touching broad docs so the truth mapping is explicit.
2. Execute Phase 2 doc edits in one reviewable batch grouped by topic, not by file count.
3. Only after the prose is correct, expand Phase 3 guardrails to encode the newly clarified truth.
4. Use Phase 4 to make the maintenance workflow self-reinforcing.
