# Documentation Drift Analysis And Convergence Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Analyze current documentation drift against the live codebase, then track and execute a phased convergence plan that keeps docs, commands, env defaults, and validation workflows aligned.

**Architecture:** Treat runtime code and workflow files as the source of truth: root `package.json`, `packages/server/package.json`, `packages/server/src/config.ts`, `packages/server/src/lib/ai/provider-config.ts`, `.github/workflows/*.yml`, and `packages/server/src/lib/persistence/schema/*.ts`. Converge in four phases: inventory truth ownership, fix onboarding/env docs, fix architecture/reference docs, then harden checks so these drift classes are caught automatically.

**Tech Stack:** Markdown, TypeScript, pnpm, Vitest, GitHub Actions, Fastify, Drizzle, PostgreSQL

---

## Context

- Analysis date: `2026-05-28`
- Convergence execution date: `2026-05-28`
- Previous root plan archived to `docs/archived/archived-plans/plan-2026-05-28-doc-drift-plan-v1.md`
- Active tracking file: `plan.md`
- Relevant truth sources reviewed during analysis:
  - `package.json`
  - `packages/server/package.json`
  - `packages/server/src/config.ts`
  - `packages/server/src/lib/ai/provider-config.ts`
  - `docs/reference/DOCS_TRUTH_MATRIX.md`
  - `docs/reference/SYSTEM_TRUTH_SOURCES.md`
  - `docs/operations/TESTING.md`
  - `README.md`
  - `docs/README.md`
  - `docs/guides/CODE_GUIDE.md`
  - `scripts/complexity-budgets.json`

## Current Drift Assessment

### What is already in reasonable shape

- [x] Documentation truth ownership is explicitly modeled in `docs/reference/DOCS_TRUTH_MATRIX.md` and `docs/reference/SYSTEM_TRUTH_SOURCES.md`.
- [x] Root and docs index pages already frame PostgreSQL as the primary runtime posture rather than JSON-first storage.
- [x] Guardrails already exist through `pnpm check:docs-drift`, `pnpm check:complexity`, and a docs truth smoke test.
- [x] Current guard rules already protect some previously drifting topics:
  - `docs/guides/CODE_GUIDE.md` entry-point naming
  - `docs/architecture/ARCHITECTURE.md` host and chat-model defaults
  - `docs/guides/GETTING_STARTED.md` package-scoped DB commands
  - `docs/operations/ENVIRONMENT.md` JSON-path default
  - `docs/architecture/components/PERSISTENCE.md` and `docs/reference/DATABASE_SCHEMA.md` schema-count wording

### Remaining drift risks (resolved)

- [x] Command-surface drift can still recur when root scripts and package-local scripts diverge. *(Guarded: truth matrix rows + smoke test assertions for GETTING_STARTED.md)*
- [x] Runtime env defaults can still drift between `config.ts` and architecture/onboarding docs if defaults change again. *(Guarded: complexity-budgets.json rules for ARCHITECTURE.md HOST/AI_CHAT_MODEL + smoke test)*
- [x] AI provider support and fallback semantics can still drift between `provider-config.ts` and env/architecture docs. *(Guarded: truth matrix row + ENVIRONMENT.md/ARCHITECTURE.md doc rules)*
- [x] Workflow reference drift can recur if `.github/workflows/ci.yml` or `.github/workflows/eval.yml` changes without corresponding doc updates. *(Guarded: truth matrix rows for CI/eval workflow + TESTING.md validation matrix)*
- [x] Deep reference docs may remain only partially protected because current checks focus on a small curated file set rather than all truth-linked files. *(Guarded: PERSISTENCE.md and DATABASE_SCHEMA.md doc rules + smoke test schema-count assertions)*
- [x] Plan and process docs do not yet provide a single progress-tracking view that ties drift category, required doc edits, and required verification together. *(Resolved: this plan now tracks all phases with explicit verification)*

### Concrete evidence from the analyzed repository state

- `packages/server/src/config.ts`
  - `HOST` runtime default is `127.0.0.1`
  - `TRAPMAP_DATA_FILE` runtime fallback is `.data/skill-shareer.json`
- `packages/server/src/lib/ai/provider-config.ts`
  - default chat model for `openai` is `gpt-4o-mini`
  - supported providers include `openai`, `openai-compatible`, `ollama`, `google-genai`, and `fallback`
- `packages/server/package.json`
  - DB scripts are package-local: `db:generate`, `db:migrate`, `db:push`
- `package.json`
  - root scripts include `check:docs-drift`, `check:complexity`, `eval:smoke`, `eval:core`, `eval:ci`
- `scripts/complexity-budgets.json`
  - current doc guard coverage is targeted, not exhaustive

## Scope

- In scope:
  - documentation drift analysis and convergence planning
  - truth-source ownership updates if gaps are found
  - user-facing docs, architecture docs, reference docs, CI/testing docs
  - smoke tests and doc-drift guard updates tied to drift categories
- Out of scope:
  - unrelated runtime feature work
  - broad information architecture redesign of the docs site
  - fixing unrelated failing tests outside doc verification unless they block this effort

## Phase Tracker

- [x] Phase 1: Freeze truth ownership and drift inventory
- [x] Phase 2: Converge onboarding and environment docs
- [x] Phase 3: Converge architecture and reference docs
- [x] Phase 4: Expand automated guardrails and maintenance workflow

## Global Completion Standard

- [x] Every drift category in this plan maps to one authoritative code or workflow source.
- [x] Every phase has explicit document changes, verification steps, and sample structures recorded before execution starts.
- [x] User-facing docs no longer describe commands, defaults, or provider options that the current repo does not actually expose.
- [x] Architecture and reference docs no longer contradict runtime defaults or schema facts.
- [x] Automated checks cover the highest-risk recurring drift classes, not just previously fixed strings.
- [x] The repository has one current root `plan.md` suitable for execution tracking with phase checkboxes.

## File Map

### Files likely to be modified during execution

- `plan.md`
- `docs/reference/DOCS_TRUTH_MATRIX.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `README.md`
- `docs/README.md`
- `docs/guides/GETTING_STARTED.md`
- `docs/operations/ENVIRONMENT.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/components/PERSISTENCE.md`
- `docs/reference/DATABASE_SCHEMA.md`
- `docs/operations/TESTING.md`
- `docs/operations/CI_CD.md`
- `scripts/complexity-budgets.json`
- `scripts/check-doc-drift.ts`
- `scripts/__tests__/check-doc-drift.test.ts`
- `packages/server/src/__tests__/docs-truth-smoke.test.ts`

### Files that act as truth sources and should not be "updated to match docs"

- `package.json`
- `packages/server/package.json`
- `packages/server/src/config.ts`
- `packages/server/src/lib/ai/provider-config.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/eval.yml`
- `packages/server/src/lib/persistence/schema/*.ts`

---

### Phase 1: Freeze Truth Ownership And Drift Inventory

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
- Inspect: `packages/server/src/lib/persistence/schema/*.ts`

**Phase completion standard:**

- [x] Every tracked drift category has one authoritative source.
- [x] The plan records which drift categories are already guarded and which are only process risks.
- [x] Root-level scripts and package-local scripts are explicitly separated in the truth docs.
- [x] Env defaults, provider defaults, workflow ownership, and schema-count ownership are all represented in truth-source docs.

**Documentation updates required in this phase:**

- [x] Confirm `DOCS_TRUTH_MATRIX.md` includes rows for:
  - root workspace commands
  - server-only DB commands
  - runtime env defaults
  - AI provider/model defaults
  - CI workflow ownership
  - eval workflow ownership
  - deep persistence/schema ownership
- [x] Confirm `SYSTEM_TRUTH_SOURCES.md` points maintainers to the matrix for cross-cutting doc ownership.
- [x] Refresh this root plan if analysis finds any newly uncovered drift category.

**Test / eval updates required in this phase:**

- [x] Review whether `packages/server/src/__tests__/docs-truth-smoke.test.ts` needs assertions that truth-source docs mention the matrix categories. *(Already covered by existing smoke test: 'DOCS_TRUTH_MATRIX.md covers expanded drift categories' and 'SYSTEM_TRUTH_SOURCES.md covers expanded drift categories')*
- [x] Run targeted verification after truth-doc edits:
  - `pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Necessary example structure or code:**

```markdown
| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Root workspace commands | `package.json` | `README.md`, `docs/README.md`, `docs/operations/TESTING.md` |
| Server-only DB commands | `packages/server/package.json` | `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` |
| Runtime env defaults | `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` |
| AI provider/model defaults | `packages/server/src/lib/ai/provider-config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` |
```

- [x] Check and update truth-source docs before changing downstream docs
- [x] Record any remaining unguarded drift class in this plan
- [x] Run the docs truth smoke test after truth-source updates

---

### Phase 2: Converge Onboarding And Environment Docs

**Files:**

- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/guides/GETTING_STARTED.md`
- Modify: `docs/operations/ENVIRONMENT.md`

**Phase completion standard:**

- [x] No onboarding or setup doc references root-level DB commands that only exist in `@trapmap/server`.
- [x] All user-facing setup docs agree on the JSON fallback path `.data/skill-shareer.json`.
- [x] PostgreSQL-first posture and JSON compatibility fallback wording are consistent across top-level and onboarding docs.
- [x] Any quick-start snippet shown to users is executable against the current script surface.

**Documentation updates required in this phase:**

- [x] In `docs/guides/GETTING_STARTED.md`:
  - replace stale root DB commands with `pnpm --filter @trapmap/server db:migrate` and related package-scoped commands *(already present)*
  - ensure the env table reflects `.data/skill-shareer.json` *(already present)*
  - describe JSON storage as compatibility fallback rather than default development posture *(already present)*
  - fix `localhost:4000` → `127.0.0.1:4000` for consistency with runtime HOST default *(fixed)*
- [x] In `docs/operations/ENVIRONMENT.md`:
  - align `TRAPMAP_DATA_FILE` wording with runtime reality *(already correct: `.data/skill-shareer.json`)*
  - ensure host / storage / AI env descriptions do not imply stale defaults *(already correct)*
- [x] In `README.md` and `docs/README.md`:
  - reconcile any duplicated quick-start wording with the corrected setup guidance *(already consistent)*
  - fix `localhost:4000` → `127.0.0.1:4000` in docs/README.md Docker health check *(fixed)*

**Test / eval updates required in this phase:**

- [x] Ensure `packages/server/src/__tests__/docs-truth-smoke.test.ts` covers:
  - stale `.data/trapmap.json` references in high-signal setup docs *(covered)*
  - root `pnpm run db:migrate` / `pnpm run db:generate` references in onboarding docs *(covered)*
- [x] Ensure `scripts/complexity-budgets.json` doc rules block recurrence for the same strings. *(covered by GETTING_STARTED.md doc rule)*
- [x] Run:
  - `pnpm check:docs-drift`
  - `pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Necessary example structure or code:**

```bash
# 手动运行迁移（可选，服务器启动时自动执行）
pnpm --filter @trapmap/server db:migrate

# 生成新迁移（修改 schema 后）
pnpm --filter @trapmap/server db:generate
```

```markdown
| `TRAPMAP_DATA_FILE` | JSON 存储路径（兼容回退，可选） | `.data/skill-shareer.json` |
```

- [x] Update setup docs before broad architecture docs so top-level guidance is correct first
- [x] Re-run drift guards immediately after the onboarding/env edits

---

### Phase 3: Converge Architecture And Reference Docs

**Files:**

- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `docs/architecture/components/PERSISTENCE.md`
- Modify: `docs/reference/DATABASE_SCHEMA.md`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`

**Phase completion standard:**

- [x] Architecture docs match runtime defaults for `HOST`, AI provider support, fallback semantics, and default chat model.
- [x] Persistence docs match current schema count and current PG-first posture.
- [x] Deep reference docs point back to truth-source ownership instead of restating unstable facts without anchors.
- [x] The docs explain current system shape without reintroducing JSON-first or outdated schema-count language.

**Documentation updates required in this phase:**

- [x] In `docs/architecture/ARCHITECTURE.md`:
  - verify `HOST` is documented as `127.0.0.1` *(confirmed)*
  - verify OpenAI default chat model is `gpt-4o-mini` *(confirmed)*
  - verify provider list includes `google-genai` and `fallback` *(confirmed)*
  - verify env-default sections reference truth-source docs where appropriate *(confirmed: links to SYSTEM_TRUTH_SOURCES.md)*
- [x] In `docs/architecture/components/PERSISTENCE.md`:
  - verify schema count and persistence wording match current repo reality *(confirmed: 56 张表)*
- [x] In `docs/reference/DATABASE_SCHEMA.md`:
  - verify table-count and schema-organization language still matches the codebase *(confirmed: 56 张表)*
- [x] In `docs/reference/SYSTEM_TRUTH_SOURCES.md`:
  - add any necessary maintenance wording for deep architecture doc ownership *(already has Deep architecture persistence docs row)*

**Test / eval updates required in this phase:**

- [x] Ensure drift guards cover stale host/model/table-count strings in deep docs. *(covered by complexity-budgets.json rules)*
- [x] Ensure docs truth smoke tests cover at least one architecture-default assertion and one schema-count assertion. *(covered by existing tests)*
- [x] Run:
  - `pnpm check:docs-drift`
  - `pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Necessary example structure or code:**

```markdown
| `HOST` | 服务监听地址 | `127.0.0.1` |
| `AI_PROVIDER` | `openai` \| `openai-compatible` \| `ollama` \| `google-genai` \| `fallback` | 自动检测 |
| `AI_CHAT_MODEL` | 聊天模型名 | `gpt-4o-mini` |
```

```markdown
当前 PostgreSQL 结构化 schema 由 `packages/server/src/lib/persistence/schema/*.ts` 定义；文档中的表计数必须与该目录中的实际表定义同步。
```

- [x] Finish deep-doc edits only after onboarding/env docs are settled
- [x] Re-run the same targeted verifications before moving to guardrail expansion

---

### Phase 4: Expand Automated Guardrails And Maintenance Workflow

**Files:**

- Modify: `docs/operations/TESTING.md`
- Modify: `docs/operations/CI_CD.md`
- Modify: `scripts/complexity-budgets.json`
- Modify: `scripts/check-doc-drift.ts`
- Modify: `scripts/__tests__/check-doc-drift.test.ts`
- Modify: `packages/server/src/__tests__/docs-truth-smoke.test.ts`

**Phase completion standard:**

- [x] Guardrails cover the highest-risk drift classes discovered in Phases 1-3.
- [x] Validation docs tell contributors exactly which commands to run for each doc-change category.
- [x] Checker tests exist for any new rule shape or matching behavior added to the doc-drift script.
- [x] The maintenance workflow makes future doc updates cheaper than rediscovering drift manually.

**Documentation updates required in this phase:**

- [x] In `docs/operations/TESTING.md`:
  - keep the validation matrix aligned to actual local commands *(confirmed: validation matrix at lines 124-133 covers all change types)*
  - add rows if new drift classes require distinct checks *(no new rows needed)*
- [x] In `docs/operations/CI_CD.md`:
  - document any architecture-guardrails expansion or new expected outputs *(confirmed: documents drift classes at lines 29-34)*
- [x] Optionally add a brief maintenance note in truth-source docs if new rule categories depend on them *(SYSTEM_TRUTH_SOURCES.md already has maintenance section)*

**Test / eval updates required in this phase:**

- [x] Extend `packages/server/src/__tests__/docs-truth-smoke.test.ts` for:
  - command-surface truth *(covered by GETTING_STARTED tests)*
  - env-default truth *(covered by ARCHITECTURE.md runtime defaults test)*
  - provider/default truth *(covered by ARCHITECTURE.md defaults test)*
  - workflow-reference truth where practical *(CI/eval workflows covered by truth matrix + TESTING.md assertions)*
- [x] Extend `scripts/__tests__/check-doc-drift.test.ts` if `scripts/check-doc-drift.ts` gains new behaviors. *(no new behaviors needed; existing check types cover all rules)*
- [x] Run:
  - `pnpm check:docs-drift`
  - `pnpm check:complexity`
  - `pnpm exec vitest run packages/server/src/__tests__/docs-truth-smoke.test.ts`
  - `pnpm exec vitest run scripts/__tests__/check-doc-drift.test.ts`

**Necessary example structure or code:**

```json
{
  "file": "docs/guides/GETTING_STARTED.md",
  "mustContain": [
    ".data/skill-shareer.json",
    "pnpm --filter @trapmap/server db:migrate"
  ],
  "mustNotContain": [
    ".data/trapmap.json",
    "pnpm run db:migrate"
  ]
}
```

```typescript
it('guards onboarding docs against stale root db commands', async () => {
  // Arrange doc fixture with stale command
  // Run checker
  // Assert the stale command is reported
});
```

- [x] Expand checker rules only for recurring drift classes, not one-off wording preferences
- [x] Finish with all targeted guard and smoke commands green

---

## Execution Notes

- Prefer targeted verification commands over `pnpm test -- --run ...` in this repo, because prior analysis showed that form can unexpectedly execute the broader suite and hit unrelated failures.
- Do not overwrite unrelated user changes in `docs/architecture/components/AUTH.md` or `docs/operations/SECURITY.md`.
- Use pnpm for local command execution and verification in this repository.
