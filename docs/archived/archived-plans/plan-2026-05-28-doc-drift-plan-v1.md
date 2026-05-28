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
