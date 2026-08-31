# Experience Gene Contracts and Storage

## Status

- Owned by [Experience Gene Infrastructure and Pipeline](experience-gene-program-mainline.md).
- Phase order: 2 / 5.

## Goal

将 `ExperienceGene` 定义为跨包共享、可治理、可追溯的一等 derived asset，并提供 PostgreSQL-first 存储投影。

## Non-goals

- 不修改既有 `SkillCapsuleSchema` 语义。
- 不把 GEP execution capsule 直接并入 TrapMap capsule。
- 不允许 Gene 成为 trap/skill 之外的第三个人工提交真相源。

## Public contracts

### Enumerations

新增 `packages/contracts/src/enum-types/experience-gene.ts`:

```ts
export const geneSourceKindSchema = z.enum([
  'trap',
  'skill-artifact',
  'skill-capsule',
]);

export const geneStatusSchema = z.enum([
  'candidate',
  'validated',
  'solidified',
  'stale',
  'deprecated',
]);

export const geneGeneratorKindSchema = z.enum(['rule', 'llm', 'hybrid']);

export const geneIndexStatusSchema = z.enum(['pending', 'ready', 'failed']);

export const geneEventTypeSchema = z.enum([
  'derived',
  'validated',
  'rejected',
  'solidified',
  'staled',
  'deprecated',
  'index-failed',
]);

export const experienceGeneModeSchema = z.enum(['off', 'shadow', 'serve']);
```

类型通过 `packages/contracts/src/index.ts` 聚合导出。

### Gene schema

新增 `packages/contracts/src/domain/experience-gene.ts`。核心字段：

```ts
export const experienceGeneSchema = z.object({
  geneId: entityIdSchema,
  schemaVersion: z.literal('1'),
  status: geneStatusSchema,
  title: z.string().min(1).max(280),
  signalsMatch: z.array(z.string().min(1).max(120)).min(1).max(20),
  summary: z.string().min(1).max(1000),
  strategy: z.array(z.string().min(1).max(500)).min(1).max(7),
  avoid: z.array(z.string().min(1).max(500)).max(7),
  constraints: z.array(z.string().min(1).max(280)).default([]),
  validation: z.array(z.string().min(1).max(280)).default([]),
  labels: z.array(labelSchema).min(1),
  scope: scopeSchema,
  teamId: entityIdSchema.nullable(),
  requiredLevel: securityLevelSchema,
  source: experienceGeneSourceSchema,
  lineage: experienceGeneLineageSchema,
  generator: generatorMetadataSchema,
  indexing: experienceGeneIndexingSchema,
  contentHash: sha256HexSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();
```

`source` 和辅助对象使用 strict schema：

```ts
experienceGeneSourceSchema = {
  kind: geneSourceKindSchema,
  sourceId: entityIdSchema,
  sourceRevision: z.number().int().min(1),
  sourceHash: sha256HexSchema,
  artifactId: entityIdSchema.nullable(),
  capsuleId: entityIdSchema.nullable(),
  artifactRevision: z.number().int().min(1).nullable(),
};

experienceGeneLineageSchema = {
  derivationUnitId: z.string().min(1).max(160),
  parentEventId: entityIdSchema.nullable(),
  promptVersion: z.string().min(1).max(80),
  priorGeneHash: sha256HexSchema.nullable(),
};

generatorMetadataSchema = {
  kind: geneGeneratorKindSchema,
  model: z.string().min(1).max(160).nullable(),
  promptVersion: z.string().min(1).max(80),
};

experienceGeneIndexingSchema = {
  status: geneIndexStatusSchema,
  lastError: z.string().min(1).max(500).nullable(),
  updatedAt: isoTimestampSchema,
};
```

`source.kind === 'skill-capsule'` 时额外要求 `artifactId/capsuleId/artifactRevision`；`skill-artifact` 时同样必须填 `artifactId/artifactRevision`，其中 `sourceId` 是 deterministic derivation unit id，不是裸 artifact id。trap 的这两个 artifact 字段为 `null`。lineage 不允许缺失字段；未知历史可显式为 `null`。

### Content hash

Gene content hash 使用 `sha256(canonicalJsonStringify(value))`，输入只包含：

`schemaVersion,title,signalsMatch,summary,strategy,avoid,constraints,validation,labels,scope,teamId,requiredLevel,source,lineage.derivationUnitId,generator`

不包含 `geneId/status/indexing/createdAt/updatedAt/parentEventId/priorGeneHash`。hash helper 必须有相同语义、不同 key insertion order 的测试。

### Event and task payloads

新增 `experienceGeneEventSchema`：event id、type、geneId、source ref、actor/system identity、validator summary、reason class、payload snapshot hash 和 ISO time。rejected candidate 的完整 validator report 存 event payload；aggregate 当前状态不保存 rejected row。

派生 task payload schema 包含 request id、source ref、derivation unit id、generator kind、prompt version 和 bounded snapshot hash。outbox/task event names 冻结为：

- task: `experience-gene.derive`;
- outbox: `experience-gene.solidified`, `experience-gene.staled`, `experience-gene.deprecated`.

## Persistence design

表定义放在 `packages/db/src/schema/experience-genes.ts`；knowledge-write 是 migration owner，直接消费 shared persistence schema 并在 owner migration test 中冻结关键列/index。不在 service 内复制 Drizzle 表定义。

| 表 | 职责 |
|---|---|
| `experience_genes` | Gene aggregate 当前状态、内容、治理和 source lineage |
| `experience_gene_embeddings` | index status ready 的 Gene content hash 到 384 维 pgvector 的投影 |
| `experience_gene_search_documents` | index status ready 的 keyword/tsvector 投影 |
| `experience_gene_events` | immutable derive/validate/reject/solidify/stale/deprecate events |

必填列包括 `id/schema_version/status/title/signals_match/summary/strategy/avoid/constraints/validation/labels/scope/team_id/required_level/source_type/source_id/source_revision/source_hash/artifact_id/capsule_id/artifact_revision/derivation_unit_id/idempotency_key/content_hash/parent_event_id/prior_gene_hash/generator_kind/generator_model/prompt_version/index_status/index_last_error/created_at/updated_at`。数组字段使用 JSONB；events 使用 append-only 写入。embedding 表另含 `gene_id/content_hash/embedding/embedding_model_version`；首版固定 `text-embedding-384-v1` 这一类逻辑版本标识，禁止混用不同维度或模型。

索引与幂等约束：

- idempotency key 为 `sha256(canonicalJsonStringify({sourceType,sourceId,sourceRevision,sourceHash,derivationUnitId,generatorKind,promptVersion,contentHash}))`，存储在显式 `idempotency_key` 列。
- unique index：`(idempotency_key) WHERE status IN ('candidate','validated','solidified')`。stale/deprecated 后允许同键重建新 Gene。
- 所有 Gene rows 都保留 `scope/team_id/required_level` 副本，read path 不得 join 真相源后才补治理边界。

索引与约束：

- HNSW index：`(vector vector_cosine_ops)`。
- GIN index：search document。
- lifecycle query index：`(status, updated_at)`。
- 跨上下文历史保留 source ID + revision/hash，不建立破坏 owner 边界的删除级联。

## Repository contract

新增 `packages/backend-core/src/ports/experience-gene-ports.ts`:

```ts
export interface ExperienceGeneWritePort {
  saveCandidate(gene: ExperienceGene): Promise<ExperienceGene>;
  markValidated(geneId: string, report: ExperienceGeneValidationReport): Promise<ExperienceGene>;
  solidify(geneId: string): Promise<ExperienceGene>;
  markIndexStatus(geneId: string, status: GeneIndexStatus, error?: string): Promise<ExperienceGene>;
  markStale(source: GeneSourceRef): Promise<number>;
  saveRejectedCandidate(event: ExperienceGeneRejectedEvent): Promise<void>;
}

export interface ExperienceGeneReadPort {
  getById(geneId: string, access: ExperienceGeneAccessContext): Promise<ExperienceGene | null>;
  listBySource(source: GeneSourceRef, access: ExperienceGeneAccessContext): Promise<ExperienceGene[]>;
}
```

- write methods 在同一事务更新 aggregate、projection 和 event；solidify 成功后 aggregate `indexing.status` 先落 `ready` 才返回成功。embedding 生成失败时保留 validated 状态并写 `failed`，由 retry 任务转 `ready`。
- read port 只返回调用者有权访问的数据；授权过滤由 route/application layer 注入。
- repository 方法接收显式 governance context；不得依赖调用方事后过滤。

## Implementation checklist

- [x] 新增 enum-types、domain schema、types 和 contracts tests。
- [x] 新增 source/lineage/generator/event/task payload schemas 与 public projection schema。
- [x] 新增 persistence tables、indexes、constraints 和 migration runner registration。
- [x] 新增 write/read ports 与 PG repository implementation。
- [x] 实现 aggregate/projection/event 同事务写入。
- [x] 实现 embedding failure 到 pending/failed/ready index-state transition。
- [x] 更新 database schema truth documentation。

## Test plan

```bash
pnpm --filter @trapmap/contracts test --run src/domain/experience-gene.test.ts
pnpm --filter @trapmap/contracts test --run src/domain/experience-gene-events.test.ts
pnpm --filter @trapmap/service-knowledge-write test --run src/experience-gene-ports.test.ts
pnpm --filter @trapmap/db test --run src/experience-genes.test.ts
pnpm check:table-schema
pnpm check:pgtable-single-source
pnpm typecheck
```

## Rollout and rollback

- 表和 schema 可以先行合入，但 derivation rollout flag 保持 `off` 前应用路径不产生数据；本设计不依赖数据库 trigger 启用业务写入。
- 回滚时保留 append-only events；不得物理删除历史 Gene rows。

## Debt register

- 若后续需要非-384 维 embedding model，新增 embedding model/version 列和重建流程；禁止混用不同模型的 vectors。

## Execution record（2026-08-25）

### 已完成实现

- `@trapmap/contracts` 冻结 Gene/source/lineage/generator/indexing 枚举与 strict schemas；事件 payload 在 `rejected` 类型上强制完整 validator report；派生 task 与三个 outbox event names 已冻结。
- `backend-core/knowledge-write/domain` 提供 canonical content projection、Gene content hash 和 task idempotency key helper；hash 不含 `geneId/status/indexing/createdAt/updatedAt/parentEventId/priorGeneHash`。
- `db` 新增四张 Experience Gene 表；knowledge-write owner migration `0002_experience_genes` 注册 active partial-unique idempotency、governance/lifecycle indexes、HNSW vector index 和 tsvector GIN projection，并同步 Drizzle journal/snapshot。
- backend-core 定义 governance-aware read/write ports；knowledge-write `PgExperienceGeneRepository` 在事务内维护 aggregate、immutable events 和 retrieval projection。candidate/validated/solidified/stale 状态转换、rejected report append-only 写入、pending/failed/ready index transitions 均有 focused coverage。

### 验证证据

```bash
pnpm --filter @trapmap/lib test --run src/canonical-json.test.ts src/canonical-hash.test.ts
# 2 files / 4 tests passed
pnpm --filter @trapmap/contracts test --run src/domain/experience-gene.test.ts src/domain/experience-gene-events.test.ts
# 2 files / 7 tests passed
pnpm --filter @trapmap/backend-core test --run src/knowledge-write/domain/experience-gene-hashing.test.ts src/ports/experience-gene-ports.test.ts
# 2 files / 4 tests passed
pnpm --filter @trapmap/db test --run src/experience-genes.test.ts
# 1 file / 2 tests passed
pnpm --filter @trapmap/service-knowledge-write test --run src/experience-gene-ports.test.ts src/migrations.test.ts
# 2 files / 16 tests passed
pnpm check:table-schema
# db models 69 table(s); DATABASE_SCHEMA.md declares 69 table(s)
pnpm check:pgtable-single-source
# exit 0
pnpm typecheck
# exit 0
pnpm exec fallow audit --base HEAD --no-cache
# verdict pass; 0 introduced dead-code / complexity / boundary findings
```

### 当前边界

- 本阶段不生成 embedding 或对外暴露 HTTP route；`solidify()` 要求调用方先通过 index seam 将两张投影推进到 ready。派生管线、embedding retry worker、RouteDef surface 属于后续阶段。
- `experience_gene_embeddings.embedding_model_version` 已建模逻辑版本隔离；默认模型版本与 rollout flag 在 derivation/retrieval phases 接线时冻结为 `off`。
