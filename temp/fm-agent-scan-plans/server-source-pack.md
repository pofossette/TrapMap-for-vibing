# Server Source Pack — fm-agent raw report → current source mapping

Generated from raw report snapshot with 391 confirmed findings. Many are stale — HEAD has moved significantly past the snapshot.

## Hotspot Buckets

| Bucket | Raw count | Status notes |
|---|---|---|
| `lib/retrieval/capsules` | 31 | Capsule-native retrieval landed in Phase 7; most likely stale |
| `lib/persistence/schema` | 24 | Schema evolved through multiple Drizzle migrations; most likely stale |
| `lib/retrieval/recall` | 19 | PG keyword + semantic recall landed; most likely stale |
| `lib/artifacts/pg-repository` | 16 | Dual-table (JSONB + structured) pattern; several may be stale |
| `lib/indexing/graph-lite` | 15 | Graph-lite indexing in place; most likely stale |
| `lib/indexing/adapters` | 13 | Adapter registry built; most likely stale |

## Priority Raw Detail Files

| raw id | detail md path | current source file | current test file | doc to open first |
|---|---|---|---|---|
| app-ts--addHook_1 | /home/wunai/Downloads/fm-agent-raw-reports/server/app-ts--addHook_1.md | packages/server/src/app.ts:262-274 | packages/server/src/app.test.ts (NEW) | docs/architecture/API.md |
| app-ts--buildServer | /home/wunai/Downloads/fm-agent-raw-reports/server/app-ts--buildServer.md | packages/server/src/app.ts:113-307 | packages/server/src/bootstrap/startup.test.ts | docs/architecture/API.md |
| app-ts--Fastify | /home/wunai/Downloads/fm-agent-raw-reports/server/app-ts--Fastify.md | packages/server/src/app.ts:131-138 | packages/server/src/bootstrap/startup.test.ts | docs/architecture/API.md |
| app-ts--decorate | /home/wunai/Downloads/fm-agent-raw-reports/server/app-ts--decorate.md | packages/server/src/app.ts:171-231 | packages/server/src/app.test.ts (NEW) | docs/architecture/API.md |
| bootstrap--bootstrap-candidate-recovery-ts--bootstrapCandidateRecovery | /home/wunai/Downloads/fm-agent-raw-reports/server/bootstrap--bootstrap-candidate-recovery-ts--bootstrapCandidateRecovery.md | packages/server/src/bootstrap/bootstrap-candidate-recovery.ts:60-79 | packages/server/src/bootstrap/startup.test.ts | docs/PACKAGES.md |
| bootstrap--bootstrap-lifecycle-ts--bootstrapLifecycle | /home/wunai/Downloads/fm-agent-raw-reports/server/bootstrap--bootstrap-lifecycle-ts--bootstrapLifecycle.md | packages/server/src/bootstrap/bootstrap-lifecycle.ts:31-35 | packages/server/src/bootstrap/startup.test.ts | docs/PACKAGES.md |
| bootstrap--bootstrap-repositories-ts--bootstrapRepositories | /home/wunai/Downloads/fm-agent-raw-reports/server/bootstrap--bootstrap-repositories-ts--bootstrapRepositories.md | packages/server/src/bootstrap/bootstrap-repositories.ts:43-51 | packages/server/src/bootstrap/startup.test.ts | docs/PACKAGES.md |
| config-ts--loadConfig | /home/wunai/Downloads/fm-agent-raw-reports/server/config-ts--loadConfig.md | packages/server/src/config.ts:101-106 | packages/server/src/config.test.ts (check if exists) | docs/operations/ENVIRONMENT.md |
| lib--ai--dynamic--context-resolver-ts--getMcpServerStatus | /home/wunai/Downloads/fm-agent-raw-reports/server/lib--ai--dynamic--context-resolver-ts--getMcpServerStatus.md | packages/server/src/lib/ai/dynamic/context-resolver.ts:66-69 | packages/server/src/lib/ai/dynamic/context-resolver.test.ts | docs/architecture/components/AI_PROVIDER.md |
| lib--ai--provider-config-ts--loadAiProviderConfig | /home/wunai/Downloads/fm-agent-raw-reports/server/lib--ai--provider-config-ts--loadAiProviderConfig.md | packages/server/src/lib/ai/provider-config.ts:135-138 | packages/server/src/lib/ai/provider-config.test.ts | docs/architecture/components/AI_PROVIDER.md |
| lib--artifacts--pg-repository--index-ts--updateLifecycle | /home/wunai/Downloads/fm-agent-raw-reports/server/lib--artifacts--pg-repository--index-ts--updateLifecycle.md | packages/server/src/lib/artifacts/pg-repository/index.ts:224-278 | packages/server/src/lib/artifacts/pg-repository/index.test.ts | docs/PACKAGES.md |
| lib--lifecycle--subscribers--audit-ts--info | /home/wunai/Downloads/fm-agent-raw-reports/server/lib--lifecycle--subscribers--audit-ts--info.md | packages/server/src/lib/lifecycle/subscribers/audit.ts:9-26 | (none — covered by lifecycle integration tests) | docs/architecture/components/GOVERNANCE.md |
| index-ts--start | /home/wunai/Downloads/fm-agent-raw-reports/server/index-ts--start.md | packages/server/src/index.ts | packages/server/src/index.test.ts | docs/PACKAGES.md |

## Sample from Hotspot Raw Detail Files

| raw id (sampled) | detail md path | current source file | status guess |
|---|---|---|---|
| lib--retrieval--capsules--capsule-recall-ts--buildMatchReason | .../capsule-recall-ts--buildMatchReason.md | packages/server/src/lib/retrieval/capsules/capsule-recall.ts | likely stale (Phase 7 landed) |
| lib--retrieval--capsules--scoring--merge-ts--mergeCapsuleCandidates | .../scoring--merge-ts--mergeCapsuleCandidates.md | packages/server/src/lib/retrieval/capsules/scoring/merge.ts | likely stale (Phase 4 merge landed) |
| lib--retrieval--capsules--scoring--rerank-ts--buildMultiChannelReason | .../scoring--rerank-ts--buildMultiChannelReason.md | packages/server/src/lib/retrieval/capsules/scoring/rerank.ts | likely stale |
| lib--retrieval--capsules--channels--semantic-ts--createCapsuleSemanticChannel | .../channels--semantic-ts--createCapsuleSemanticChannel.md | packages/server/src/lib/retrieval/capsules/channels/semantic.ts | likely stale |
| lib--retrieval--capsules--repositories--index-sync-ts--createCapsuleIndexSync | .../index-sync-ts--createCapsuleIndexSync.md | packages/server/src/lib/retrieval/capsules/repositories/index-sync.ts | likely stale (Phase 6 landed) |
| lib--persistence--schema--artifacts-ts--ensureCapsuleVectorIndex | .../schema--artifacts-ts--ensureCapsuleVectorIndex.md | packages/server/src/lib/persistence/schema/artifacts.ts | likely stale (Phase 6 landed) |
| lib--persistence--schema--knowledge-ts--ensureVectorIndex | .../schema--knowledge-ts--ensureVectorIndex.md | packages/server/src/lib/persistence/schema/knowledge.ts | likely stale (vector index ensured) |
| lib--retrieval--recall--keyword-ts--recall | .../recall--keyword-ts--recall.md | packages/server/src/lib/retrieval/recall/keyword.ts | likely stale (keyword channel active) |
| lib--retrieval--recall--semantic-ts--recall | .../recall--semantic-ts--recall.md | packages/server/src/lib/retrieval/recall/semantic.ts | likely stale (semantic channel active) |
| lib--retrieval--recall--pg-keyword-ts--createPgKeywordRecall | .../pg-keyword-ts--createPgKeywordRecall.md | packages/server/src/lib/retrieval/recall/pg-keyword.ts | likely stale (PG keyword landed) |
| lib--indexing--graph-lite--documents-ts--buildSkillGraphDocument | .../graph-lite--documents-ts--buildSkillGraphDocument.md | packages/server/src/lib/indexing/graph-lite/documents.ts | likely stale (graph-lite in place) |
| lib--indexing--graph-lite--graphology-ts--buildGraphFromDocuments | .../graph-lite--graphology-ts--buildGraphFromDocuments.md | packages/server/src/lib/indexing/graph-lite/graphology.ts | likely stale |
