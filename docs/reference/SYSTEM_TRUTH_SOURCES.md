# System Truth Sources

Each architecture fact has one authoritative source. When secondary docs drift, the authoritative source wins.

| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Server entry point | `packages/server/src/app.ts` (`buildServer()`), `packages/server/src/index.ts`, `packages/server/src/worker.ts` | `docs/guides/CODE_GUIDE.md`, `docs/architecture/ARCHITECTURE.md` |
| Startup sequence | `packages/server/src/bootstrap/run-startup-sequence.ts` + `packages/server/src/bootstrap/run-worker-sequence.ts` | `docs/architecture/ARCHITECTURE.md`, `docs/guides/CODE_GUIDE.md` |
| Persistence migration state | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md` |
| DB schema | `packages/server/src/lib/persistence/schema/index.ts` (barrel, re-exports all domain table modules) | `docs/reference/DATABASE_SCHEMA.md` |
| Server data-access boundary | `packages/server/src/lib/actors/lookup.ts` (actor lookup), `packages/server/src/lib/repos/index.ts` (`SkillShareerRepos`) | `docs/PACKAGES.md`, `docs/reference/DATA_MODEL.md` |
| Persistence posture | `README.md` + `packages/server/src/lib/persistence/schema/*.ts` | `docs/README.md`, `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` |
| CI jobs | `.github/workflows/ci.yml` | `docs/operations/CI_CD.md`, `docs/operations/TESTING.md` |
| Schema count | `packages/server/src/lib/persistence/schema/*.ts` (artifacts.ts, knowledge.ts, candidates.ts, auth.ts, retrieval.ts, queue.ts, index.ts) | `docs/reference/DATABASE_SCHEMA.md`, `docs/README.md` |
| Guardrail commands | `scripts/complexity-budgets.json` + `.github/workflows/ci.yml` | `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` |
| Startup commands | `package.json` scripts section | `docs/README.md`, `docs/guides/GETTING_STARTED.md` |
| Eval entrypoints | `package.json` scripts section | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` |
| Deployment defaults | `docker-compose.yml` + `packages/server/Dockerfile` | `docs/architecture/DEPLOYMENT.md`, `docs/README.md` |
| Root workspace commands | `package.json` (scripts section) | `README.md`, `docs/README.md`, `docs/operations/TESTING.md` |
| Server-only DB commands | `packages/server/package.json` (db:generate, db:migrate, db:push) | `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` |
| Runtime env defaults | `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` |
| Runtime request/trace headers | `packages/server/src/config.ts` + `packages/server/src/lib/runtime/request-context.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/DEPLOYMENT.md`, `docs/reference/api-surface.md` |
| Runtime status/readiness contract | `packages/server/src/app.ts` + `packages/server/src/lib/runtime/runtime-metadata.ts` | `docs/architecture/DEPLOYMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/reference/api-surface.md`, `docs/operations/TESTING.md` |
| Shared resilience policy | `packages/server/src/lib/runtime/resilience.ts` | `docs/operations/ENVIRONMENT.md`, `docs/operations/TESTING.md`, `docs/architecture/ARCHITECTURE.md` |
| Runtime metrics snapshot semantics | `packages/server/src/lib/runtime/metrics.ts` | `docs/operations/ENVIRONMENT.md`, `docs/operations/TESTING.md` |
| Retrieval cache invalidation policy | `packages/server/src/lib/cache/invalidation.ts` + `packages/server/src/lib/cache/retrieval-read-model-cache.ts` + `packages/server/src/lib/retrieval/capsules/intent-cache.ts` | `docs/PACKAGES.md`, `docs/PACKAGE_STACK_RATIONALE.md`, `docs/operations/TESTING.md` |
| Queue / outbox reliability policy | `packages/server/src/lib/queue/task-queue.ts` + `packages/server/src/lib/lifecycle/outbox.ts` + `packages/server/src/bootstrap/bootstrap-lifecycle.ts` | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md`, `docs/architecture/DEPLOYMENT.md` |
| AI provider/model defaults | `packages/server/src/lib/ai/provider-config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` |
| Eval workflow | `.github/workflows/eval.yml` | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` |
| Deep architecture persistence docs | `packages/server/src/lib/persistence/schema/*.ts` | `docs/architecture/components/PERSISTENCE.md`, `docs/reference/DATABASE_SCHEMA.md` |
| Health/readiness endpoints | `packages/server/src/app.ts` (`/health`, `/ready`, `/meta/routes`) | `docs/architecture/DEPLOYMENT.md`, `docs/guides/GETTING_STARTED.md` |
| Deep architecture component docs | `packages/server/src/lib/persistence/schema/*.ts` + component source | `docs/architecture/components/*.md` |
| Operator-only internal APIs | `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/components/RETRIEVAL.md` |
| Repository layout | `docs/reference/REPO_STRUCTURE.md` | `README.md`, `docs/README.md`, `docs/guides/CODE_GUIDE.md` |

> For the full cross-cutting documentation truth matrix (covering CI, deployment, testing, guardrails, and schema ownership), see [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md).

## Rules

1. **Authoritative source wins.** When secondary docs conflict with the authoritative source, update the secondary doc.
2. **`store_snapshot` is a compatibility layer.** It is no longer the PG primary read path for identity/audit domains (Round 10 Phase 3 completed migration), but it is still used as a compatibility layer for unmigrated domains and on certain startup paths (e.g. candidate recovery). See `docs/reference/DATA_MODEL.md`.
3. **Route/business logic reads current aggregate state from `repos`, not from snapshot compatibility data.** The canonical data-access boundary for server business logic is `app.skillShareer.repos`. Actor lookup (user handles, membership levels) uses `packages/server/src/lib/actors/lookup.ts` backed by `repos.user` and `repos.membership`. Core business routes (auth, knowledge, traps, retrieval) must use `repos.*` for reads and writes.
4. **`store.snapshot()` / `store.transact()` usage is restricted to an explicit allowlist.** The guard test at `packages/server/src/__tests__/snapshot-usage-guard.test.ts` enforces this. Allowed categories:
   - **Repository implementations** (`lib/*/repository.ts`): wrap store as compatibility layer by design
   - **Migration/backfill scripts** (`lib/persistence/migrate-*.ts`, `backfill-*.ts`): one-off data migration
   - **Bootstrap files** (`bootstrap/*.ts`): startup wiring and recovery
   - **Lifecycle subscribers** (`lib/lifecycle/subscribers/*.ts`): event-driven side effects
   - **Candidate processing** (`lib/candidates/processor.ts`, `lib/candidates/services/*.ts`): pipeline mutations
   - **Operations/admin routes** (`routes/operations/*.ts`, `routes/admin-*.ts`, `routes/decay.ts`, `routes/maintenance.ts`, etc.): diagnostic and migration HTTP tools
   - **Remaining migration targets** (`lib/knowledge/application-service.ts`, `lib/retrieval/read-model.ts`): tracked for future migration. `read-model.ts` now owns a bounded derived cache, but its conflict/remediation assembly still reads from compatibility snapshot input.
5. All pull requests that touch architecture or persistence docs must verify consistency against this table.

## CI Guards

Two automated guards enforce these rules on every PR. They run as the `architecture-guardrails` job in CI and can be run locally. For the full cross-cutting documentation truth matrix, see [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md).

### Doc Drift Guard

```bash
pnpm check:docs-drift
```

Checks that key documentation files contain required phrases and do not contain stale or banned phrases. Rules are defined in `scripts/complexity-budgets.json` under `docRules`.

Current rules:
- `docs/guides/CODE_GUIDE.md` must contain `buildServer()` and must NOT contain `createApp()`
- `docs/architecture/ARCHITECTURE.md` must contain a reference to `SYSTEM_TRUTH_SOURCES.md`

**To add a new rule:** edit `scripts/complexity-budgets.json` and add an entry to `docRules` with `file`, optional `mustContain`, and optional `mustNotContain` arrays.

### Complexity Budget Guard

```bash
pnpm check:complexity
```

Checks that tracked hotspot files do not exceed their configured line budgets. Rules are defined in `scripts/complexity-budgets.json` under `lineBudgets`.

Current budgets:
| File | Budget | Current |
|---|---|---|
| `packages/server/src/app.ts` | 350 lines | ~307 |
| `packages/server/src/routes/candidates.ts` | 150 lines | ~15 |
| `packages/server/src/lib/persistence/schema.ts` | 200 lines | ~16 |
| `packages/server/src/lib/artifacts/pg-repository.ts` | 250 lines | ~17 |

**To adjust a budget:** edit `scripts/complexity-budgets.json` and update the `maxLines` value for the relevant file. Budgets should be set at a level that triggers a warning before a file becomes unmanageable, not at the current size.

**To add a new tracked file:** add an entry to `lineBudgets` with `file` and `maxLines`.

## Maintenance

When updating truth docs and guardrails together:

1. Update the authoritative source first
2. Update secondary docs listed in [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md)
3. Add or update a doc-drift rule in `scripts/complexity-budgets.json` if the drift class could recur
4. Run `pnpm check:docs-drift` and `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`
