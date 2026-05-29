# Server Live Gap Matrix

Classification of raw fm-agent findings against current HEAD (`packages/server`).  
Raw snapshot: 391 confirmed. HEAD is significantly ahead (buildServer, documentedRoutes, capsule-native retrieval, multi-phase retrieval all landed).

## Live Findings

| raw id | current file:line | status | note |
|---|---|---|---|
| app-ts--addHook_1 | packages/server/src/app.ts:262-274 | **live** | `onClose` hook calls `taskWorker.stop()` and `outboxWorker.stop()` without `await`. If stop() is async, workers continue running after hook resolves. Verified against HEAD. |
| lib--ai--dynamic--context-resolver-ts--getMcpServerStatus | packages/server/src/lib/ai/dynamic/context-resolver.ts:66-69 | **live** | Returns hardcoded `'[]'`. Comment says "Placeholder — will be wired to the MCP server manager when available." Verified against HEAD. |
| lib--ai--provider-config-ts--loadAiProviderConfig | packages/server/src/lib/ai/provider-config.ts:135-138 | **live** | `AI_API_KEY` takes precedence over `OPENAI_API_KEY` and `GEMINI_API_KEY`. Spec requires provider-specific keys to be preferred. Verified against HEAD. |
| bootstrap--bootstrap-candidate-recovery-ts--bootstrapCandidateRecovery | packages/server/src/bootstrap/bootstrap-candidate-recovery.ts:60-79 | **live** | Enqueue loop (`for...of allInterrupted`) is guarded by `if (isPostgres)`. JSON store candidates are reset but never re-enqueued. Verified against HEAD. |
| bootstrap--bootstrap-lifecycle-ts--bootstrapLifecycle | packages/server/src/bootstrap/bootstrap-lifecycle.ts:31-35 | **live** | Audit subscribers registered for `knowledge.approved`, `deactivated`, `rejected`, `agent-reviewed` — but NOT for `knowledge.resubmitted` or `knowledge.re-review`. Outbox handler map has them (lines 54-66) but direct eventBus subscribers do not. Verified against HEAD. |
| config-ts--loadConfig | packages/server/src/config.ts:101-106 | **live** | When `CORS_ORIGINS=""` (empty string), the falsy check `process.env.CORS_ORIGINS ? ... : undefined` routes to undefined, and Zod's `.default(['*'])` kicks in, returning `["*"]` instead of `[]`. |
| bootstrap--bootstrap-repositories-ts--bootstrapRepositories | packages/server/src/bootstrap/bootstrap-repositories.ts:43-51 | **live** | Legacy flat repo properties (`knowledgeRepo`, `artifactRepo`, etc.) are only assigned when `store instanceof PostgresStore`. Non-PG stores leave them undefined. However, `repos.*` is available for both modes. This may be by design but the spec claims they should be set for all store types. |
| app-ts--decorate | packages/server/src/app.ts:171-231 | **live** | `app.skillShareer` is a mutable object with no `Object.freeze()`. Properties can be added/deleted at runtime. |
| lib--artifacts--pg-repository--index-ts--updateLifecycle | packages/server/src/lib/artifacts/pg-repository/index.ts:224-278 | **live** | `updateLifecycle` updates DB (skill_artifacts + artifact_lifecycle_events) correctly, but does not populate/return in-memory `lifecycleHistory`. The returned artifact record has stale `lifecycleHistory`. |
| lib--lifecycle--subscribers--audit-ts--info | packages/server/src/lib/lifecycle/subscribers/audit.ts:9-26 | **live** | Audit subscriber logs only 7 hardcoded fields from the event. Additional event properties beyond those 7 are silently discarded. |

## Stale Findings (HEAD has addressed)

| raw id | current file:line | status | note |
|---|---|---|---|
| app-ts--buildServer | packages/server/src/app.ts:113-307 | **stale** | `buildServer()` now returns Fastify instance with full body. HEAD has 200 lines of implementation (routes, decorators, hooks, error handler). |
| app-ts--Fastify | packages/server/src/app.ts:131-138 | **stale** | Fastify instance is created inline in buildServer() returning `app`. No missing return statement. |
| index-ts--start | packages/server/src/index.ts | **stale** | `start()` implementation is complete in HEAD. Was likely empty in raw snapshot. |

## Hotspot Buckets — Mass Staleness Assessment

| Bucket | Raw count | Assessment |
|---|---|---|
| `lib/retrieval/capsules` | 31 | **Mass stale.** Capsule-native retrieval fully landed in Phase 7. Coordinator, channels (heuristic/keyword/semantic/graph), merge/rerank, index sync/rebuild all in place. Sampling confirms code is complete. |
| `lib/persistence/schema` | 24 | **Mass stale.** Schema definitions evolved through multiple Drizzle migrations. Vector indexes, capsule keyword/embedding tables, lifecycle events tables all present. |
| `lib/retrieval/recall` | 19 | **Mass stale.** PG keyword/semantic recall functions, db-search vector similarity, graph-assisted recall all implemented. |
| `lib/artifacts/pg-repository` | 16 | **Mixed.** 1 live finding (updateLifecycle). Most others likely stale — structured+JSONB dual-table pattern, revision reader/writer, derived store all landed. |
| `lib/indexing/graph-lite` | 15 | **Mass stale.** Graph-lite documents, graphology, llm-extract, store all in place. |
| `lib/indexing/adapters` | 13 | **Mass stale.** Adapter registry built, keyword/vector/graph adapters registered. |
| `lib/ai/providers` | 12 | **Mass stale.** Provider implementations (openai, google-genai, ollama, openai-compatible, fallback) all implemented. |
| `lib/retrieval/orchestration` | 9 | **Mass stale.** Orchestrator v1/v2, recall coordinator, filters, routing all landed. |

## Summary

- **Live findings:** 10 confirmed
- **Stale findings:** ~381 (vast majority from hotspot buckets)
- **Sampling confidence:** High — raw snapshot was taken before Phase 0-7 retrieval work, Drizzle migration sequence, and repository consolidation
