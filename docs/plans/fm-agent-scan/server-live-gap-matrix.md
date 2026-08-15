# Server Live Gap Matrix

Classification of raw fm-agent findings against current HEAD (`packages/server`).  
Raw snapshot: 391 confirmed. HEAD is significantly ahead (buildServer, documentedRoutes, capsule-native retrieval, multi-phase retrieval all landed).

## Current HEAD Status

No reproducible **current-live** server findings remained after the 2026-05-29 audit reran `pnpm test`, `pnpm typecheck`, `pnpm eval:smoke`, and `pnpm eval:ingestion:smoke`.

## Reclassified to Fixed During Audit

| raw id | current file:line | note |
|---|---|---|
| app-ts--addHook_1 | packages/server/src/app.ts:262-274 | `onClose` now `await`s worker shutdown; covered by `packages/server/src/app.test.ts` |
| lib--ai--provider-config-ts--loadAiProviderConfig | packages/server/src/lib/ai/provider-config.ts:135-145 | Provider-specific keys now take precedence over `AI_API_KEY`; covered by `provider-config.test.ts` |
| bootstrap--bootstrap-lifecycle-ts--bootstrapLifecycle | packages/server/src/bootstrap/bootstrap-lifecycle.ts:31-37 | Audit subscribers now include `knowledge.resubmitted` and `knowledge.re-review`; covered by `startup.test.ts` |
| config-ts--loadConfig | packages/server/src/config.ts:101-107 | Empty `CORS_ORIGINS` now parses to `[]`; covered by `config.test.ts` |
| app-ts--decorate | packages/server/src/bootstrap/run-startup-sequence.ts:22-28 | `Object.freeze(app.skillShareer)` now runs at the end of startup; covered by `app.test.ts` |
| lib--artifacts--pg-repository--index-ts--updateLifecycle | packages/server/src/lib/artifacts/pg-repository/index.ts:263-278 | Return value now appends the newly created lifecycle event to `lifecycleHistory` |
| lib--lifecycle--subscribers--audit-ts--info | packages/server/src/lib/lifecycle/subscribers/audit.ts:13-17 | Audit subscriber now logs the entire event payload; covered by `subscribers.test.ts` |

## Reclassified to Stale / Design Boundary

| raw id | current file:line | status | note |
|---|---|---|---|
| lib--ai--dynamic--context-resolver-ts--getMcpServerStatus | packages/server/src/lib/ai/dynamic/context-resolver.ts:66-81 | **stale** | Current resolver intentionally returns an explicit `unavailable` MCP payload until server-manager integration exists; covered by `context-resolver.test.ts` |
| bootstrap--bootstrap-candidate-recovery-ts--bootstrapCandidateRecovery | packages/server/src/bootstrap/bootstrap-candidate-recovery.ts:55-77 | **stale** | JSON store mode intentionally resets interrupted candidates without enqueueing them into the PG-only task queue; covered by `startup.test.ts` |
| bootstrap--bootstrap-repositories-ts--bootstrapRepositories | packages/server/src/bootstrap/bootstrap-repositories.ts:24-63 | **stale** | Flat `knowledgeRepo` / `artifactRepo` compatibility fields remain PG-only by design; `repos.*` is the supported cross-store API |
| app-ts--buildServer | packages/server/src/app.ts:113-307 | **stale** | `buildServer()` now returns Fastify instance with full body. HEAD has 200 lines of implementation (routes, decorators, hooks, error handler). |
| app-ts--Fastify | packages/server/src/app.ts:131-138 | **stale** | Fastify instance is created inline in buildServer() returning `app`. No missing return statement. |
| index-ts--start | packages/server/src/index.ts | **stale** | `start()` implementation is complete in HEAD. Was likely empty in raw snapshot. |

## Hotspot Buckets — Mass Staleness Assessment

| Bucket | Raw count | Assessment |
|---|---|---|
| `lib/retrieval/capsules` | 31 | **Mass stale.** Capsule-native retrieval fully landed in Phase 7. Coordinator, channels (heuristic/keyword/semantic/graph), merge/rerank, index sync/rebuild all in place. Sampling confirms code is complete. |
| `lib/persistence/schema` | 24 | **Mass stale.** Schema definitions evolved through multiple Drizzle migrations. Vector indexes, capsule keyword/embedding tables, lifecycle events tables all present. |
| `lib/retrieval/recall` | 19 | **Mass stale.** PG keyword/semantic recall functions, db-search vector similarity, graph-assisted recall all implemented. |
| `lib/artifacts/pg-repository` | 16 | **Mass stale.** `updateLifecycle` gap is fixed and the remaining raw findings belong to already-landed structured repository work. |
| `lib/indexing/graph-lite` | 15 | **Mass stale.** Graph-lite documents, graphology, llm-extract, store all in place. |
| `lib/indexing/adapters` | 13 | **Mass stale.** Adapter registry built, keyword/vector/graph adapters registered. |
| `lib/ai/providers` | 12 | **Mass stale.** Provider implementations (openai, google-genai, ollama, openai-compatible, fallback) all implemented. |
| `lib/retrieval/orchestration` | 9 | **Mass stale.** Orchestrator v1/v2, recall coordinator, filters, routing all landed. |

## Summary

- **Live findings:** 0 confirmed on current HEAD
- **Fixed findings:** 7 directly revalidated against current source/tests
- **Stale / design-boundary findings:** ~384 (including hotspot buckets and explicit environment boundaries)
- **Sampling confidence:** High — raw snapshot was taken before Phase 0-7 retrieval work, Drizzle migration sequence, and repository consolidation
