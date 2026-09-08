# 持久化层

> 真源：`packages/db/src/schema/`（42 表）。完整表清单见 [docs/reference/DATABASE_SCHEMA.md](../../reference/DATABASE_SCHEMA.md)，你用 `pnpm check:table-schema` 验证。PostgreSQL 是主要且权威的生产存储后端。状态：Active。

## 决策

- 权威：PostgreSQL 16 + pgvector。你所有业务主事实只放结构化表，不新增 JSON 文件主路径。
- 迁移：空库 baseline 建立当前 schema；各 service 以 owner-local 迁移脚本演进（`packages/service-*/src/migrations.ts`），`packages/db/src/schema/index.ts` 聚合全表供 `check:table-schema` 校验。
- 索引：向量 `HNSW`、全文 `tsvector + GIN`、低频字段 `jsonb + GIN / 函数索引`。

## 42 表分布

42 表分属各 owner，逐表清单只在 [数据库表清单](../../reference/DATABASE_SCHEMA.md) 中维护，本页不复述。真源是 `packages/db/src/schema/`，你用 `pnpm check:table-schema` 验证。

> 详细用途与主键见 [数据库表清单](../../reference/DATABASE_SCHEMA.md)。`skill_artifacts` / `artifact_revisions` 上的 JSONB 为兼容缓存，结构化子表为事实源。

## 索引策略

- 向量：`knowledge_embeddings`、`skill_artifact_capsule_embeddings`、`experience_gene_embeddings` 用 `pgvector HNSW`。
- 全文：`knowledge_search_documents.search_vector`（`tsvector`）+ GIN；`tokens text[]` + GIN。
- 低频合并：`candidates.analysis`、`candidate_duplicate_cases.matches` 等用 `jsonb + GIN / 函数索引`。
- 队列出队：`task_queue` 按 `status + process_after + priority + created_at` 谓词，`ORDER BY … LIMIT 1 FOR UPDATE SKIP LOCKED`，无单独 `pending_dequeue` 索引。

## 事务与一致性

- 候选创建与 `task_queue` 入队在同一 DB 事务内原子提交。
- 知识生命周期变更与 `domain_event_outbox` 写入同事务。
- `task_queue` / `domain_event_outbox` 携带 lease（`workerId/startedAt/heartbeatAt/leaseUntil`），过期可回收为待处理。
- 启动按 `repositories → candidate-recovery → workers → graph-reconciliation → lifecycle` 顺序执行，见 [TrapMap 架构](../ARCHITECTURE.md)。

## Repository 形态

各上下文经 Port + Repository 访问 PG：写侧各 owner 实现各自表的 PG repository；读侧 `service-knowledge-read` 只组装读模型，不回写覆盖写侧投影；`InMemory*Repository` 只用于单元与集成测试，不做生产回退。

## 常见用法

### 你校验表镜像

前置条件：依赖已装；活库比对需 PG 可达。

```bash
pnpm check:table-schema
```

真源是 `packages/db/src/schema/`，聚合入口在 `packages/db/src/schema/index.ts`。

### 你本地起 PG

前置条件：Docker 可用。

```bash
docker compose up -d postgres
```

### 你查队列出队谓词

前置条件：离线可跑。

```bash
grep -n "SKIP LOCKED" packages/db/src/schema/queue.ts
```

出队语义见本页「索引策略」节。
