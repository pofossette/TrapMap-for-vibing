# Repository Structure

This document is the authoritative source for TrapMap repository layout.

## Root

The root directory is for stable entry points and workspace configuration.

Allowed root Markdown files:

- `AGENTS.md`
- `CLAUDE.md`
- `CHANGELOG.md`
- `README.md`
- `architecture.md`
- `plan.md`

Historical plans, temporary notes, audits, and human-authored reports must live under `docs/archived/`.

## Product Packages

- `packages/cli/`: Commander CLI and CLI tests.
- `packages/server/`: Fastify compatibility shell and shared runtime/status seam. It no longer serves as any default `light` host entry or local rollback host.
- `packages/contracts/`: shared Zod schemas and TypeScript types.
- `packages/skills/`: project-level Skill artifacts.
- `packages/client-core/`: Browser-compatible shared gateway transport layer (HTTP SDK, session contract, error model). Used by CLI and future web panel.
- `packages/web-panel/`: Browser-based administrator operations panel. It remains a gateway-only client surface.
- `packages/backend-core/`: Host-agnostic backend core kernel (runtime capability model, port interfaces, use-case patterns, bounded-context modules, invocation model). Phase 2 keeps it framework-free and reorganizes each bounded context into internal `domain/application/module` seams under `src/identity-access/`, `src/knowledge-read/`, `src/knowledge-write/`, `src/candidate-ingestion/`, `src/governance-review/`, `src/job-runtime/`; the old `src/modules/*.ts` compatibility facade has been removed, and consumers use the package root or context entrypoints. Used by all hosts.
- `packages/runtime-infra/`: Shared runtime infrastructure seam for store/repo assembly, async transport wiring, AI provider bootstrap, adapter registry bootstrap, and in-memory graph-query bootstrap reused by hosts while these foundations are still shared.
- `packages/service-identity-access/`: Owns identity-access service assembly, internal route registration, and bounded-context auth/session/team/member/access-key wiring.
- `packages/service-knowledge-read/`: Knowledge-read service assembly. Owns retrieval, read-model, and projection-status route wiring.
- `packages/service-knowledge-write/`: Owns knowledge-write service assembly, internal route registration, and bounded-context write wiring for knowledge/trap/skill/lifecycle/maintenance/decay.
- `packages/service-governance-review/`: Owns governance-review service assembly, internal route registration, and bounded-context review/feedback wiring while delegating lifecycle mutations to knowledge-write.
- `packages/service-candidate-ingestion/`: Owns candidate-ingestion service assembly, internal route registration, and bounded-context candidate wiring while delegating result publication to knowledge-write.
- `packages/service-job-runtime/`: Owns job-runtime service assembly, internal route registration, queue/runtime deps wiring, and runtime server bootstrap surface.
- `packages/host-local/`: Light host assembly for `local-agent` and `team-monolith`. The frozen default light mainline is `src/nest/**`, exposed through the package default entry (`src/index.ts`) and default `dev` / `start` scripts.
  `packages/host-local/src/nest/adapters/` is the authoritative placement for host-owned port adapter selection (`in-process` vs `remote`) in the light host. These files are adapter seams for internal ports, not repository adapters and not a catch-all directory for host composition.
  `packages/runtime-infra/src/shared-infra.ts` is the authoritative placement for the current transitional shared infrastructure seam that borrows server-owned infra helpers without changing host ownership.
- `packages/host-distributed/`: Heavy host assembly for the `distributed` profile. It is the real heavy-host implementation, consumes the same backend-core/service-package main implementation as `light`, and its maturity baseline remains `Level 2 / transitional-microservice`.
  `packages/host-distributed/src/gateway/` is the authoritative placement for gateway transport helpers and forwarding seams, including `internal-client.ts` as the thin internal HTTP / canonical error normalization helper.
  `packages/host-distributed/src/config/service-config.ts` is the authoritative placement for service discovery defaults and URL resolver seams. It owns the profile-aware mapping between explicit `TRAPMAP_*_URL` overrides, Docker DNS defaults in `distributed`, and `localhost` defaults in local/dev contexts.
  `packages/host-distributed/src/shared/` is the authoritative placement for shared distributed-host wrappers around internal ports, such as `internal-knowledge-write-client.ts`; these wrappers map transport semantics back to backend-core port semantics and are not repository adapters.

## Documentation

- `docs/guides/`: onboarding and contributor workflows.
- `docs/operations/`: runtime, CI, security, testing, deployment-adjacent operations.
- `docs/architecture/`: architecture overview and component docs.
- `docs/reference/`: truth sources, schemas, glossary, API surface, and repository structure.
- `docs/plans/`: historical design references and only active again when a current root plan explicitly re-links them. They are not parallel active execution surfaces by default.
- `docs/todos/`: pending work plus the phase detail docs linked from the current root `plan.md`. Under the current remediation root, only the linked detail doc is active; other todo docs remain background or deferred references.
- `docs/archived/`: obsolete plans, historical reports, and retired decisions.
- `docs/superpowers/`: plans and specs generated by Superpowers workflows.

## Evaluations

- `evals/retrieval/`: retrieval datasets, scenarios, runner, metrics, and reports.
- `evals/summary/`: summary datasets, scenarios, judge logic, runner, and reports.
- `evals/graph-extraction/`: graph extraction, conflict, and dedup evals.
- `evals/ingestion/`: Skill ingestion fixtures and runner.
- `evals/fixtures/`: shared trap fixtures.

## Generated Or Local-Only Directories

These directories are local artifacts and must not become tracked content:

- `.data/`
- `.tmp/`
- `coverage/`
- `logs/`
- `node_modules/`
- `reports/`
- `packages/*/dist/`
- `packages/*/node_modules/`

## Archive Policy

`docs/archived/` is the only archive root for human-authored historical material. Do not create `docs/archive/`.

- Obsolete implementation plans: `docs/archived/archived-plans/`
- Historical audits and reports: `docs/archived/reports/`
- Retired standalone docs: `docs/archived/`

The root `reports/` directory is reserved for generated evaluation JSON and similar local outputs. Do not put narrative docs or archived Markdown reports there.
