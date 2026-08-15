# Documentation Drift Convergence Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge the current documentation set with the live codebase, CI workflows, and runtime defaults, then add enough guard coverage that the same drift classes are caught early.

**Architecture:** Treat code and workflow files as the only truth sources for commands, runtime defaults, provider support, deployment behavior, and evaluation entrypoints. Execute in phases: refresh the truth inventory, fix user-facing and ops docs, fix deeper architecture/deployment/component docs, then tighten tests and doc-drift guards around the highest-risk regressions.

**Tech Stack:** Markdown, TypeScript, pnpm, Vitest, Fastify, Drizzle, PostgreSQL, GitHub Actions

---

## Context

- Analysis date: `2026-05-28`
- Previous root plan archived to `docs/archived/archived-plans/plan-2026-05-28-doc-drift-analysis-and-plan-stale-root.md`
- Active tracking file: `plan.md`
- Primary truth sources reviewed:
  - `package.json`
  - `packages/server/package.json`
  - `packages/server/src/config.ts`
  - `packages/server/src/lib/ai/provider-config.ts`
  - `.github/workflows/ci.yml`
  - `.github/workflows/eval.yml`
  - `docker-compose.yml`
  - `packages/server/src/lib/persistence/schema/*.ts`
  - `docs/reference/DOCS_TRUTH_MATRIX.md`
  - `docs/reference/SYSTEM_TRUTH_SOURCES.md`

## Current Drift Assessment

### Confirmed drift to fix

- [ ] `docs/operations/ENVIRONMENT.md` describes several AI defaults as if they are static `openai` defaults, but the code resolves `fallback` when no provider/key is configured and uses `null` for `AI_PROMPT_TEMPLATE_FILE` when unset.
- [ ] `docs/architecture/DEPLOYMENT.md` still contains stale examples and defaults:
  - `AI_CHAT_MODEL=gpt-4o` instead of the runtime default `gpt-4o-mini`
  - JSON fallback example path `/app/.data/trapmap.json` instead of `/app/.data/skill-shareer.json`
  - provider list omits `google-genai`
  - local CLI example uses `pnpm --filter @trapmap/cli dev -- ...` instead of the root entrypoint `pnpm dev:cli`
- [ ] `docs/guides/CONTRIBUTING.md` still tells contributors to run root `pnpm run db:generate` / `pnpm run db:migrate`, but those scripts only exist in `packages/server/package.json`.
- [ ] `docs/operations/TESTING.md` uses `TIER=core pnpm eval:ci`, while the root command surface exposes `pnpm eval:ci:core`.
- [ ] Several deeper architecture/component docs still carry pre-convergence wording:
  - `docs/architecture/components/PERSISTENCE.md` presents JSON storage internals as the primary layout
  - `docs/architecture/components/EVALUATION.md` shows non-existent CLI forms such as `pnpm eval:retrieval` / `pnpm eval:summary` without the current tiered root-script guidance
  - `docs/architecture/ARCHITECTURE.md` and deployment snippets still mix `localhost` and runtime/default-host facts that now live in truth docs

### Drift that appears already controlled

- [x] Root startup commands in `README.md`, `docs/README.md`, and `docs/guides/GETTING_STARTED.md` generally match `package.json`.
- [x] Package-scoped DB commands in `docs/guides/GETTING_STARTED.md` already match `packages/server/package.json`.
- [x] JSON fallback path `.data/skill-shareer.json` is already correct in the highest-signal onboarding docs.
- [x] CI and eval workflows have explicit authoritative files and are already referenced in truth docs.

### Priority order

- [ ] P0: fix operator-facing drift that can cause wrong commands or wrong env assumptions
- [ ] P1: fix architecture/deployment/component docs that still teach the old posture
- [ ] P2: expand guard coverage so newly corrected topics stop drifting again

## Scope

- In scope:
  - drift analysis and convergence planning
  - truth-source doc refresh where needed
  - onboarding, env, testing, CI, deployment, architecture, and component docs
  - doc-drift tests and smoke checks tied to recurring drift classes
- Out of scope:
  - unrelated product or runtime feature work
  - full information architecture rewrite of `docs/`
  - rewriting archived plans except to preserve the old root `plan.md`

## File Map

### Truth sources

- `package.json`
- `packages/server/package.json`
- `packages/server/src/config.ts`
- `packages/server/src/lib/ai/provider-config.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/eval.yml`
- `docker-compose.yml`
- `packages/server/src/lib/persistence/schema/*.ts`

### Likely documentation files to modify

- `plan.md`
- `docs/reference/DOCS_TRUTH_MATRIX.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/operations/ENVIRONMENT.md`
- `docs/operations/TESTING.md`
- `docs/operations/CI_CD.md`
- `docs/guides/CONTRIBUTING.md`
- `docs/architecture/DEPLOYMENT.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/components/PERSISTENCE.md`
- `docs/architecture/components/EVALUATION.md`
- `docs/README.md`
- `README.md`

### Likely validation files to modify

- `scripts/complexity-budgets.json`
- `scripts/check-doc-drift.ts`
- `scripts/__tests__/check-doc-drift.test.ts`
- `packages/server/src/__tests__/docs-truth-smoke.test.ts`

## Phase Tracker

- [ ] Phase 1: Refresh truth inventory and lock drift ownership
- [ ] Phase 2: Fix onboarding, environment, testing, and contributor workflow docs
- [ ] Phase 3: Fix deployment, architecture, and deep component docs
- [ ] Phase 4: Expand automated guards and document the maintenance workflow

## Global Completion Standard

- [ ] Every confirmed drift item in this plan maps to one authoritative source.
- [ ] Every phase has explicit doc updates, validation updates, and execution examples.
- [ ] No high-signal doc tells contributors to run a command that does not exist at the documented scope.
- [ ] No env or provider doc claims defaults that contradict `config.ts` or `provider-config.ts`.
- [ ] Deployment and architecture docs reflect the PostgreSQL-first posture and the current compatibility fallback path.
- [ ] Automated guards cover command-surface drift, env-default drift, provider drift, and at least one deep architecture/doc regression per category.

---

### Phase 1: Refresh Truth Inventory And Lock Drift Ownership

**Files:**

- Modify: `plan.md`
- Modify: `docs/reference/DOCS_TRUTH_MATRIX.md`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Inspect: `package.json`
- Inspect: `packages/server/package.json`
- Inspect: `packages/server/src/config.ts`
- Inspect: `packages/server/src/lib/ai/provider-config.ts`
- Inspect: `.github/workflows/ci.yml`
- Inspect: `.github/workflows/eval.yml`
- Inspect: `docker-compose.yml`

**Phase completion standard:**

- [ ] Truth docs explicitly separate root commands, package-local DB commands, runtime env defaults, provider defaults, deployment defaults, and workflow ownership.
- [ ] Every drift item listed in this plan points to one owning source file.
- [ ] The truth docs explain which secondary docs must be updated when those sources change.

**Documentation updates required in this phase:**

- [ ] Verify `DOCS_TRUTH_MATRIX.md` has rows for:
  - root workspace commands
  - server-only DB commands
  - runtime env defaults
  - AI provider/model defaults
  - deployment defaults from `docker-compose.yml`
  - CI workflow ownership
  - eval workflow ownership
  - deep persistence/component docs
- [ ] Update `SYSTEM_TRUTH_SOURCES.md` so it references the matrix consistently and does not duplicate stale command guidance.
- [ ] Add a short “highest current drift classes” note if the truth docs do not already make these responsibilities obvious.

**Test / eval updates required in this phase:**

- [ ] Update `packages/server/src/__tests__/docs-truth-smoke.test.ts` if needed so it asserts the truth docs mention the categories above.
- [ ] Run:
  - `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Necessary example structure or code:**

```markdown
| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Root workspace commands | `package.json` | `README.md`, `docs/README.md`, `docs/operations/TESTING.md` |
| Server-only DB commands | `packages/server/package.json` | `docs/guides/GETTING_STARTED.md`, `docs/guides/CONTRIBUTING.md`, `docs/architecture/DEPLOYMENT.md` |
| Runtime env defaults | `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md` |
| AI provider/model defaults | `packages/server/src/lib/ai/provider-config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/DEPLOYMENT.md` |
| Deployment defaults | `docker-compose.yml` | `docs/architecture/DEPLOYMENT.md`, `docs/README.md` |
```

---

### Phase 2: Fix Onboarding, Environment, Testing, And Contributor Workflow Docs

**Files:**

- Modify: `docs/operations/ENVIRONMENT.md`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/guides/CONTRIBUTING.md`
- Review and touch if needed: `README.md`
- Review and touch if needed: `docs/README.md`
- Review and touch if needed: `docs/guides/GETTING_STARTED.md`

**Phase completion standard:**

- [ ] User-facing setup docs use only commands that exist in the documented scope.
- [ ] `ENVIRONMENT.md` matches the actual runtime/provider resolution semantics for host, fallback mode, prompt-template file, and embedding override behavior.
- [ ] Testing docs use the current eval entrypoints and current CI behavior.
- [ ] Contributor docs no longer instruct root-level DB commands that do not exist.

**Documentation updates required in this phase:**

- [ ] In `docs/operations/ENVIRONMENT.md`:
  - describe `AI_PROVIDER` default behavior as “auto-detect openai/google-genai, else fallback” rather than unconditional `openai`
  - document `AI_PROMPT_TEMPLATE_FILE` as unset by default and mention the built-in reference template path separately
  - clarify embedding-provider inheritance vs explicit override
- [ ] In `docs/operations/TESTING.md`:
  - replace `TIER=core pnpm eval:ci` with `pnpm eval:ci:core`
  - verify the local/CI sections use only current root scripts
- [ ] In `docs/guides/CONTRIBUTING.md`:
  - replace `pnpm run db:generate` and `pnpm run db:migrate` with `pnpm --filter @trapmap/server db:generate` and `pnpm --filter @trapmap/server db:migrate`
  - ensure the “文档影响检查清单” points to the truth matrix for command-surface changes
- [ ] Re-check `README.md`, `docs/README.md`, and `docs/guides/GETTING_STARTED.md` for any remaining mismatches found while editing the files above.

**Test / eval updates required in this phase:**

- [ ] Extend `packages/server/src/__tests__/docs-truth-smoke.test.ts` for:
  - banned root DB commands in contributor docs
  - `eval:ci:core` guidance in testing docs
  - env-default wording around fallback/provider detection if the smoke test currently only checks literal values
- [ ] Add or update doc rules in `scripts/complexity-budgets.json` for:
  - `docs/guides/CONTRIBUTING.md`
  - `docs/operations/TESTING.md`
  - `docs/operations/ENVIRONMENT.md`
- [ ] Run:
  - `pnpm check:docs-drift`
  - `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`
  - `pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts`

**Necessary example structure or code:**

```bash
# 生成迁移（修改 schema 后）
pnpm --filter @trapmap/server db:generate

# 手动运行迁移（可选，服务器启动时自动执行）
pnpm --filter @trapmap/server db:migrate

# 运行 CI core 评测
pnpm eval:ci:core
```

```markdown
| `AI_PROVIDER` | Provider 自动解析：显式值优先，其次 `OPENAI_API_KEY` / `GEMINI_API_KEY`，否则回退到 `fallback` | 自动解析 |
| `AI_PROMPT_TEMPLATE_FILE` | 可选的本地 JSON 模板覆盖文件；未设置时不覆盖 | 未设置 |
```

---

### Phase 3: Fix Deployment, Architecture, And Deep Component Docs

**Files:**

- Modify: `docs/architecture/DEPLOYMENT.md`
- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `docs/architecture/components/PERSISTENCE.md`
- Modify: `docs/architecture/components/EVALUATION.md`
- Review and touch if needed: `docs/reference/DATABASE_SCHEMA.md`
- Review and touch if needed: `docs/operations/CI_CD.md`

**Phase completion standard:**

- [ ] Deployment docs match the current compose/runtime posture and do not teach stale defaults.
- [ ] Architecture docs no longer imply JSON storage is the primary path where PG-first is now true.
- [ ] Component docs use current command entrypoints and current fallback semantics.
- [ ] Deep docs that mention schema counts or storage structure match the live schema modules and compatibility-layer framing.

**Documentation updates required in this phase:**

- [ ] In `docs/architecture/DEPLOYMENT.md`:
  - change `AI_CHAT_MODEL=gpt-4o` to `gpt-4o-mini`
  - update provider examples to include `google-genai` where provider types are enumerated
  - replace JSON fallback example path `/app/.data/trapmap.json` with `/app/.data/skill-shareer.json`
  - replace root/legacy CLI examples with the current root command surface where appropriate
- [ ] In `docs/architecture/ARCHITECTURE.md`:
  - align host/default examples with runtime truth and current health-check posture
  - confirm env/default tables reference `SYSTEM_TRUTH_SOURCES.md` and the correct fallback wording
- [ ] In `docs/architecture/components/PERSISTENCE.md`:
  - reframe JSON store details as compatibility/fallback behavior rather than the primary storage architecture
  - ensure sample paths and constructor defaults match `.data/skill-shareer.json`
- [ ] In `docs/architecture/components/EVALUATION.md`:
  - replace outdated eval command examples with the current root script surface
  - align CI examples with `.github/workflows/eval.yml`
- [ ] If schema counts or cited table groupings are touched during edits, refresh `docs/reference/DATABASE_SCHEMA.md` to match `packages/server/src/lib/persistence/schema/*.ts`.

**Test / eval updates required in this phase:**

- [ ] Add/update doc rules in `scripts/complexity-budgets.json` for:
  - `docs/architecture/DEPLOYMENT.md`
  - `docs/architecture/components/PERSISTENCE.md`
  - `docs/architecture/components/EVALUATION.md`
- [ ] Expand `packages/server/src/__tests__/docs-truth-smoke.test.ts` for:
  - `gpt-4o-mini` deployment defaults
  - `.data/skill-shareer.json` in deployment/component docs
  - PG-first wording in persistence docs
- [ ] Run:
  - `pnpm check:docs-drift`
  - `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`
  - `pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts`
  - `pnpm check:complexity`

**Necessary example structure or code:**

```yaml
services:
  server:
    environment:
      - HOST=0.0.0.0
      - PORT=4000
      - TRAPMAP_DATABASE_URL=postgresql://trapmap:${POSTGRES_PASSWORD:-trapmap}@postgres:5432/trapmap
      - TRAPMAP_SYSTEM_ADMIN_KEY=${TRAPMAP_SYSTEM_ADMIN_KEY:-}
```

```yaml
services:
  server:
    environment:
      - TRAPMAP_DATA_FILE=/app/.data/skill-shareer.json
    volumes:
      - ./.data:/app/.data
```

---

### Phase 4: Expand Automated Guards And Maintenance Workflow

**Files:**

- Modify: `scripts/complexity-budgets.json`
- Modify: `scripts/check-doc-drift.ts`
- Modify: `scripts/__tests__/check-doc-drift.test.ts`
- Modify: `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/operations/CI_CD.md`

**Phase completion standard:**

- [ ] The corrected drift classes from Phases 2-3 are enforced by either `docRules`, smoke tests, or both.
- [ ] Ops docs tell maintainers exactly which checks to run after changing commands, env defaults, deployment docs, or architecture docs.
- [ ] Guard coverage is specific enough to catch the known regressions without depending on manual memory.

**Documentation updates required in this phase:**

- [ ] Update `docs/operations/TESTING.md` validation matrix so doc-only changes reference the exact guard commands added in this phase.
- [ ] Update `docs/operations/CI_CD.md` to describe the expanded guard categories accurately instead of only the earlier subset.
- [ ] Add a short maintenance checklist to one of the ops docs for “change truth source -> update secondary docs -> run doc guards”.

**Test / eval updates required in this phase:**

- [ ] Add targeted `docRules` for the highest-signal strings:
  - ban root `pnpm run db:migrate` / `pnpm run db:generate` in docs
  - require `pnpm eval:ci:core` in testing docs
  - require `.data/skill-shareer.json` in deployment/persistence docs
  - require `gpt-4o-mini` where deployment defaults enumerate chat model defaults
- [ ] Add smoke assertions for semantic drift that is not well represented by single strings:
  - provider auto-detection / fallback wording
  - PG-first posture in persistence docs
- [ ] Run the full local verification set:
  - `pnpm check:docs-drift`
  - `pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts`
  - `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`
  - `pnpm check:complexity`
  - `pnpm eval:smoke`

**Necessary example structure or code:**

```json
{
  "file": "docs/guides/CONTRIBUTING.md",
  "mustContain": [
    "pnpm --filter @trapmap/server db:generate",
    "pnpm --filter @trapmap/server db:migrate"
  ],
  "mustNotContain": [
    "pnpm run db:generate",
    "pnpm run db:migrate"
  ]
}
```

```ts
expect(testingDoc).toContain('pnpm eval:ci:core');
expect(deploymentDoc).toContain('.data/skill-shareer.json');
expect(environmentDoc).toMatch(/OPENAI_API_KEY.*GEMINI_API_KEY.*fallback/s);
```
