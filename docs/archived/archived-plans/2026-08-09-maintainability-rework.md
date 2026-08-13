# Maintainability Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce long-term maintenance difficulty of TrapMap: single HTTP route implementation across both hosts, real DDD domain layer, enforced type assertion discipline, cleared compatibility debt, trimmed guard/doc surface, converged eval surface, and web-panel kept with maintenance conventions.

**Architecture:** Preserve both hosts (`host-local` Nest, `host-distributed` Fastify). Unify the HTTP route layer through a framework-neutral `RouteDef` factory consumed by thin Nest/Fastify adapters. Migrate business rules from `service-*` `pg-ports.ts` into `backend-core/<ctx>/domain` pure modules. Enforce naked-assertion ban via a new guard script + Biome coverage of `host-local`.

**Tech Stack:** TypeScript, NestJS, Fastify, Zod (`@trapmap/contracts`), fallow, Biome, Vitest, promptfoo.

**Decisions confirmed by human partner:**
- Keep both hosts (do NOT merge or delete `host-distributed`); keep Nest as the `host-local` stack; keep web-panel (freeze feature surface, add maintenance conventions).
- HTTP unification direction: shared `RouteDef` factory (not full migration to one framework).
- DDD extraction: full domain-layer extraction (not light convergence).
- All remediation scope areas in scope: assertion discipline, compatibility debt, guard/doc reduction, eval convergence, web-panel.

## Global Constraints

- Commands in this repo run with `rtk` prefix per local convention (e.g. `rtk pnpm test:file -- <path>`).
- Every Wave must end mergeable and regressable; each task runs its minimal verification set (affected package tests + `pnpm typecheck` + `pnpm check:fallow`) before completion.
- Assertion discipline: new code must not add `as never`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`. Third-party type gaps use `// lib type gap:` comments. Existing 240 occurrences are tracked in the Wave-0 exemption list and cleared in Wave 6.
- Domain rules go to `backend-core/<ctx>/domain` (pure TS, zero IO, zero framework); infrastructure layer (`service-*` `pg-ports.ts`) must not gain new business judgment.
- New HTTP routes go through the shared `RouteDef` factory; no host may hand-write a route implementation that duplicates a `RouteDef`.
- Do not change any external API surface, runtime defaults, health semantics, or deployment behavior; migrations are refactors with behavior locked by tests.
- Do not introduce new frameworks or new infrastructure dependencies.
- Keep `packages/contracts` as the leaf schema/type source; no new package-level duplicates of shared contracts.
- Web-panel: kept. No new features; only maintenance conventions and CI hygiene.
- Each task's spec text governs; where plan text conflicts with a review finding, surface to human partner.

---

### Task 1: Wave 0 — Assertion guard script + Biome host-local coverage

**Files:**
- Create: `scripts/check-naked-asserts.ts`
- Create: `scripts/__tests__/check-naked-asserts.test.ts`
- Modify: `package.json` (add `check:asserts` script)
- Modify: `biome.json` (remove `packages/host-local/src/nest/**/*.ts` from `files.ignore`)
- Modify: `.github/workflows/ci.yml` (add `check:asserts` to doc-guardrails job)
- Create: `docs/todos/assert-exemptions.md` (exemption list; register it in `docs/todos/README.md` index to satisfy doc-drift/structure guards)

**Interfaces:**
- Consumes: repository-wide source scan; existing `check-relative-imports.mjs` pattern for guard script style.
- Produces: `pnpm check:asserts` command failing on naked assertions outside the exemption list.

- [ ] **Step 1: Write the failing guard test**

Guard script behavior:
- Scans `packages/**/src/**/*.ts` (all packages, including tests).
- Flags `as never`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`.
- Does NOT flag: `as const`, explicit narrowing casts (`as string` etc.), `// lib type gap:` annotated lines.
- Reads exemption list file; lines in it (file:line patterns or `file` + `line` ranges) are skipped.
- Exit code non-zero when new violations found.

- [ ] **Step 2: Generate the exemption list snapshot**

Run the script in record mode to emit the current 240 occurrences into `docs/todos/assert-exemptions.md` grouped by file with counts. This file is committed and is the Wave-6 clearing backlog.

- [ ] **Step 3: Verify guard on clean tree**

Run `rtk pnpm check:asserts` — must pass with zero un-exempted findings.

- [ ] **Step 4: Add a negative test fixture**

Commit a temp test file containing `as never` — guard must fail; remove fixture after verifying.

- [ ] **Step 5: Biome host-local coverage**

Remove the `packages/host-local/src/nest/**/*.ts` ignore entry from `biome.json`. Run `rtk pnpm check` and triage: non-assertion lint findings in host-local (unused vars/imports, formatting) must be fixed in this task. Type-assertion findings are NOT in scope — they are tracked by the Wave-0 exemption list and cleared in Wave 6; do not clear `as never`/`as unknown as` in this task.

- [ ] **Step 6: Wire CI**

Add `pnpm check:asserts` to the `doc-guardrails` job in `.github/workflows/ci.yml`.

- [ ] **Step 7: Minimal verification**

`rtk pnpm test:file -- scripts/__tests__/check-naked-asserts.test.ts` + `rtk pnpm check:asserts` + `rtk pnpm typecheck` + `rtk pnpm check:fallow` + `rtk pnpm check` (biome) + `rtk pnpm check:docs-drift` + `rtk pnpm check:structure` (exemption doc registered in index).

**Acceptance:** `check:asserts` green on clean tree; exemption list committed with 240 entries; host-local under Biome; CI job wired.

---

### Task 2: Wave 1 — RouteDef contract + identity-access pilot migration

**Files:**
- Create: `packages/backend-core/src/http/route-contract.ts`
- Create: `packages/backend-core/src/http/index.ts`
- Create: `packages/backend-core/src/http/adapters/nest.ts`
- Create: `packages/backend-core/src/http/adapters/fastify.ts`
- Modify: `packages/backend-core/src/index.ts` (export http module)
- Modify: `packages/service-identity-access/src/routes.ts` (refactor to `createIdentityAccessRouteDefs(deps): RouteDef[]`)
- Modify: `packages/service-identity-access/src/server.ts` (consume RouteDefs via fastify adapter)
- Modify: `packages/host-local/src/nest/identity-access/identity-access.module.ts` (consume RouteDefs via nest adapter)
- Modify: `packages/host-local/src/nest/gateway/gateway.module.ts` or controller wiring for identity-access routes

**Interfaces:**
- Consumes: `@trapmap/contracts` Zod schemas; existing route handlers' logic unchanged.
- Produces: `RouteDef = { method, path, schema: ZodSchema, handler: (ctx: RouteContext, deps) => Promise<unknown> }` with `RouteContext = { params, query, body, actor?, requestId? }`.

- [ ] **Step 1: Define RouteDef contract**

`route-contract.ts` exports `RouteDef`, `RouteContext`, `createNestAdapter(routeDefs)`, `createFastifyAdapter(routeDefs)`. Zod schema per route validates input; adapters map framework request → RouteContext and framework response ← handler result. Canonical error envelope (`code/message/kind/requestId/traceId?`) is preserved by adapters.

- [ ] **Step 2: Port identity-access routes to RouteDefs**

Move handler bodies from `routes.ts` (Fastify plugin form) into `createIdentityAccessRouteDefs(deps)` preserving exact behavior, validation schemas, and error mapping. Keep routes' Zod schemas as-is (single source; delete duplicated validation inside handlers).

- [ ] **Step 3: Fastify adapter pilot**

`service-identity-access/src/server.ts` builds Fastify app from `createFastifyAdapter(createIdentityAccessRouteDefs(deps))`. Route behavior (paths, schemas, error mapping) preserved exactly; the existing `routes.test.ts` is parametrized per Step 5 to run over both adapters (human ruling: parametrization wins over file-unchanged).

- [ ] **Step 4: Nest adapter pilot**

`host-local` identity-access module registers the same RouteDefs via `createNestAdapter`. Replace the existing hand-written identity-access controller routes; delete the now-unused controller file(s) for identity-access. Route paths/behavior identical.

- [ ] **Step 5: Tests**

Port/extend tests: `service-identity-access/src/routes.test.ts` runs against both adapters (parametrized). Add adapter unit tests (`backend-core/src/http/adapters/adapters.test.ts`) covering error envelope mapping and context assembly.

- [ ] **Step 6: Minimal verification**

`rtk pnpm test:file -- packages/service-identity-access/src/routes.test.ts` + `rtk pnpm test:file -- packages/backend-core/src/http/adapters/adapters.test.ts` + `rtk pnpm test:deployment-smoke` + `rtk pnpm typecheck` + `rtk pnpm check:fallow`.

**Acceptance:** identity-access routes implemented once as RouteDefs, served by both hosts through thin adapters; zero behavior drift (existing route tests pass unchanged).

---

### Task 3: Wave 1 — RouteDef migration for remaining service-* packages

**Files:**
- Modify: `packages/service-knowledge-write/src/routes.ts` (+ `artifact-routes.ts`)
- Modify: `packages/service-knowledge-write/src/server.ts`
- Modify: `packages/service-governance-review/src/routes.ts`
- Modify: `packages/service-governance-review/src/server.ts`
- Modify: `packages/service-candidate-ingestion/src/routes.ts`
- Modify: `packages/service-candidate-ingestion/src/server.ts`
- Modify: `packages/service-job-runtime/src/routes.ts` (if exists)
- Modify: `packages/service-job-runtime/src/server.ts`
- Modify: `packages/service-knowledge-read/src/server-retrieval-seam.ts` / route-bearing files
- Modify: each package's `routes.test.ts` to parametrize over both adapters

**Interfaces:**
- Consumes: `RouteDef` contract from Task 2; existing per-package deps factories.
- Produces: every `service-*` package exposes `create<X>RouteDefs(deps)`; Fastify server assembly via shared adapter.

- [ ] **Step 1: knowledge-write + artifact routes**

Convert `routes.ts` and `artifact-routes.ts` handlers to RouteDefs. Behavior and schemas unchanged. `routes.test.ts`/`artifact-routes.test.ts` parametrized over fastify adapter (service) and nest adapter (host-local consumption where applicable).

- [ ] **Step 2: governance-review routes**

Convert `routes.ts` (incl. admin/async command routes) to RouteDefs.

- [ ] **Step 3: candidate-ingestion routes**

Convert `routes.ts` (candidate submit/get/list/manual-result) to RouteDefs.

- [ ] **Step 4: job-runtime routes**

Convert job-runtime routes (operations/status surface) to RouteDefs.

- [ ] **Step 5: knowledge-read routes**

Convert retrieval/search surface (v1/v2/v3, plan, skills search) to RouteDefs; `server-retrieval-seam.ts` adapted.

- [ ] **Step 6: Per-package verification**

For each package: `rtk pnpm test:file -- <pkg>/src/<routes>.test.ts` + `rtk pnpm test:deployment-smoke` + `rtk pnpm typecheck` + `rtk pnpm check:fallow`.

**Acceptance:** all `service-*` route implementations are RouteDef-based; no Fastify-specific route plugin code remains outside adapters; existing route tests pass.

---

### Task 4: Wave 1 — host-local Nest controllers consume RouteDefs; host-distributed gateway unified

**Files:**
- Modify: `packages/host-local/src/nest/gateway/gateway.module.ts`, `knowledge-read.controller.ts`, `candidate-review.controller.ts`
- Modify: `packages/host-local/src/nest/knowledge-read/knowledge-read.module.ts`
- Modify: `packages/host-local/src/nest/governance-review/governance-review.module.ts`
- Modify: `packages/host-local/src/nest/candidate-ingestion/candidate-ingestion.module.ts`
- Modify: `packages/host-local/src/nest/job-runtime/job-runtime.module.ts`
- Modify: `packages/host-distributed/src/gateway/routes.ts` (1136-line hand-written forwarding → RouteDef-driven forwarding)
- Modify: `packages/host-distributed/src/gateway/server.ts`, `packages/host-distributed/src/gateway/internal-client.ts` (keep internal HTTP client; route description from RouteDefs)
- Delete: duplicated route validation schemas in `gateway.schemas.ts` where RouteDef schemas are the single source

**Interfaces:**
- Consumes: `RouteDef` + adapters from Tasks 2-3; existing host-distributed internal-client/discovery unchanged in behavior.
- Produces: host-local serves every route through Nest adapter over RouteDefs; host-distributed gateway forwards via RouteDefs.

- [ ] **Step 1: host-local Nest controllers**

Replace hand-written controller handlers with Nest adapter registered per module; keep controller files only as thin Nest bindings (or delete where module factory can self-register). `gateway.schemas.ts` merged into RouteDef schemas; delete duplicate schema definitions.

- [ ] **Step 2: host-local route surface test**

`packages/host-local/src/nest/gateway/gateway.schemas.test.ts` and `app.test.ts` updated; route surface must match `api-surface.md` (doc-truth guard passes).

- [ ] **Step 3: host-distributed gateway**

Refactor `routes.ts` to iterate a gateway RouteDef list (forwarding to internal services via existing `internal-client`); eliminate hand-written per-route validation; keep canonical error normalization. Distributed acceptance tests must pass unchanged.

- [ ] **Step 4: Verification**

`rtk pnpm test:deployment-smoke` + `rtk pnpm test:light-target` + `rtk pnpm test:heavy-target` + `rtk pnpm test:distributed-closeout` + `rtk pnpm typecheck` + `rtk pnpm check:fallow`.

**Acceptance:** one RouteDef list per service serves both hosts; host-distributed gateway has no duplicate validation logic; all deployment smoke/closeout suites green.

---

### Task 5: Wave 2 — DDD extraction: knowledge-write + identity-access

**Files:**
- Modify: `packages/backend-core/src/knowledge-write/domain/index.ts` (real domain: lifecycle state machine, invariants, policy)
- Create: `packages/backend-core/src/knowledge-write/domain/lifecycle.ts`, `domain/policy.ts` (+ tests)
- Modify: `packages/backend-core/src/knowledge-write/application/module.ts` (orchestration over domain rules)
- Modify: `packages/service-knowledge-write/src/pg-ports.ts` (strip business logic; keep SQL + row mapping)
- Modify: `packages/service-knowledge-write/src/knowledge-snapshot-owner.ts` as needed
- Modify: `packages/backend-core/src/identity-access/domain/index.ts` (permission/eligibility rules, access-key hashing policy)
- Modify: `packages/service-identity-access/src/pg-ports.ts`
- Tests: move rule assertions from `pg-ports.test.ts` into domain tests

**Interfaces:**
- Consumes: existing behavior tests as oracle; `@trapmap/contracts` types.
- Produces: domain modules with zero framework/DB imports; pg-ports slimmed to mapping.

- [ ] **Step 1: knowledge-write domain**

Extract `lifecycleTransitions` state machine and invariants (submit/resubmit/supersede/approve/reject/maintenance/decay eligibility) into `domain/lifecycle.ts` + `domain/policy.ts` as pure functions with unit tests (no DB).

- [ ] **Step 2: knowledge-write application**

Rewrite `application/module.ts` to call domain functions for state decisions before delegating to `knowledgeOwner` port; keep audit orchestration.

- [ ] **Step 3: knowledge-write pg-ports slimming**

Remove business judgment from `pg-ports.ts` (876 lines → mapping + SQL only). Keep all SQL/row mapping behavior; move rule logic to domain. `pg-ports.test.ts` keeps SQL integration assertions; rule assertions move to `domain/*.test.ts`.

- [ ] **Step 4: identity-access domain**

Extract permission checks, security-level gating, access-key hashing/normalization policy into `domain/`. `pg-ports.ts` slims to mapping.

- [ ] **Step 5: Verification per context**

`rtk pnpm test:file -- <ctx domain tests>` + `rtk pnpm test:file -- <ctx pg-ports.test.ts>` + `rtk pnpm typecheck` + `rtk pnpm check:fallow`. Run `pnpm check:docs-truth` to confirm architecture docs align.

**Acceptance:** `domain/` has real rules with offline unit tests; `pg-ports.ts` line count reduced ≥50%; no behavior change (all existing tests pass); domain imports zero framework/DB packages.

---

### Task 6: Wave 3 — DDD extraction: governance-review + candidate-ingestion

**Files:**
- Modify: `packages/backend-core/src/governance-review/domain/index.ts` (review-queue eligibility, decision rules, feedback invariants)
- Modify: `packages/service-governance-review/src/pg-ports.ts`, `admin.ts`, `async-commands.ts`, `conflict-workflow.ts`
- Modify: `packages/backend-core/src/candidate-ingestion/domain/index.ts` (dedup policy, resolution rules, lineage invariants)
- Modify: `packages/service-candidate-ingestion/src/pg-ports.ts`, `processing.ts`, `llm-dedup.ts`, `processing-task-queue.ts`
- Tests: domain unit tests; slimming of pg-ports tests per Task 5 template

**Interfaces:** Same template as Task 5; governance/candidate domains may depend on `knowledge-write` domain rules via application orchestration only.

- [ ] **Step 1: governance-review domain + application**
- [ ] **Step 2: governance-review service slimming**
- [ ] **Step 3: candidate-ingestion domain + application**
- [ ] **Step 4: candidate-ingestion service slimming**
- [ ] **Step 5: Verification (same set as Task 5)**

**Acceptance:** Same as Task 5 for both contexts; `conflict-workflow.ts`/`processing.ts` rule logic in domain, orchestration in application.

---

### Task 7: Wave 4 — DDD extraction: job-runtime + knowledge-read

**Files:**
- Modify: `packages/backend-core/src/job-runtime/domain/index.ts` (queue ownership, retry/reclaim/status rules)
- Modify: `packages/service-job-runtime/src/*`
- Modify: `packages/backend-core/src/knowledge-read/domain/index.ts` (read-model assembly rules, retrieval eligibility/filtering policies)
- Modify: `packages/service-knowledge-read/src/read-model.ts`, `retrieval-orchestration.ts`, `filters.ts`, `response-assembly.ts` (pure rules → domain; recall channels stay infra)
- Tests: domain unit tests; read-side domain tests offline (no DB)

**Interfaces:** Read side keeps performance-sensitive recall channels (SQL/schema access) in infra per BOUNDARIES.md Category C; only judgment/assembly rules move to domain.

- [ ] **Step 1: job-runtime domain + service slimming**
- [ ] **Step 2: knowledge-read domain (retrieval policy, eligibility, ranking merge, response assembly rules)**
- [ ] **Step 3: knowledge-read infra slimming (recall channels stay)**
- [ ] **Step 4: Verification (same set as Task 5)**

**Acceptance:** Same as Task 5; `service-knowledge-read` recall channels keep schema access (documented exception), judgment code in domain.

---

### Task 8: Wave 5 — Compatibility debt clearance

**Files:**
- Modify: `packages/service-*/src/pg-ports.ts` (remove dual-key fallback row mapping: `readKnowledgeRowValue(row, primary, fallbackKey, fallback)` → single-key)
- Archive: backfill scripts (`snapshot-backfill.ts`, `wave9-*.ts`, `identity-audit-backfill.ts`, `graph-projection-backfill.ts`) → `scripts/archived/` with their tests, or convert to one-time migration if still needed
- Delete: empty dirs `packages/host-local/src/bootstrap`, `packages/host-local/src/http`, `packages/host-local/src/runtime`, `packages/host-local/src/config`
- Modify: docs with "（Wave-10 已删除）" references → point to archived plan
- Modify: `packages/persistence-schema` vs `service-*` `schema.ts` dedup assessment (document decision; unify on persistence-schema if duplicated)

**Interfaces:** Consumes Wave 2-4 slimmed ports; column names are PG-truth (snake_case).

- [ ] **Step 1: Single-key row mapping**

Replace all `readKnowledgeRowValue(row, x, y, z)` triples with single-key reads against the canonical PG column; delete fallback helpers (`readKnowledgeRowFields` where redundant). Verify via existing pg-ports tests.

- [ ] **Step 2: Backfill scripts triage**

For each backfill/wave script: determine if migration is complete (check migration history/tests). Completed → move to `scripts/archived/` (git mv) and delete paired tests or reduce to smoke. Needed → convert to Drizzle migration. Document each decision in the task report.

- [ ] **Step 3: Empty dirs + doc references**

Remove empty dirs; fix "（Wave-10 已删除）" doc references to point to the archived compatibility-shell plan; run `pnpm check:structure`.

- [ ] **Step 4: schema dedup decision**

Compare `persistence-schema` column factories vs each `service-*` `schema.ts`; unify where duplicated (prefer persistence-schema); document exceptions.

- [ ] **Step 5: Verification**

Affected package tests + `rtk pnpm test:import-export` + `rtk pnpm check:stale-package-refs` + `rtk pnpm check:structure` + `rtk pnpm typecheck`.

**Acceptance:** no dual-key fallback reads; no backfill scripts in active tree; empty dirs gone; doc references current; schema dedup documented.

---

### Task 9: Wave 6 — Assertion backlog clearance (240 entries)

**Files:** All packages (driven by `docs/todos/assert-exemptions.md` from Task 1)

**Interfaces:** Consumes exemption list; Wave 2-5 refactors already removed a share of entries.

- [ ] **Step 1: Triage current list**

Re-run `pnpm check:asserts` record mode; diff against Task 1 snapshot; entries naturally gone after Waves 1-5 are removed.

- [ ] **Step 2: Clear production-code entries**

For each remaining production entry: replace with Zod runtime validation (`@trapmap/contracts` schemas) + explicit narrowing; or define explicit interface; or add `// lib type gap:` with reason. Prioritize `app.module.ts`/`knowledge-read.module.ts` assembly casts and `pg-ports.ts` row casts.

- [ ] **Step 3: Clear test-code entries**

Test casts: replace with typed fixtures or explicit narrowing; keep zero `as never` in tests.

- [ ] **Step 4: Remove exemptions**

When a file's entries are all cleared, drop its exemption lines. Goal: empty exemption file.

- [ ] **Step 5: Verification**

`rtk pnpm check:asserts` (zero exemptions) + `rtk pnpm typecheck` + full affected-package tests.

**Acceptance:** exemption list empty; `check:asserts` enforces zero tolerance repo-wide.

---

### Task 10: Wave 7 — Guard and doc reduction

**Files:**
- Modify: `package.json` scripts (merge checks)
- Modify: `scripts/` (merge/archive one-off ops scripts)
- Modify: `docs/` (archive non-core docs to `docs/archived/`; update `docs/README.md`, `docs/todos/README.md`, archived table)
- Modify: `.github/workflows/ci.yml` (consolidate guard jobs)

**Interfaces:** Preserves CI guard behavior; `SYSTEM_TRUTH_SOURCES.md` remains authoritative.

- [ ] **Step 1: Merge doc checks**

`check:docs-drift` + `check:docs-truth` + `check:doc-references` → single `check:docs` command (keep distinct failure locators internally); update AGENTS.md references.

- [ ] **Step 2: Merge structure checks**

`check:arch-freeze` + `check:structure` + `check:stale-package-refs` → evaluate merge into `check:structure`; keep `check:fallow`, `check:deps`, `check:complexity`, `check:imports` where non-overlapping.

- [ ] **Step 3: Archive one-off scripts**

Move one-off ops scripts (`export-retrieval-db-snapshot.ts`, `backfill-labels.ts`, `repair-label-merges.ts`, `export-badcase-to-eval.ts`, etc.) to `scripts/archived/`; keep `runtime-closeout`, `observability-benchmark` (documented regression commands).

- [ ] **Step 4: Docs archive**

Move non-core active docs (historic/reference-only) to `docs/archived/`; keep ~30-40 authoritative core pages; update indexes (`docs/README.md`, archived README table). Run `rtk pnpm check:docs` + `rtk pnpm check:structure`.

- [ ] **Step 5: CI consolidation**

Update `doc-guardrails` job to consolidated commands; remove duplicate fallow invocations.

- [ ] **Step 6: Verification**

`rtk pnpm check:docs` + `rtk pnpm check:structure` + `rtk pnpm check:fallow` + CI-equivalent dry run.

**Acceptance:** guard count reduced to ≤7 `check:*` scripts with no coverage loss; active docs reduced to authoritative set; all index/archive references valid.

---

### Task 11: Wave 8 — Eval convergence + web-panel maintenance conventions

**Files:**
- Modify: `evals/` suites (agent-planning, label-alignment, ingestion: smoke retained, core archived)
- Modify: `evals/promptfoo/parity-*.test.ts` (one representative parity per suite)
- Modify: `docs/operations/TESTING.md`, `evals/*/README.md` (owners + change gates)
- Modify: `packages/web-panel/README.md` (maintenance conventions: frozen feature surface, client-core only, no new deps)
- Modify: `.github/workflows/eval.yml` if needed

**Interfaces:** `pnpm eval:smoke` remains the CI eval gate.

- [ ] **Step 1: Eval tier trimming**

Move `core` datasets/scenarios for agent-planning/label-alignment/ingestion to `evals/<suite>/archived/` (or document as manual tier); keep smoke as CI gate. Keep retrieval/summary/graph-extraction core tiers.

- [ ] **Step 2: Parity convergence**

Keep one representative `parity-*.test.ts` per suite; archive the rest with documentation.

- [ ] **Step 3: Owner/gate documentation**

Write suite owners and change gates into `evals/*/README.md` and `TESTING.md`.

- [ ] **Step 4: Web-panel conventions**

Add maintenance conventions to `packages/web-panel/README.md`: frozen feature surface, consumes only `client-core` + `contracts`, no new third-party deps without documented justification, vitest config tests retained. Remove any stale references.

- [ ] **Step 5: Verification**

`rtk pnpm eval:smoke` + `rtk pnpm test:file -- evals/promptfoo/runner.test.ts` + affected evals tests + `rtk pnpm typecheck`.

**Acceptance:** eval CI gate is `eval:smoke`; core tiers for non-core suites archived with docs; web-panel conventions documented; eval.yml consistent.

---

### Task 12: Wave 9 — Maintenance mechanism solidification + full regression

**Files:**
- Modify: `AGENTS.md` (task-routing rules for new domain rules, RouteDef rule, assertion ban)
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md` (updated facts)
- Modify: `docs/reference/REPO_STRUCTURE.md` (updated layout)
- Archive: this plan's mainline detail + closeout into `docs/archived/archived-plans/` after completion (per repo governance)

**Interfaces:** Consumes all prior wave results.

- [ ] **Step 1: AGENTS.md rules**

Add: new domain rules must land in `backend-core/<ctx>/domain`; new routes must use RouteDef factory; assertion ban in pre-commit (Wave 0 already wired; add exemption expiry mechanism).

- [ ] **Step 2: Truth-source updates**

Update `SYSTEM_TRUTH_SOURCES.md`, `REPO_STRUCTURE.md`, `BOUNDARIES.md` (RouteDef layer, domain layer), `architecture.md`/`ARCHITECTURE.md` layer descriptions. Run `rtk pnpm check:docs-truth`.

- [ ] **Step 3: Full regression**

`rtk pnpm test:light-target` + `rtk pnpm test:heavy-target` + `rtk pnpm eval:smoke` + `rtk pnpm check:docs` + `rtk pnpm check:structure` + `rtk pnpm check:fallow` + `rtk pnpm typecheck` + `rtk pnpm check` (biome) + `rtk pnpm check:asserts`.

- [ ] **Step 4: Closeout archive**

Per repo governance: archive plan mainline detail + closeout record into `docs/archived/archived-plans/`; update `docs/archived/README.md` and `docs/todos/README.md`; `git mv` per archive rules.

**Acceptance:** AGENTS.md carries the three standing rules; truth sources reflect the new layer structure; full regression green; plan archived with closeout evidence.
