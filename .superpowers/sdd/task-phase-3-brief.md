# Phase 3 Unified Adapter Boundary Freeze

## Source requirements

Read these first and treat them as the binding requirements:
- `plan.md` Phase 3 / Wave 3A-3C
- `docs/todos/trapmap-architecture-remediation-plan.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/PACKAGES.md`
- `docs/reference/REPO_STRUCTURE.md`
- `docs/operations/TESTING.md`
- `packages/server/src/__tests__/docs-truth-smoke.test.ts` Phase 3 RED test

## Task

Complete Phase 3 as a documentation/truth-source freeze task, not a broad code refactor.

You must:
1. Add a `Phase 3 closure freeze` section to `docs/todos/trapmap-architecture-remediation-plan.md` that closes Wave 3A-3C with explicit facts.
2. Update `docs/reference/SYSTEM_TRUTH_SOURCES.md` with a Phase 3 truth-source row and any necessary rules text.
3. Update `docs/PACKAGES.md` with a dedicated `Phase 3 Unified adapter boundary freeze` section.
4. Update `docs/reference/REPO_STRUCTURE.md` so the adapter/gateway/shared directories have explicit authoritative placement.
5. Update `docs/operations/TESTING.md` with the minimum verification matrix for this Phase 3 freeze.
6. Mark Phase 3 Wave 3A-3C complete in `docs/todos/trapmap-architecture-remediation-plan.md` only if the freeze text and test matrix are in place.
7. Make the new Phase 3 assertions in `packages/server/src/__tests__/docs-truth-smoke.test.ts` pass.

## Required freeze content

The Phase 3 freeze must explicitly state these boundaries:
- Unified adapter scope is about infrastructure/provider seams only; it must NOT become a mega-adapter that mixes repository, application service, gateway client, and host composition.
- `backend-core` owns port contracts and invocation model only; it does not own concrete provider implementations.
- Host-owned adapter selection lives in host assembly, with `packages/host-local/src/nest/adapters/` as the current in-process/remote adapter selection seam for light host.
- `packages/host-distributed/src/gateway/internal-client.ts` is the thin transport helper / canonical error normalization seam for distributed gateway forwarding.
- `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` is an example of remote port client wrapper that maps transport errors back into `InvocationError` / port semantics.
- `packages/server/src/lib/ai/**` and `packages/server/src/lib/indexing/adapters/**` remain server-owned concrete infrastructure/provider implementations in the current phase; Phase 3 freezes taxonomy and owner, not extraction into a new shared workspace package.
- Gateway client and remote adapter are not repository adapters; repository/repo-owned persistence seams stay separate.
- Shared infra borrowed by host-local via `runtime/shared-infra.ts` is transitional shared infrastructure seam, not proof that server is still default host owner.

## Constraints

- Keep edits focused to the files above unless a small adjacent doc update is strictly needed.
- Do not introduce new runtime behavior or broad code refactors.
- Respect the existing Phase 1/2 freeze writing style.
- This repo is shared; do not revert unrelated changes.

## Validation

Run focused checks covering this task:
- `rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`
- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

Record exact commands and results in the report.
