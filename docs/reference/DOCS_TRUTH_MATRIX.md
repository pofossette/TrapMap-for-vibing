# Documentation Truth Matrix

Each documentation topic maps to one authoritative source. When secondary docs conflict, update the secondary doc.

This matrix complements `SYSTEM_TRUTH_SOURCES.md`, which focuses on runtime architecture facts. The matrix below covers cross-cutting documentation topics (CI, deployment, testing, guardrails) that span multiple docs.

| Topic | Authoritative Source | Secondary Docs | Drift Type |
|---|---|---|---|
| Server entry point | `packages/server/src/app.ts` (`buildServer()`) | `docs/guides/CODE_GUIDE.md`, `docs/architecture/ARCHITECTURE.md` | descriptive |
| Startup sequence | `packages/server/src/bootstrap/run-startup-sequence.ts` | `docs/architecture/ARCHITECTURE.md`, `docs/guides/CODE_GUIDE.md` | descriptive |
| Persistence posture | `README.md` + `docs/reference/SYSTEM_TRUTH_SOURCES.md` + `packages/server/src/lib/persistence/schema/*.ts` | `docs/README.md`, `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` | descriptive |
| DB schema | `packages/server/src/lib/persistence/schema/index.ts` (barrel, re-exports all domain table modules) | `docs/reference/DATABASE_SCHEMA.md` | descriptive |
| Schema count | `packages/server/src/lib/persistence/schema/*.ts` (artifacts.ts, knowledge.ts, candidates.ts, auth.ts, retrieval.ts, queue.ts, index.ts) | `docs/reference/DATABASE_SCHEMA.md`, `docs/README.md` | descriptive |
| Persistence migration state | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md` | descriptive |
| Server data-access boundary | `packages/server/src/lib/actors/lookup.ts` (actor lookup), `packages/server/src/lib/repos/index.ts` (`SkillShareerRepos`) | `docs/PACKAGES.md`, `docs/reference/DATA_MODEL.md` | descriptive |
| CI jobs | `.github/workflows/ci.yml` | `docs/operations/CI_CD.md`, `docs/operations/TESTING.md` | descriptive |
| Guardrail commands | `scripts/complexity-budgets.json` + `.github/workflows/ci.yml` | `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` | descriptive |
| Startup commands | `package.json` scripts section | `docs/README.md`, `docs/guides/GETTING_STARTED.md` | descriptive |
| Eval entrypoints | `package.json` scripts section | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` | descriptive |
| Deployment defaults | `docker-compose.yml` + `packages/server/Dockerfile` | `docs/architecture/DEPLOYMENT.md`, `README.md` | descriptive |
| Root workspace commands | `package.json` (scripts section) | `README.md`, `docs/README.md`, `docs/operations/TESTING.md` | descriptive |
| Server-only DB commands | `packages/server/package.json` (db:generate, db:migrate, db:push) | `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` | descriptive |
| Runtime env defaults | `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` | descriptive |
| AI provider/model defaults | `packages/server/src/lib/ai/provider-config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` | descriptive |
| Eval workflow | `.github/workflows/eval.yml` | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` | descriptive |
| Deep architecture persistence docs | `packages/server/src/lib/persistence/schema/*.ts` | `docs/architecture/components/PERSISTENCE.md`, `docs/reference/DATABASE_SCHEMA.md` | descriptive |
| Health/readiness endpoints | `packages/server/src/app.ts` (`/health`, `/ready`, `/meta/routes`) | `docs/architecture/DEPLOYMENT.md`, `docs/guides/GETTING_STARTED.md` | descriptive |
| Deep architecture component docs | `packages/server/src/lib/persistence/schema/*.ts` + component source | `docs/architecture/components/*.md` | descriptive |
| Operator-only internal APIs | `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/components/RETRIEVAL.md` | resolved-internal |

## Rules

1. **Authoritative source wins.** When secondary docs conflict with the authoritative source, update the secondary doc.
2. This matrix is the single place to look up which file owns a given documentation topic.
3. Pull requests that touch architecture, CI, deployment, or persistence docs must verify consistency against this matrix.
4. When adding a new documentation topic, add a row here first, then update the secondary docs.

## Relationship to SYSTEM_TRUTH_SOURCES.md

`SYSTEM_TRUTH_SOURCES.md` governs runtime architecture facts (entry points, data-access boundaries, persistence layer). This matrix extends that governance to cross-cutting documentation topics (CI, deployment, testing, guardrails, schema ownership).

Both files are authoritative. For topics that appear in both tables, the same authoritative source applies.
