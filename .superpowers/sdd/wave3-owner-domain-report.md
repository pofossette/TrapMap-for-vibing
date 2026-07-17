# Wave-3 Owner-Domain Report

## Scope

Promoted `CandidateCorpusReadPort` from the candidate service domain into
`@trapmap/contracts`. Candidate duplicate detection now consumes only the
approved corpus port, keeps the team scope supplied by the candidate, and
supports exact, high-overlap, semantic-similar, and no-match outcomes for
both traps and skills. No production source in the candidate owner imports
`@trapmap/server` or `@trapmap/runtime-infra`.

## TDD evidence

- RED: the destination test for a team-isolated semantic corpus match returned
  `duplicateCase: null` before the detector supported semantic matching.
- GREEN: the detector returned a sorted semantic duplicate case and the full
  focused candidate suite passed.

## Verification

- `rtk pnpm --filter @trapmap/service-candidate-ingestion test --run src/domain/fingerprint-and-duplicate.test.ts src/pg-ports.test.ts src/routes.test.ts src/migrations.test.ts` — 30 passed
- `rtk pnpm --filter @trapmap/contracts test --run src/domain/candidates.test.ts` — 31 passed
- `rtk pnpm --filter @trapmap/service-candidate-ingestion typecheck` — passed
- `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts` — 16 passed
- `rtk pnpm typecheck` — passed
- `rtk git diff --check` — passed

## Deferred

Candidate processing/recovery workers, public host API migration, and
removal of server/runtime-infra compatibility implementations remain in the
subsequent Wave-3 packages.
