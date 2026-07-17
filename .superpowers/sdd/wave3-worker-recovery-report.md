# Wave-3 Worker and Recovery Migration Report

## Status

Implemented candidate processing, recovery, and host lifecycle ownership. Legacy `server` and `runtime-infra` compatibility deletion is deliberately deferred to the Wave-3 legacy-removal package.

## RED to GREEN

- Candidate processing/recovery handler did not exist in `service-candidate-ingestion`; destination tests now cover successful processing, processing failure, restart recovery, and dead-letter status handling.
- Candidate submission scheduled the obsolete `candidate-processing` task without retry metadata; the module test exposed the mismatch, and submission now schedules `candidate_processing` with `retryCount: 0`.
- Host-local did not manage candidate processing with the Nest lifecycle; the lifecycle test now verifies start and graceful close.
- Hosts needed an approved-corpus dependency without candidate service reading knowledge tables directly; `service-knowledge-read` now owns and tests the PostgreSQL read adapter.

## Changes

- Added owner-local processing handler/runtime, restart recovery, retry/dead-letter handling, and public exports in `service-candidate-ingestion`.
- Wired distributed and host-local composition to the same processing runtime and PostgreSQL/Rabbit task transport ports.
- Added the `knowledge-read` candidate corpus adapter and injected it into both hosts.

## Verification

- `rtk pnpm --filter @trapmap/service-candidate-ingestion test --run src/processing.test.ts src/domain/fingerprint-and-duplicate.test.ts` — 9 tests passed.
- `rtk pnpm exec vitest run --project service-knowledge-read packages/service-knowledge-read/src/candidate-corpus-pg.test.ts` — 1 test passed.
- `rtk pnpm exec vitest run --project host-local packages/host-local/src/nest/candidate-ingestion/candidate-processing.service.test.ts` — 1 test passed.
- `rtk pnpm exec vitest run --project host-distributed packages/host-distributed/src/candidate-ingestion/routes.test.ts` — 1 test passed.
- `rtk pnpm typecheck`, `rtk git diff --check`, and the candidate service import boundary scan passed.
- `rtk pnpm exec fallow audit --base main --gate new-only --format json --quiet` passed: zero introduced dead-code, boundary, complexity, or duplication findings. One inherited `normalizeManualResult` complexity finding remains in `backend-core`.

## Known Environment Evidence

Ignored generated JavaScript siblings can cause broad Vitest commands to load stale source artifacts. Focused TypeScript project tests and root typecheck above are the authoritative evidence for this package. Legacy server worker/recovery teardown remains outside this package.
