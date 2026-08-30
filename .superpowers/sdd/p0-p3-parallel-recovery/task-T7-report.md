# T7 — P2-Gateway Parity补齐（宿主侧） — Report

**Status:** DONE
**Branch:** `pre` (no branch switch, parallel tranche Batch 2)
**Task:** T7 `p0-p3-parallel-recovery.md:70-75` — Gateway Parity补齐（宿主侧）
**Owner files (exclusive):** `packages/host-local/src/nest/**` (`app.module.ts`, `gateway/*`, `config/*`, `runtime/*`), `packages/host-distributed/src/gateway/**`, `packages/host-distributed/src/config/service-config.ts`, `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` (not needed — kept untouched), `packages/host-distributed/src/gateway/experience-gene-route-defs.test.ts`, `packages/host-local/src/nest/knowledge-read/experience-gene-route-defs.test.ts`, related host tests
**Commit:** `feat(host): wire admin RouteDefs and close gateway parity gaps` (HEAD at report generation)
**Base:** `30cac2db chore(eval-ci): gate eval:smoke and experience-gene in CI` / `main tip 1c723ee`
**Dependencies:** T2 done (`packages/contracts/src/domain/admin.ts` + `enum-types/admin.ts` → `adminReviewQueueQuerySchema`, `adminActivityQuerySchema`, `adminArtifactQuerySchema`, `adminGraphQuerySchema`), T6 done (`89a8f24e feat(admin-routes): implement real admin RouteDefs in service owners` → `createGovernanceAdminRouteDefs`, `createKnowledgeAdminRouteDefs`, `createKnowledgeAdminGraphRouteDefs`, each `create<X>RouteDefs(deps)` factory, reuse T2 Zod).

## Summary

Wired T6's service-owned `create<X>RouteDefs` admin factories into both hosts via the sanctioned `RouteDef` factory path (`createNestAdapter` / `registerFastifyRoutes` consuming the same factory, no hand-written duplicate routes). Closed the two documented parity gaps: `GET /v1/knowledge/review-queue` now exists in `host-distributed` (gateway-level forwarding to `governance-review` `GET /api/admin/reviews` via `internal-client`, 401 in guard), `POST /v3/retrieval/search` now exists in `host-local` (gateway-level via shared `knowledgeReadSearchSchema` / `toKnowledgeReadSearchArgs`, same handler as `POST /v1/retrieval/search`). `host-local` now serves `/api/admin/artifacts` (and `/api/admin/artifacts/:id`) through the `KnowledgeWriteModule` Nest adapter (previously provider-only, now `serviceRouteDefsForMonolith(createKnowledgeWriteRouteDefs(port))` with `AuthGuard`), `host-local` `KnowledgeReadModule` + `GovernanceReviewModule` already served their admin graphs/reviews via `serviceRouteDefsForMonolith` (`/api/*` passes filter, `/internal/*` excluded); `AppModule.forRuntime` now injects `artifactReadProjection` / `knowledgeOwner` / `GraphIndex`-backed `getTrapGraph`/`getSkillGraph`/`listGraphDocuments` so those handlers return governed, non-empty results instead of empty fallback. `host-distributed` gateway now exposes the full admin surface (`GET /api/admin/reviews`, `GET /api/admin/reviews/:id`, `GET /api/admin/activity`, `POST /api/admin/reviews/:id/decision`, `GET /api/admin/artifacts`, `GET /api/admin/artifacts/:id`, `GET /api/admin/graph/traps`, `GET /api/admin/graph/skills`, `GET /api/admin/graphs/trap`, `GET /api/admin/graphs/skill`, `GET /api/admin/graphs/skill/:artifactId`) via `internal-client` forwarding (`clients.adminReview` / `adminArtifacts` / `adminGraph` / `reviewQueue`) with `x-trapmap-actor-id` / `x-trapmap-team-id` / `x-trapmap-security-level` / `x-trapmap-subject-type` + trace headers, and `GET /v1/knowledge/review-queue` parity. Verified `pnpm typecheck`, `pnpm exec fallow audit --base HEAD --no-cache` (exit 0, 7 clone groups warn, 1 complexity warn, 180 LOC dup inherited), `pnpm check:route-surface` / `check:docs` / `check:structure` green, `pnpm test:deployment-smoke` (443 tests), `pnpm --filter @trapmap/host-local test --run src/nest/knowledge-read/experience-gene-route-defs.test.ts` (5 tests) and `pnpm --filter @trapmap/host-distributed test --run src/gateway/experience-gene-route-defs.test.ts` (2 tests) green. Updated `packages/host-local/src/nest/gateway/gateway.schemas.test.ts` to expect `POST /v3/retrieval/search`.

## Actions Executed (Task Test plan)

1. **Read plan + file partition:** `docs/superpowers/plans/p0-p3-parallel-recovery.md:70-75` (T7 definition), Global Constraints (shared `RouteDef` factory, `createNestAdapter`/`createFastifyAdapter` consumption, `HOST_LOCAL_RUNTIME` / `HostLocalServices` as truth, `pnpm typecheck` + `fallow audit --base HEAD` + `feat|fix|chore` commit). File partition `packages/host-local/src/nest/**`, `packages/host-distributed/src/gateway/**`, `packages/host-distributed/src/config/service-config.ts`, `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` (if needed), `packages/host-distributed/src/gateway/experience-gene-route-defs.test.ts`, `packages/host-local/src/nest/knowledge-read/experience-gene-route-defs.test.ts` — verified with `codegraph_files`.
2. **Read T6 service routes:** `packages/service-governance-review/src/routes.ts:491-640` (`createGovernanceAdminRouteDefs` 4 routes, `GovernanceReviewRouteDeps` with `knowledgeOwner?: { listByFilter, getById }`, `listReviewEntries?`, `headers` + `adminReviewQueueQuerySchema`/`adminActivityQuerySchema`), `packages/service-knowledge-write/src/routes.ts:454-520` (`createKnowledgeAdminRouteDefs` 2 routes, `KnowledgeWriteRouteDeps` with `artifactReadProjection?: Pick<ArtifactReadProjection, getById|listByFilter|listForRetrieval>`), `packages/service-knowledge-read/src/routes.ts:320-416` (`createKnowledgeAdminGraphRouteDefs` 5 routes, `KnowledgeReadRouteDeps` with `getTrapGraph?`/`getSkillGraph?`/`listGraphDocuments?`/`trapGraph?`/`skillGraph?`, `adminGraphQuerySchema` with `depth`/`search`/`mode`/`artifactId`/`cursor`/`limit`). Confirmed each factory is `create<X>RouteDefs(deps) -> RouteDef[]` and aggregates via `create<X>RouteDefs = [...internal, ...admin]`, reuses T2 Zod + `filterReviewQueueEntries`/`applyReviewQueueQuery`/`isArtifactVisible`/`isGraphNodeVisible` helpers, 401 via `routeResponse(401)` / `InvocationError.unauthorized`.
3. **Read host-local wiring:** `packages/host-local/src/nest/app.module.ts:88-236` (7 modules, `AppModule.forRuntime(runtime)` builds `identityAccessModule`, `knowledgeReadModule`, `knowledgeWriteModule`, `governanceReviewModule`, `candidateIngestionModule`, `jobRuntimeModule`, `cronModule`, `GatewayModule.forRuntime(runtime, { knowledgeRead, candidateIngestion, governanceReview, cron })`), `packages/host-local/src/nest/gateway/gateway.module.ts:42-90` (`GatewayModule.forRuntime(runtime, ports)` builds `experienceGeneDeps` from `runtime.services.experienceGeneSearch` / `experienceGenesMode`, creates `deps: GatewayRouteDeps & experienceGeneDeps`, registers `createNestAdapter([...createGatewayRouteDefs(deps), ...createHostLocalExperienceGeneGatewayDefs(experienceGeneDeps)], deps, { guards: [AuthGuard], context: (req)=>({authContext: req.authContext}) })`), `packages/host-local/src/nest/gateway/gateway.route-defs.ts:103-278` (9 `/v1` routes + `...createCronGatewayRouteDefs(deps)`, `/v1/knowledge/review-queue` already via `buildOwnerReviewQueueProjection(runtime.services.knowledgeOwner, {auth, query})` with `reviewQueueResponseSchema`, `/v1/retrieval/search` via `knowledgeReadSearchSchema` + `toKnowledgeReadSearchArgs`), `packages/host-local/src/nest/gateway/gateway.route-kit.ts:20-52` (`GatewayRouteDeps` = `knowledgeRead|CandidateIngestion|ReviewPort|cron|runtime`, `authContextSchema`, `gatewayRouteDef` helper), `packages/host-local/src/nest/knowledge-read/knowledge-read.module.ts:31-65` (`KnowledgeReadModule.forTesting(port)` → `createNestAdapter(serviceRouteDefsForMonolith(createKnowledgeReadRouteDefs(port)), port, {guards:[AuthGuard]})`), `packages/host-local/src/nest/governance-review/governance-review.module.ts:27-61` (same pattern with `createGovernanceReviewRouteDefs`), `packages/host-local/src/nest/knowledge-write/knowledge-write.module.ts:18-48` (provider-only, no `controllers` — **parity gap** for `/api/admin/artifacts`), `packages/host-local/src/nest/runtime/host-services.ts:65-174` (`HostLocalServices` has `knowledgeOwner`, `artifactReadProjection`, `artifactWriter`, `graphIndex` (`createKnowledgeReadGraphIndexRepository(pool)`), `ownerReadModel` (`createOwnerReadModelProjection({knowledge, artifact, governance})`), `runtime.services.config.experienceGeneMode` etc.), `packages/host-local/src/nest/runtime/host-runtime.ts:49-95` (`retrievalQuery` + `skillLookup` via `createKnowledgeReadOwnerRetrievalServices` + `createRuleIntentRecognition`/`createRuleChannelMerge`), `packages/host-local/src/nest/runtime/monolith-route-defs.ts:26-34` (`serviceRouteDefsForMonolith(routeDefs)` filters `!path.startsWith('/internal/')` — `/api/*` passes). Noted `KnowledgeWriteModule` missing adapter, `GatewayModule` missing `knowledgeWrite` port, `gateway.route-defs.ts` missing `POST /v3/retrieval/search`, `app.module.ts` not injecting `artifactReadProjection` / `knowledgeOwner` / `GraphIndex` into admin deps (handlers would fallback to `[]`).
4. **Read host-distributed wiring:** `packages/host-distributed/src/gateway/routes.ts:18-262` (`registerGatewayRoutes(app, clients, {experienceGenesMode})` adds `registerAuthHook` (401 on missing/invalid `Bearer` via `clients.identityAccess.validateSession`, attaches `actorId`/`actorHandle`/`actorTeamId`/`actorSecurityLevel`), `registerRateLimitHook`, `createExperienceGeneGatewayDeps(clients, mode)` → `searchGenes` via `clients.knowledgeRead.searchGenes` + `x-trapmap-team-id`/`x-trapmap-security-level`, `registerFastifyRoutes(app, [...createGatewayRouteDefs(clients), ...createExperienceGeneRouteDefs(deps).filter(path==='/v1/retrieval/genes/search')], adapterDeps, {context: gatewayActorContext})`, health `/health`/`/live`/`/ready` (breaker `breakerStatesSnapshot`), hand-written `/v1/auth/login` (emits `x-session-token`)), `packages/host-distributed/src/gateway/route-defs.ts:1-1212` (`createGatewayRouteDefs(_clients)` 38+ routes, `/v1` + `/v3/retrieval/search` already both present `searchBodySchema` → `clients.knowledgeRead.search`, `createTeam` etc. via `clients.identityAccess`, `knowledgeRead`/`knowledgeWrite`/`candidateIngestion`/`review`/`governanceReview`/`feedbackAdmin`/`jobRuntime`/`cronScheduler`, `gatewayActorContext` extracts `actorId`/`handle`/`securityLevel`/`teamId`, `forward` via `routeResponse`, `trustedActorHeaders`/`trustedArtifactImportHeaders` + `trustedActorOptions`/`trustedArtifactImportOptions`, `bodyWithoutActor` strip, `requireTrustedActor` 401/403), `packages/host-distributed/src/gateway/internal-client.ts:1-1181` (`callInternalService` with `CircuitBreaker` + `withResilience` (retry `GET` only on 502/503/504, `resolveRetryPolicy`/`resolveBreakerThreshold`/`resolveBreakerCooldownMs`), `callInternalServiceOnce` with `x-request-id` + `traceparent` + OTel span, `createInternalServiceClients(urls, resolver)` builds `identityAccess`, `knowledgeRead` (with `searchGenes` + `geneSearchResponseSchema`), `knowledgeWrite`, `candidateIngestion`, `review`, `governanceReview` (+ `getRetrievalProjection`/`reactivateRemediation`/`exportBadcaseDraft`), `feedbackAdmin`, `jobRuntime`, `cronScheduler`), `packages/host-distributed/src/config/service-config.ts:1-446` (`loadServiceConfig(serviceName)` with `DEFAULT_PORTS`/`DEFAULT_INTERNAL_HOSTS`/`DISTRIBUTED_INTERNAL_HOSTS`, `resolveServiceDiscoveryMode` via `TRAPMAP_DEPLOYMENT_PROFILE`, `resolveInternalTimeoutMs`, `assertDistributedResilienceConfig`), `packages/host-distributed/src/shared/internal-knowledge-write-client.ts:1-138` (remote `KnowledgeWritePort` via `clients.knowledgeWrite.invoke` or `http` with `mapRemoteError`/`unwrapResponse`/`unwrapRpcResult`). Noted `host-distributed` missing `GET /v1/knowledge/review-queue` (only `host-local` had it), missing all 11 admin `GET|POST /api/admin/*` gateway-level forwards (internal services already expose them via T6, but gateway did not mount), `internal-client` missing `adminReview`/`adminArtifacts`/`adminGraph`/`reviewQueue` clients.
5. **Host-local: close `POST /v3/retrieval/search` parity** — `packages/host-local/src/nest/gateway/gateway.route-defs.ts:129-143`: duplicated `POST /v1/retrieval/search` handler as `POST /v3/retrieval/search` with same `knowledgeReadSearchSchema` + `toKnowledgeReadSearchArgs` (shared factory, trivial parity, no new contract). This makes `host-local` match `host-distributed` `route-defs.ts:845-852` (`POST /v3/retrieval/search` already there) and satisfies `docs/reference/api-surface.md:120` `POST /v3/retrieval/search` row + `docs/archived/architecture/API.md` + `apps/cli` `search-gene --v3` surface. Updated `packages/host-local/src/nest/gateway/gateway.schemas.test.ts:57-74` to expect `POST /v3/retrieval/search` in `createGatewayRouteDefs` list (previously 15 routes, now 16, test was failing with `+ "POST /v3/retrieval/search"` diff).
6. **Host-local: wire `KnowledgeWriteModule` admin** — `packages/host-local/src/nest/knowledge-write/knowledge-write.module.ts:1-73`: Added `createNestAdapter` + `createKnowledgeWriteRouteDefs` + `AuthGuard` + `serviceRouteDefsForMonolith` imports, refactored `forDeps`/`forTesting` to share `private static options(port)` (mirrors `KnowledgeReadModule`/`GovernanceReviewModule` pattern, eliminates 22-line dup that `fallow audit` flagged `dup:837574f2`), now returns `{ module, controllers: [createNestAdapter(serviceRouteDefsForMonolith(createKnowledgeWriteRouteDefs(port)), port, {guards:[AuthGuard]})], providers, exports, global:true }`. Previously provider-only, so `/api/admin/artifacts` (and `:id`) never mounted on monolith public port; now mounted, `serviceRouteDefsForMonolith` keeps `/api/admin/*` (filters only `/internal/*`), `AuthGuard` keeps 401 in guard layer.
7. **Host-local: inject admin deps in `AppModule.forRuntime`** — `packages/host-local/src/nest/app.module.ts:102-173`:
    - `knowledgeReadPort`: was `const knowledgeReadPort = createKnowledgeReadModule(knowledgeReadDeps)` + `KnowledgeReadModule.forTesting(knowledgeReadPort)`; now `knowledgeReadPortBase` + `Object.assign(knowledgeReadPortBase, { getTrapGraph: async (query)=>{ docs=await graphIndex.listAll(); sourceDocs= artifactId? filter sourceId : filter sourceType trap; return { nodes: flatMap doc.nodes->{id,label,kind,severity,teamId,requiredLevel,scope}, edges: flatMap doc.edges->{id,source:sourceNodeId,target:targetNodeId,kind:relationType,label:evidence} } }, getSkillGraph: same but skill, listGraphDocuments: async ()=> docs.map(doc=>({nodes: doc.nodes.map(n=>({id:n.id,label:n.label,kind:n.kind})), edges: doc.edges.map(e=>({id:e.id,source:e.sourceNodeId,target:e.targetNodeId})), teamId: doc.teamId, requiredLevel: doc.requiredLevel, artifactId: doc.sourceId})) })` injected via `runtime.services.graphIndex.listAll()` (existing `GraphIndexRepositoryPort`). This satisfies `KnowledgeReadRouteDeps`'s `getTrapGraph?`/`getSkillGraph?`/`listGraphDocuments?` probes (`fetchTrapGraph`/`fetchSkillGraph` check `getTrapGraph` first, then `trapGraph`/`skillGraph`, then `listGraphDocuments`), lets `filterGraphByQuery` apply governance (`teamId`/`requiredLevel` via `isGraphNodeVisible`) + `search`/`mode`/`depth` correctly, instead of empty fallback.
    - `knowledgeWritePort`: was `createKnowledgeWriteDeps({ knowledgeOwner, auditLog })`; now `createKnowledgeWriteDeps({ knowledgeOwner, auditLog, artifactReadProjection: runtime.services.artifactReadProjection, artifactWriter: runtime.services.artifactWriter })` (reuse existing `ArtifactReadProjection` + `ArtifactWritePort` from `host-services.ts:88/165`), plus `Object.assign(knowledgeWritePortBase, { artifactReadProjection: runtime.services.artifactReadProjection })` so `KnowledgeWriteRouteDeps`'s `fetchAllArtifacts` via `artifactReadProjection.listByFilter` + `isArtifactVisible` (team/securityLevel) works instead of empty fallback. This also covers `getArtifact` via `artifactReadProjection.getById`.
    - `governanceReviewPort`: was `const governanceReviewPort = createGovernanceReviewServiceModule(createGovernanceReviewDeps({...}))` + `GovernanceReviewModule.forTesting(governanceReviewPort)`; now `governanceReviewPortBase` + `Object.assign(governanceReviewPortBase, { knowledgeOwner: runtime.services.knowledgeOwner, artifactReadProjection: runtime.services.artifactReadProjection })` so `GovernanceReviewRouteDeps`'s `fetchAllReviewEntries`/`fetchReviewEntryById` via `knowledgeOwner.listByFilter`/`getById` + `filterReviewQueueEntries`/`isReviewQueueEntryVisible` (team/securityLevel) work, instead of empty.
    - Kept `knowledgeWritePort` creation before `governanceReviewPort` so `governanceAdmin`'s `knowledgeWrite: knowledgeWritePort` still wired (order matters for `createGovernanceReviewAdminModule`).
8. **Host-distributed: add `internal-client` admin forwarding** — `packages/host-distributed/src/gateway/internal-client.ts:541-565` added `adminReview`, `adminArtifacts`, `adminGraph`, `reviewQueue` to `InternalServiceClients` interface (`listReviews(query, options)` → `GET /api/admin/reviews`, `getReview`, `listActivity`, `decideReview` → `POST /api/admin/reviews/:id/decision`, `adminArtifacts.list/getById` → `GET /api/admin/artifacts`, `adminGraph.getTrapGraph/getSkillGraph/getSkillGraphById` → `GET /api/admin/graph/traps`/`/api/admin/graph/skills`/`/api/admin/graphs/skill/:artifactId`, `reviewQueue.list` → `GET /api/admin/reviews` for `/v1/knowledge/review-queue` parity). `1127-1212` implemented each via `callInternalService(`${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews`, 'GET', undefined, query, options)` etc., reusing existing `callInternalService` (breaker + retry + `withEnvTimeout` + `x-request-id`/`traceparent` + OTel span). This mirrors `experience-gene` pattern (`createExperienceGeneGatewayDeps` → `clients.knowledgeRead.searchGenes` + headers) — gateway owns auth, forwards via trusted headers.
9. **Host-distributed: add gateway `RouteDef`s** — `packages/host-distributed/src/gateway/route-defs.ts:13-23` imported `adminActivityQuerySchema`/`adminArtifactQuerySchema`/`adminGraphQuerySchema`/`adminReviewQueueQuerySchema` from `@trapmap/contracts` (T2 Zod, single source). `467-536` added `adminReviewQueueSchema`, `adminReviewDetailSchema`, `adminActivitySchema`, `adminReviewDecisionSchema`, `adminArtifactListSchema`, `adminArtifactDetailSchema`, `adminTrapGraphSchema`, `adminSkillGraphSchema`, `adminSkillGraphByIdSchema`, `reviewQueueSchema` (each `z.object({ params, query: <T2 schema> || record, headers: headersSchema, actor: actorSchema, body: z.unknown() })` with strict T2 validation, `actorSchema` required so `requireTrustedActor` 401/403 stays in handler, `headersSchema` required for `x-trapmap-actor-id` forwarding). `1120-1143` added `trustedAdminHeaders`/`trustedAdminOptions` helper: `trustedArtifactImportHeaders(ctx) ?? {}` plus `x-trapmap-subject-type: system-admin` when `actor.handle|id === 'system-admin'` (covers `getGovernanceAuth`/`getArtifactAuth`/`getGraphAuth` subject-type branching; otherwise defaults to `user`). `1172-1340` added 13 `gatewayRouteDef` entries before `// ---- Job routes`:
    - `GET /v1/knowledge/review-queue` → `reviewQueueSchema`, `requireTrustedActor`, `forward(clients.reviewQueue.list(queryStringValues(ctx.query), trustedAdminOptions(ctx)))` (parity gap close, forwards to `governance-review` `GET /api/admin/reviews`).
    - `GET /api/admin/reviews` → `adminReviewQueueSchema`, `forward(clients.adminReview.listReviews(...))`.
    - `GET /api/admin/reviews/:id` → `adminReviewDetailSchema`, `forward(clients.adminReview.getReview(ctx.params.id, ...))`.
    - `GET /api/admin/activity` → `adminActivitySchema`, `forward(clients.adminReview.listActivity(...))`.
    - `POST /api/admin/reviews/:id/decision` → `adminReviewDecisionSchema`, `forward(clients.adminReview.decideReview(ctx.params.id, bodyWithoutActor(ctx.body), ...))`.
    - `GET /api/admin/artifacts` → `adminArtifactListSchema`, `forward(clients.adminArtifacts.list(...))`.
    - `GET /api/admin/artifacts/:id` → `adminArtifactDetailSchema`, `forward(clients.adminArtifacts.getById(...))`.
    - `GET /api/admin/graph/traps` → `adminTrapGraphSchema`, `forward(clients.adminGraph.getTrapGraph(...))`.
    - `GET /api/admin/graph/skills` → `adminSkillGraphSchema`, `forward(...)`.
    - `GET /api/admin/graphs/trap` (alias) → same.
    - `GET /api/admin/graphs/skill` (alias) → same.
    - `GET /api/admin/graphs/skill/:artifactId` → `adminSkillGraphByIdSchema`, `query = {...queryStringValues(ctx.query), artifactId: ctx.params.artifactId}`, `forward(clients.adminGraph.getSkillGraphById(...))`.
    - All use `queryStringValues(ctx.query)` (array→comma, undefined→omit, else String) for `query` param serialization, `trustedAdminOptions` for headers (actor + team/securityLevel + trace), `bodyWithoutActor` for `POST` to strip spoofed `actorId` (then `requireTrustedActor` enforces match).
10. **Host-distributed: keep `routes.ts` wiring** — `packages/host-distributed/src/gateway/routes.ts:183-192` already does `registerFastifyRoutes(app, [...createGatewayRouteDefs(clients), ...createExperienceGeneRouteDefs(deps).filter(...)], adapterDeps, {context: gatewayActorContext})` — adding admin `RouteDef`s to `createGatewayRouteDefs` automatically makes them part of `registerGatewayRoutes` without editing `routes.ts` (task allowed `routes.ts` or `assembly` edit, but none needed beyond `route-defs.ts` + `internal-client.ts`). Verified `experience-gene` tri-state still via `createExperienceGeneGatewayDeps` (off/shadow return disabled envelope without hop, serve forwards with `x-trapmap-team-id`/`x-trapmap-security-level`).
11. **Config:** `packages/host-distributed/src/config/service-config.ts` already exposes `experienceGeneMode`/`experienceGenesMode` via `TRAPMAP_EXPERIENCE_GENE_MODE`/`TRAPMAP_EXPERIENCE_GENES_MODE` (`resolveExperienceGeneMode`/`resolveExperienceGenesMode`), `assertDistributedResilienceConfig` covers `TRAPMAP_INTERNAL_*` / `TRAPMAP_GATEWAY_RATE_LIMIT_*` — no new admin config needed (gateway-level, forwards to existing owner services), kept untouched to satisfy `T3 SURFACE_INVENTORY_DRIFT` handling (admin paths are `/api/admin/*`, not `/v1|/v2|/v3`, so `scripts/check-route-surface.ts:95 VERSIONED_PATH_RE` exempts them from `api-surface.md` drift; `GET /v1/knowledge/review-queue` already documented in `docs/reference/api-surface.md:79`, `POST /v3/retrieval/search` already documented `api-surface.md:120` and in `REAL_ROUTE_FILES`).
12. **Tests & verification:**
    - `pnpm --filter @trapmap/host-local test --run src/nest/knowledge-read/experience-gene-route-defs.test.ts` → `✓ 5 passed` (tri-state off/shadow disabled without `searchGenes`, serve forwards).
    - `pnpm --filter @trapmap/host-distributed test --run src/gateway/experience-gene-route-defs.test.ts` → `✓ 2 passed` (off/shadow disabled without hop, serve forwards with `x-trapmap-team-id`/`security-level`).
    - `pnpm --filter @trapmap/host-local test --run src/nest/gateway/gateway.schemas.test.ts` → updated expectation includes `POST /v3/retrieval/search` → `✓ 3 passed` (previously `1 failed` diff `+ "POST /v3/retrieval/search"`).
    - `pnpm --filter @trapmap/host-local test --run src/nest/gateway` → `✓ 13 passed` (10 `gateway.route-defs.test` + 3 `gateway.schemas.test`).
    - Service admin tests (T6, unchanged): `pnpm --filter @trapmap/service-governance-review test --run src/routes.test.ts` → `✓ 38 passed`, `service-knowledge-write` → `✓ 34 passed`, `service-knowledge-read` → `✓ 36 passed` (all `fastify`+`nest` adapters, 401/400/pagination/governance).
    - Manual `host-distributed` gateway parity smoke via `Fastify.inject` (created `test-admin-parity.ts` with `registerGatewayRoutes` + mocked `clients.adminReview`/`adminArtifacts`/`adminGraph`/`reviewQueue` + `validateSession`): `GET /v1/knowledge/review-queue` 401→200, `GET /api/admin/reviews` 401→200, `GET /api/admin/artifacts` 401→200, `GET /api/admin/graph/traps` 401→200, `POST /v3/retrieval/search` 401 (auth required, same as `/v1/retrieval/search`) — all as expected, then removed temp file.
    - `pnpm test:deployment-smoke` → `✓ 443 passed` (50 files: `host-local` 17 `consul.service.test`, `host-distributed` 32 `routes.test` + 21 `internal-client.test` + 3 `distributed-runtime-closeout` etc.).
    - `pnpm typecheck` → `tsc -b --pretty false` `exit 0`.
    - `pnpm exec fallow audit --base HEAD --no-cache` → `Audit scope: 7 changed files vs HEAD (30cac2db..HEAD)` `■ Metrics: dead code 0 · complexity 1 (warn, max 10) · duplication 7` `dup:837574f2` (now fixed via `options` helper, 8→7 groups) `dup:b6c0c2a7`/`dup:9b871068`/`dup:7441c364`/`dup:0d41d08a`/`dup:ddf6e2a1`/`dup:36aa460a`/`dup:95e2523a` (6 inherited, 1 from new admin graph aliases 11-line `getTrapGraph`/`getSkillGraph` / `trap`/`skill` aliases — warn, not gate) `● High complexity forwardedTraceHeaders 10 cyclomatic` (inherited) `✓ complexity: 1 finding · duplication: 7 clone groups (warn) · 7 changed files (0.47s)` `audit gate excluded 5 inherited findings` `exit 0`. Final after `KnowledgeWriteModule.options` refactor: `180 LOC dup (7→)` not `224`.
    - `pnpm exec tsx scripts/check-route-surface.ts` → `[route-surface] documented gateway routes match host RouteDefs.` ( `REAL_ROUTE_FILES` includes `packages/host-local/src/nest/gateway/gateway.route-defs.ts` + `packages/host-distributed/src/gateway/route-defs.ts` — both now have `/v3/retrieval/search` and `/v1/knowledge/review-queue` + `/api/admin/*` exempt via `VERSIONED_PATH_RE`).
    - `pnpm check:docs` → `route-surface PASS`, `doc-truth PASS`, `doc-references WARN (non-blocking)`, `links WARN` — blocking tiers green.
    - `pnpm check:structure` → `structure-guard PASS`, `arch-freeze PASS`, `stale-package-refs PASS`.
13. **Commit & report:** `git add` 6 files (`host-local/src/nest/gateway/gateway.route-defs.ts`, `gateway.schemas.test.ts`, `knowledge-write/knowledge-write.module.ts`, `app.module.ts`, `host-distributed/src/gateway/route-defs.ts`, `internal-client.ts`) → `git commit -m "feat(host): wire admin RouteDefs and close gateway parity gaps"` (hooks: `biome format`, `check:asserts` 0 naked, `check:docs` passed). Wrote this report to `.superpowers/sdd/p0-p3-parallel-recovery/task-T7-report.md`.

## Test Commands & Outputs

### `pnpm --filter @trapmap/host-local test --run src/nest/knowledge-read/experience-gene-route-defs.test.ts` (baseline)

```
 ✓ |host-local| src/nest/knowledge-read/experience-gene-route-defs.test.ts (5 tests) 67ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### `pnpm --filter @trapmap/host-distributed test --run src/gateway/experience-gene-route-defs.test.ts`

```
 ✓ |host-distributed| src/gateway/experience-gene-route-defs.test.ts (2 tests) 50ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### `pnpm --filter @trapmap/host-local test --run src/nest/gateway/gateway.schemas.test.ts` (after v3 parity fix)

```
 ✓ |host-local| src/nest/gateway/gateway.schemas.test.ts (3 tests) 5ms
 (before fix: 1 failed   × gateway route defs > exposes the documented /v1 knowledge, candidate and cron surface
   expected [...] to deeply equal [...]  + "POST /v3/retrieval/search")
```

### `pnpm --filter @trapmap/service-governance-review test --run src/routes.test.ts` (T6, unchanged)

```
 ✓ |service-governance-review| src/routes.test.ts (38 tests) 179ms
```

### `pnpm --filter @trapmap/service-knowledge-write test --run src/routes.test.ts`

```
 ✓ |service-knowledge-write| src/routes.test.ts (34 tests) 150ms
```

### `pnpm --filter @trapmap/service-knowledge-read test --run src/routes.test.ts`

```
 ✓ |service-knowledge-read| src/routes.test.ts (36 tests) 144ms
```

### Manual `host-distributed` parity smoke (Fastify.inject via `registerGatewayRoutes`)

```
review-queue no auth: 401
review-queue with auth: 200
admin reviews no auth: 401
admin reviews with auth: 200
admin artifacts no auth: 401
admin artifacts with auth: 200
graph traps no auth: 401
graph traps with auth: 200
v3 search no auth (should be 401): 401
DONE
```

### `pnpm test:deployment-smoke` (excerpt)

```
 ✓ |host-local| src/nest/gateway/gateway.schemas.test.ts (3 tests) 5ms
 ✓ |host-local| src/nest/gateway/gateway.route-defs.test.ts (10 tests) 110ms
 ✓ |host-local| src/nest/app.test.ts (8 tests) 157ms
 ✓ |host-distributed| src/gateway/routes.test.ts (32 tests) 197ms
 ✓ |host-distributed| src/gateway/internal-client.test.ts (21 tests) 58ms
 ...
 Test Files  50 passed (50)
      Tests  443 passed (443)
```

### `pnpm typecheck`

```
> trapmap@0.1.0 typecheck
> tsc -b --pretty false
EXIT 0
```

### `pnpm exec fallow audit --base HEAD --no-cache` (final after `KnowledgeWriteModule.options` refactor)

```
loaded config: /home/wunai/Disks/Data/my-project/Trap-Map/.fallowrc.json
Audit scope: 7 changed files vs HEAD (30cac2db..HEAD)
── Duplication ────────────────────────────────────
 note: module wiring excluded from clone detection (--no-ignore-imports to include it)
 ■ Metrics: dead code 0 · complexity 1 (warn, max cyclomatic: 10) · duplication 7
 ● Duplicates (7 clone groups)
      19 lines  b6c0c2a7  host-distributed/gateway/route-defs.ts ↔ service-identity-access/routes.ts
      18 lines  9b871068  route-defs.ts ↔ service-job-runtime/routes.ts
      15 lines  7441c364  route-defs.ts:499-513 ↔ 536-550 (pre-existing)
      11 lines  0d41d08a  route-defs.ts:1253-1263 ↔ 1275-1285 (new admin graph trap alias)
      11 lines  ddf6e2a1  route-defs.ts:1264-1274 ↔ 1286-1296 (new admin graph skill alias)
      11 lines  36aa460a  cron.module.test.ts ↔ gateway.schemas.test.ts (pre-existing)
       9 lines  95e2523a  route-defs.ts ↔ service-identity-access/routes.ts (pre-existing)
 ● Clone families 2, 28-37 lines (inherited)
 ✗ 180 lines (0.1%) duplicated across 5 files
 ── Complexity ─────────────────────────────────────
 ● High complexity forwardedTraceHeaders: 10 cyclomatic (inherited)
 ✗ 1 above threshold · 238 analyzed
 ✓ complexity: 1 finding · duplication: 7 clone groups (warn) · 7 changed files (0.47s)
   audit gate excluded 5 inherited findings (run with --gate all to enforce)
 exit:0
```

(Before `options` refactor: 8 groups, 224 lines, `dup:837574f2` 22 lines `knowledge-write.module.ts:25-46 ↔ 50-71`.)

### `pnpm exec tsx scripts/check-route-surface.ts`

```
[route-surface] documented gateway routes match host RouteDefs.
```

### `git diff --stat HEAD` (staged for commit)

```
 packages/host-distributed/src/gateway/internal-client.ts          |  89 ++++++
 packages/host-distributed/src/gateway/route-defs.ts               | 163 ++++++++++
 packages/host-local/src/nest/app.module.ts                        | 105 ++++++-
 packages/host-local/src/nest/gateway/gateway.route-defs.ts        |  14 +-
 packages/host-local/src/nest/gateway/gateway.schemas.test.ts      |   1 +
 packages/host-local/src/nest/knowledge-write/knowledge-write.module.ts | 55 +++-
 6 files changed, 413 insertions(+), 14 deletions(-)
```

## Files Changed (exclusive partition verified)

- `packages/host-local/src/nest/gateway/gateway.route-defs.ts` — added `POST /v3/retrieval/search` (same `knowledgeReadSearchSchema` + `toKnowledgeReadSearchArgs` handler as `POST /v1/retrieval/search`) for `v3` parity (matches `host-distributed` `route-defs.ts:845-852` and `docs/reference/api-surface.md:120`).
- `packages/host-local/src/nest/gateway/gateway.schemas.test.ts` — updated `createGatewayRouteDefs` expectation to include `POST /v3/retrieval/search` (15→16 routes).
- `packages/host-local/src/nest/knowledge-write/knowledge-write.module.ts` — now mounts `serviceRouteDefsForMonolith(createKnowledgeWriteRouteDefs(port))` via `createNestAdapter` with `AuthGuard` in both `forDeps`/`forTesting` (shared `options(port)` helper, previously provider-only, so `GET /api/admin/artifacts` + `GET /api/admin/artifacts/:id` never mounted; now they are, `serviceRouteDefsForMonolith` keeps `/api/*`).
- `packages/host-local/src/nest/app.module.ts` — inject `artifactReadProjection`/`artifactWriter` into `createKnowledgeWriteDeps`, `Object.assign(knowledgeWritePort,{artifactReadProjection})`, `Object.assign(governanceReviewPort,{knowledgeOwner, artifactReadProjection})`, `Object.assign(knowledgeReadPort,{getTrapGraph,getSkillGraph,listGraphDocuments})` via `runtime.services.graphIndex.listAll()` mapping to `AdminGraphResponse` (nodes `{id,label,kind,severity,teamId,requiredLevel,scope}`, edges `{id,source:sourceNodeId,target:targetNodeId,kind:relationType,label:evidence}`) with `artifactId` scoping, so admin handlers return governed results not empty fallback.
- `packages/host-distributed/src/gateway/internal-client.ts` — added `adminReview`/`adminArtifacts`/`adminGraph`/`reviewQueue` to `InternalServiceClients` (8 methods) and implementations via `callInternalService(`${await baseUrl('governance-review', urls.governanceReview)}/api/admin/...`, 'GET|POST', undefined, query, options)` etc., mirroring `experience-gene` pattern (breaker+retry+env timeout+`x-request-id`/`traceparent`/`otel`).
- `packages/host-distributed/src/gateway/route-defs.ts` — imported `adminActivityQuerySchema`/`adminArtifactQuerySchema`/`adminGraphQuerySchema`/`adminReviewQueueQuerySchema` (T2 Zod), added 10 admin `RouteDef` schemas (`adminReviewQueueSchema`, `adminReviewDetailSchema`, `adminActivitySchema`, `adminReviewDecisionSchema`, `adminArtifactListSchema`, `adminArtifactDetailSchema`, `adminTrapGraphSchema`, `adminSkillGraphSchema`, `adminSkillGraphByIdSchema`, `reviewQueueSchema`) + `trustedAdminHeaders`/`trustedAdminOptions` (extends `trustedArtifactImportHeaders` + `x-trapmap-subject-type: system-admin`), added 13 `gatewayRouteDef` entries: `GET /v1/knowledge/review-queue` (parity) + 12 `GET|POST /api/admin/{reviews,reviews/:id,activity,reviews/:id/decision,artifacts,artifacts/:id,graph/traps,graph/skills,graphs/trap,graphs/skill,graphs/skill/:artifactId}` each `requireTrustedActor` → `forward(clients.<admin>(queryStringValues(ctx.query) or bodyWithoutActor, trustedAdminOptions))`.
- **Not touched (per partition):** `packages/contracts` (import only, T2 done), `docs/reference/api-surface` (versioned only, `/api/admin/*` exempt via `VERSIONED_PATH_RE`, `GET /v1/knowledge/review-queue` already documented, `POST /v3/retrieval/search` already documented + in `REAL_ROUTE_FILES`), `service-*` routes (import only, T6 done — `createGovernanceAdminRouteDefs` etc. not edited), `web-panel`, `eval CI`, `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` (kept, not needed for gateway-level forwarding).
- **Not touched beyond partition but kept:** `packages/host-distributed/src/config/service-config.ts` (no new admin config needed; `TRAPMAP_EXPERIENCE_GENE_MODE`/`TRAPMAP_EXPERIENCE_GENES_MODE` already, admin gateway-level not configurable, `assertDistributedResilienceConfig` covers `TRAPMAP_INTERNAL_*`).

## Concerns / Residual

- **Fallow duplication (7 groups warn, not gate):** New admin graph alias routes (`GET /api/admin/graph/traps` ↔ `GET /api/admin/graphs/trap`, `GET /api/admin/graph/skills` ↔ `GET /api/admin/graphs/skill`/`skill/:artifactId`) are 11-line identical `requireTrustedActor` + `forward(clients.adminGraph.*(queryStringValues, trustedAdminOptions))` blocks (clone families 3×11). They are intentionally separate `RouteDef`s so `route-surface` sees distinct paths (like `v1`/`v3` search duplicate). Extracting a helper `forwardGraph(query)` would reduce to 1 line but `fallow` still sees the `gatewayRouteDef({ method, path, schema, handler })` boilerplate as dup; file-level `// fallow-ignore-file code-duplication` could suppress, but kept as `warn` to preserve per-route `schema` visibility (each uses distinct `adminTrapGraphSchema`/`adminSkillGraphSchema`/`adminSkillGraphByIdSchema`). Inherited dups `b6c0c2a7`/`95e2523a` (`service-identity-access/routes.ts`) and `9b871068` (`service-job-runtime/routes.ts`) and `7441c364` (`candidateResolution`/`candidateManualResult` schemas) are pre-existing, excluded by gate. `KnowledgeWriteModule` dup fixed via `options` helper.
- **Graph parity `depth`/`mode` no-op:** `host-local` `getTrapGraph`/`getSkillGraph` return all `sourceType` trap/skill nodes/edges (mapped from `GraphIndexDocumentRecord`), `service-knowledge-read` `filterGraphByQuery` handles `depth` (slice 10/50) + `search` (filter `id|label|kind`) + `mode` passthrough + governance `teamId`/`requiredLevel` (`isGraphNodeVisible`). If `artifactId` query should scope to single artifact, `get*Graph` already filters `doc.sourceId === artifactId`; otherwise full. Pagination via `listGraphDocuments` slice not needed because handler does slice. Future PG `GraphIndex` may need to push `search`/`depth` into SQL, but current `listAll` is fine for closeout (graph size small, `host-services.test.ts` mocks `listAll`).
- **Review-queue parity shape:** `host-local` `GET /v1/knowledge/review-queue` returns `reviewQueueResponseSchema` (`{ items, nextCursor, filteredTotal, total }` where `items` are `ReviewQueueItem` via `buildOwnerReviewQueueProjection` (governed, sorted)), `host-distributed` `GET /v1/knowledge/review-queue` forwards to `governance-review` `GET /api/admin/reviews` (which returns `{ items, nextCursor, filteredTotal, total }` via `applyReviewQueueQuery` + `toReviewQueueItem`). Shapes are compatible (`items` both `ReviewQueueItem`), but field names identical, so clients can use either path. Task's `(or /api/admin/reviews)` alternative satisfied either way; now both paths exist in both hosts (local via `GatewayModule` + `GovernanceReviewModule`, distributed via new gateway `RouteDef`).
- **`check:route-surface` `/api/admin/*` exemption:** `scripts/check-route-surface.ts:95 VERSIONED_PATH_RE = /\/(?:v1|v2|v3)\/[A-Za-z0-9_:./{}-]+/g` only collects `/v1|/v2|/v3` paths, so 12 new `/api/admin/*` routes never enter `real` vs `documented` comparison; `REAL_ROUTE_FILES` already includes both gateway `route-defs.ts` files, so `/v3/retrieval/search` is checked (now present in both), `GET /v1/knowledge/review-queue` already in `DOCUMENTED_ROUTE_FILES` (`api-surface.md:79`) and now in both `REAL_ROUTE_FILES` (host-local `gateway.route-defs.ts:232`, host-distributed `route-defs.ts:1172`), so `check:route-surface` passes without updating `SURFACE_INVENTORY_DRIFT` (still 30 entries, `SURFACE_EXEMPTIONS` only `/v2/retrieval/search`). No `docs/reference/api-surface.md` edit needed (T3 already reconciled, task `Otherwise update … remove v2 promise` not triggered because we implemented parity).
- **No `host-distributed/src/config/service-config.ts` change:** Admin surface is gateway-level, owner services already expose it (T6), gateway just forwards — no new `TRAPMAP_SERVICE_*_URL` needed beyond existing `TRAPMAP_GOVERNANCE_REVIEW_URL`/`TRAPMAP_KNOWLEDGE_WRITE_URL`/`TRAPMAP_KNOWLEDGE_READ_URL`. If future admin needs `TRAPMAP_ADMIN_*` flag, T3's `SURFACE_INVENTORY_DRIFT` handling would track it, but closeout prefers no new env (host-local uses `runtime.services.*` directly, distributed uses existing `internalUrls`).

## Return Status

**DONE** — `host-local` now serves `POST /v3/retrieval/search` (parity) + `GET /api/admin/artifacts` via `KnowledgeWriteModule` Nest adapter + governed `GET /api/admin/reviews|activity|graph/*` via injected `knowledgeOwner`/`artifactReadProjection`/`GraphIndex`; `host-distributed` now serves `GET /v1/knowledge/review-queue` + 12 `GET|POST /api/admin/*` via `internal-client` forwarding (same `create<X>RouteDefs` factory, `AuthGuard` 401 + `trustedAdminHeaders` + `x-trapmap-*` + `queryStringValues`); both hosts share the same `T6` `RouteDef` factories (`createNestAdapter`/`registerFastifyRoutes`), no host hand-written business logic, `pnpm typecheck` + `pnpm test:deployment-smoke` (443) + experience-gene tri-state (5+2) + `fallow audit --base HEAD` (exit 0) + `check:route-surface`/`check:docs`/`check:structure` green, commit `feat(host): wire admin RouteDefs and close gateway parity gaps` on branch `pre`.

---
*Generated: 2026-08-30, branch `pre`, pnpm 10.33.0, node v24.16.0, T2 base `6c086bb8`, T6 base `89a8f24e`, audit via `fallow audit --base HEAD`*
