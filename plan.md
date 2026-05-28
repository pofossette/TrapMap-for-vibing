# Documentation Drift Convergence Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the repository's documentation back into alignment with the current codebase, command surface, environment defaults, and CI/eval reality, then expand guardrails so the same drift classes are blocked automatically.

**Architecture:** Use code and workflow files as the truth set: root and package `package.json`, `packages/server/src/config.ts`, `packages/server/src/lib/ai/provider-config.ts`, `.github/workflows/*.yml`, and `packages/server/src/lib/persistence/schema/*.ts`. First fix the highest-signal user-facing docs, then converge deeper architecture/reference docs, then encode the newly found drift classes into automated checks.

**Tech Stack:** Markdown, TypeScript, pnpm, Vitest, GitHub Actions, Drizzle, PostgreSQL

---

## Plan Metadata

- Analysis date: `2026-05-28`
- Archived previous root plan to `docs/archived/archived-plans/plan-2026-05-28-doc-drift-analysis-and-plan.md`
- Active working plan: `plan.md`
- Current automated status:
  - `rtk pnpm check:docs-drift` passes with 6 rules
  - `rtk pnpm check:complexity` passes
  - `rtk pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts` passes
- Current repo caveat:
  - `rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts` unexpectedly executed the full suite in this repo state and hit an unrelated existing failure in `packages/server/src/lib/feedback/repository.test.ts`
- Existing unrelated user changes detected:
  - `docs/architecture/components/AUTH.md`
  - `docs/operations/SECURITY.md`

## Current Drift Snapshot

### Confirmed drift already covered by current rules

- Major top-level docs no longer advertise JSON storage as the primary runtime model.
- `docs/reference/DATABASE_SCHEMA.md` now says `56 张表`, matching the current schema surface.
- `docs/operations/CI_CD.md` and `docs/operations/TESTING.md` already mention `check:docs-drift` and `check:complexity`.

### Confirmed drift not yet covered or only partially covered

- `docs/guides/GETTING_STARTED.md` still documents `TRAPMAP_DATA_FILE` default as `.data/trapmap.json`, but runtime default is `.data/skill-shareer.json` in `packages/server/src/config.ts`.
- `docs/guides/GETTING_STARTED.md` tells users to run root-level `pnpm run db:migrate` and `pnpm run db:generate`, but those scripts only exist in `packages/server/package.json`.
- `docs/operations/ENVIRONMENT.md` still says `TRAPMAP_DATA_FILE` is the "开发默认" path and also uses the stale `.data/trapmap.json` default.
- `docs/architecture/components/PERSISTENCE.md` still says the split schema has `48 张表`, but the current schema directory exposes 56 `pgTable(...)` declarations.
- `docs/architecture/ARCHITECTURE.md` has stale environment defaults:
  - `HOST` documented as `0.0.0.0`, while runtime default is `127.0.0.1`
  - `AI_CHAT_MODEL` documented as `gpt-4o`, while provider defaults use `gpt-4o-mini`
  - `AI_PROVIDER` examples omit `google-genai` and the runtime `fallback` path
- The current doc drift guard checks only 6 files and does not cover:
  - command existence / command scope drift
  - environment default value drift
  - architecture/reference docs outside the current allowlist
  - provider option drift
  - file-existence / workflow-existence references

### Evidence references

- `docs/guides/GETTING_STARTED.md:47`
- `docs/guides/GETTING_STARTED.md:58`
- `docs/guides/GETTING_STARTED.md:61`
- `docs/operations/ENVIRONMENT.md:16`
- `docs/operations/ENVIRONMENT.md:17`
- `docs/architecture/components/PERSISTENCE.md:252`
- `docs/architecture/ARCHITECTURE.md:435`
- `docs/architecture/ARCHITECTURE.md:436`
- `docs/architecture/ARCHITECTURE.md:441`
- `packages/server/src/config.ts`
- `packages/server/package.json`
- `packages/server/src/lib/ai/provider-config.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/eval.yml`

## Scope

- In scope:
  - onboarding, environment, architecture, persistence, CI, testing, and reference docs
  - doc guardrail expansion for new drift classes
  - smoke-level doc truth tests and checker unit tests
  - plan-level progress tracking for a documentation convergence effort
- Out of scope:
  - runtime feature work unrelated to documentation truth
  - fixing the unrelated `feedback/repository.test.ts` failure unless it blocks doc verification strategy
  - broad doc reorganization not required to remove drift

## Phase Tracker

- [ ] Phase 1: Refresh the truth matrix and enumerate uncovered drift classes
- [ ] Phase 2: Fix high-signal onboarding and environment documentation drift
- [ ] Phase 3: Fix architecture and persistence reference drift
- [ ] Phase 4: Expand automated drift guards and verification workflow

## File Structure

**Modify**

- `plan.md` - active execution plan and phase tracking
- `docs/reference/DOCS_TRUTH_MATRIX.md` - expand topic coverage for commands, env defaults, provider defaults, and workflow references
- `docs/reference/SYSTEM_TRUTH_SOURCES.md` - keep authoritative source rules aligned with the expanded matrix
- `docs/guides/GETTING_STARTED.md` - correct DB command scope, env defaults, and fallback wording
- `docs/operations/ENVIRONMENT.md` - correct env defaults and runtime posture
- `docs/README.md` - align doc index wording if affected by onboarding or reference changes
- `README.md` - align top-level quick-start wording if command guidance changes
- `docs/architecture/ARCHITECTURE.md` - correct stale host / AI / env defaults and provider set
- `docs/architecture/components/PERSISTENCE.md` - correct schema count and persistence wording
- `docs/operations/TESTING.md` - update validation matrix for new guardrail categories and command usage
- `docs/operations/CI_CD.md` - document any broadened architecture-guardrails behavior
- `scripts/check-doc-drift.ts` - support stronger assertions where needed
- `scripts/complexity-budgets.json` - add new doc rules for uncovered drift classes
- `packages/server/src/__tests__/docs-truth-smoke.test.ts` - extend truth-source coverage
- `scripts/__tests__/check-doc-drift.test.ts` - extend checker coverage if config/logic changes

**Inspect As Truth Sources**

- `package.json`
- `packages/server/package.json`
- `packages/server/src/config.ts`
- `packages/server/src/lib/ai/provider-config.ts`
- `packages/server/src/lib/persistence/schema/*.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/eval.yml`

## Global Done Criteria

- [ ] All current drift items listed in this plan are either fixed or explicitly reclassified in truth-source docs
- [ ] User-facing setup docs no longer point to root-level commands that only exist in package-local manifests
- [ ] `TRAPMAP_DATA_FILE`, `HOST`, and AI provider/model defaults agree across runtime code and docs
- [ ] Persistence schema count references agree with the current schema directory
- [ ] `check:docs-drift` covers the newly discovered drift classes, not just top-level wording regressions
- [ ] `docs-truth-smoke` covers the highest-value truth edges for commands, env defaults, and architecture references
- [ ] `rtk pnpm check:docs-drift` passes
- [ ] `rtk pnpm check:complexity` passes
- [ ] `rtk pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts` passes
- [ ] `rtk pnpm exec vitest run scripts/__tests__/check-doc-drift.test.ts` passes if checker behavior or config shape changes

---

### Phase 1: Refresh The Truth Matrix And Drift Inventory

**Files:**

- Modify: `docs/reference/DOCS_TRUTH_MATRIX.md`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `plan.md`
- Inspect: `package.json`
- Inspect: `packages/server/package.json`
- Inspect: `packages/server/src/config.ts`
- Inspect: `packages/server/src/lib/ai/provider-config.ts`
- Inspect: `.github/workflows/ci.yml`
- Inspect: `.github/workflows/eval.yml`
- Inspect: `packages/server/src/lib/persistence/schema/*.ts`

**Phase completion criteria:**

- Every newly observed drift item is mapped to one authoritative source
- The matrix distinguishes root-level scripts from package-local scripts
- The matrix explicitly records env-default ownership and AI-provider default ownership
- The active plan documents what is already passing and what remains uncovered

**Documentation updates required:**

- Add rows for:
  - root vs package-local command ownership
  - runtime environment defaults
  - AI provider/model defaults
  - workflow file ownership for CI and eval docs
  - schema-count ownership for deep architecture docs, not only top-level docs
- Clarify that onboarding docs must reference the correct script surface

**Test / eval updates required:**

- Add or update a smoke assertion that truth-source docs reference the expanded matrix categories
- Run: `rtk pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Necessary example structure or code:**

```markdown
| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Root workspace commands | `package.json` | `README.md`, `docs/README.md`, `docs/operations/TESTING.md` |
| Server-only DB commands | `packages/server/package.json` | `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` |
| Runtime env defaults | `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` |
| AI provider defaults | `packages/server/src/lib/ai/provider-config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` |
```

- [ ] Record each uncovered drift class in `DOCS_TRUTH_MATRIX.md`
- [ ] Update `SYSTEM_TRUTH_SOURCES.md` to reference the expanded ownership model
- [ ] Refresh `plan.md` evidence links and uncovered-drift summary if new facts emerge during implementation
- [ ] Run the targeted docs smoke test to confirm the truth-source docs remain coherent

---

### Phase 2: Fix High-Signal Onboarding And Environment Drift

**Files:**

- Modify: `docs/guides/GETTING_STARTED.md`
- Modify: `docs/operations/ENVIRONMENT.md`
- Modify: `README.md`
- Modify: `docs/README.md`

**Phase completion criteria:**

- No onboarding doc tells users to run a root command that does not exist
- `TRAPMAP_DATA_FILE` defaults match runtime code everywhere these docs describe them
- JSON storage is consistently framed as compatibility fallback rather than default dev posture
- Quick-start docs still point to existing files and existing workflows after edits

**Documentation updates required:**

- `GETTING_STARTED.md`
  - change `TRAPMAP_DATA_FILE` default to `.data/skill-shareer.json`
  - replace root `pnpm run db:migrate` / `pnpm run db:generate` with the correct package-scoped commands
  - keep PostgreSQL-first wording while preserving compatibility fallback notes
- `ENVIRONMENT.md`
  - change `TRAPMAP_DATA_FILE` default to `.data/skill-shareer.json`
  - replace “开发默认” framing with compatibility fallback wording aligned to current runtime posture
- `README.md` / `docs/README.md`
  - reconcile any quick-start snippets if onboarding command wording or fallback wording changes

**Test / eval updates required:**

- Add smoke assertions for:
  - `GETTING_STARTED.md` does not claim `.data/trapmap.json`
  - `GETTING_STARTED.md` does not claim root `pnpm run db:migrate` / `pnpm run db:generate`
  - `ENVIRONMENT.md` does not describe JSON storage as the development default
- Add doc-drift rules for the same high-signal strings
- Run:
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Necessary example structure or code:**

```markdown
| `TRAPMAP_DATA_FILE` | JSON 存储路径（兼容回退，可选） | `.data/skill-shareer.json` |
```

```bash
# 手动运行迁移（可选，服务器启动时自动执行）
pnpm --filter @trapmap/server db:migrate

# 生成新迁移（修改 schema 后）
pnpm --filter @trapmap/server db:generate
```

- [ ] Rewrite the `GETTING_STARTED.md` environment table and DB command examples
- [ ] Rewrite the `ENVIRONMENT.md` database configuration wording and defaults
- [ ] Reconcile root quick-start docs if they embed the same stale assumptions
- [ ] Re-run docs drift and docs smoke verification

---

### Phase 3: Fix Architecture And Persistence Reference Drift

**Files:**

- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `docs/architecture/components/PERSISTENCE.md`
- Modify: `docs/reference/DATABASE_SCHEMA.md`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`

**Phase completion criteria:**

- `ARCHITECTURE.md` no longer contradicts runtime defaults for host, AI defaults, or provider support
- `PERSISTENCE.md` no longer reports stale table counts
- Reference docs use the same schema-count story and provider story as code
- Deep architecture docs no longer lag behind the already-fixed top-level docs

**Documentation updates required:**

- `ARCHITECTURE.md`
  - update `HOST` default to `127.0.0.1`
  - update `AI_CHAT_MODEL` default to `gpt-4o-mini`
  - mention `google-genai` and the `fallback` runtime path where appropriate
- `PERSISTENCE.md`
  - replace `48 张表` with the correct current total
  - ensure any domain/subtable counts still reconcile with current schema organization
- `DATABASE_SCHEMA.md`
  - confirm the truth-source pointer and migration-count wording still match the current repository

**Test / eval updates required:**

- Add smoke assertions for:
  - `ARCHITECTURE.md` contains `127.0.0.1`
  - `ARCHITECTURE.md` contains `gpt-4o-mini`
  - `PERSISTENCE.md` no longer contains `48 张表`
- Add matching doc-drift rules for deep architecture/reference docs
- Run:
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Necessary example structure or code:**

```markdown
| `HOST` | `127.0.0.1` | 服务器绑定主机 |
| `AI_CHAT_MODEL` | `gpt-4o-mini` | 聊天模型名称 |
```

```markdown
> **完整 schema 定义**: `packages/server/src/lib/persistence/schema/` (按领域拆分，共 56 张表)
```

- [ ] Correct architecture-level env default tables and examples
- [ ] Correct persistence schema count references and any dependent prose
- [ ] Verify reference docs still point to the right truth sources after edits
- [ ] Re-run targeted docs verification

---

### Phase 4: Expand Automated Drift Guards And Verification Workflow

**Files:**

- Modify: `scripts/check-doc-drift.ts`
- Modify: `scripts/complexity-budgets.json`
- Modify: `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- Modify: `scripts/__tests__/check-doc-drift.test.ts`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/operations/CI_CD.md`

**Phase completion criteria:**

- A stale edit in any currently known drift class fails either `check:docs-drift` or docs smoke tests
- Verification instructions tell contributors which command to run for doc-only, env-default, command-surface, and architecture-reference changes
- The checker test suite covers any new assertion mode introduced for these doc rules

**Documentation updates required:**

- `TESTING.md`
  - update the validation matrix for command-surface drift, env-default drift, and deep architecture doc drift
  - standardize on the actually targeted docs smoke invocation
- `CI_CD.md`
  - describe the broader scope of `architecture-guardrails`
  - keep CI/eval workflow descriptions aligned with `.github/workflows/*.yml`

**Test / eval updates required:**

- Extend `docs-truth-smoke.test.ts` with assertions for:
  - onboarding command scope
  - environment defaults
  - architecture defaults
  - persistence schema count in deep docs
- Extend `check-doc-drift.test.ts` for any new rule behavior, for example:
  - forbidden stale command
  - forbidden stale default value
  - required provider string set
- Run:
  - `rtk pnpm exec vitest run scripts/__tests__/check-doc-drift.test.ts`
  - `rtk pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts`
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:complexity`

**Necessary example structure or code:**

```json
{
  "docRules": [
    {
      "file": "docs/guides/GETTING_STARTED.md",
      "mustNotContain": [
        ".data/trapmap.json",
        "pnpm run db:migrate",
        "pnpm run db:generate"
      ]
    },
    {
      "file": "docs/architecture/ARCHITECTURE.md",
      "mustContain": ["127.0.0.1", "gpt-4o-mini"],
      "mustNotContain": ["| `HOST` | `0.0.0.0` |", "| `AI_CHAT_MODEL` | `gpt-4o` |"]
    }
  ]
}
```

```typescript
it('GETTING_STARTED uses package-scoped DB commands and current JSON fallback path', () => {
  const content = readDoc('docs/guides/GETTING_STARTED.md');
  expect(content).toContain('pnpm --filter @trapmap/server db:migrate');
  expect(content).toContain('.data/skill-shareer.json');
  expect(content).not.toContain('pnpm run db:migrate');
  expect(content).not.toContain('.data/trapmap.json');
});
```

- [ ] Expand checker coverage to the newly found drift classes
- [ ] Expand docs smoke assertions to mirror the highest-value truth edges
- [ ] Update verification guidance in `TESTING.md` and guardrail description in `CI_CD.md`
- [ ] Run the full guardrail path and mark the plan complete only when all doc checks are green
