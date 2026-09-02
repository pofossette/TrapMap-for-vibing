# Phase 4 — 持久化 Owner-Local

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> 归属：`architecture-remediation-mainline.md` 的 delegated Phase 4。总量 42 表不变，仅归属迁移。

**Goal:** 表定义权下沉至 Owner，`packages/db` 仅聚合，`conflict_relations` 消灭双源，`DATABASE_SCHEMA.md` 节计数与代码一致。

**探针输入:** 清单 #8-15（持久化）

## Scope

- 新建 `packages/service-identity-access/src/schema.ts`（6 表 `users,teams,memberships,sessions,access_keys,audit_events`）
- 新建 `packages/service-knowledge-write/src/schema.ts`（7 表 `knowledge_entries,revisions,submissions,lifecycle_events,labels` 等）
- 新建 `packages/service-knowledge-read/src/schema.ts`（3 表 `knowledge_embeddings,knowledge_search_documents,graph_index_documents` + `experience_gene_embeddings` 投影）
- 新建 `packages/service-candidate-ingestion/src/schema.ts`（4 表 `candidates,duplicate_cases,outcomes,entity_lineage`）
- 新建 `packages/service-governance-review/src/schema.ts`（3 表 `feedback_records,usage_events,conflict_relations`）
- 新建 `packages/service-job-runtime/src/schema.ts`（3 表 `task_queue,domain_event_outbox,workflow_runs`）
- 改 `packages/db/src/schema/*.ts` 为 `export * from '@trapmap/service-*/schema'` 聚合
- `packages/service-*/drizzle/*` baseline 顺序 `identity→knowledge-write→candidate→governance→job→knowledge-read`
- `docs/reference/DATABASE_SCHEMA.md` 按 Owner 重分节，总览 `## 表总览 (42 张表)` 每节 `### X (N 表)` 计数与 `| table |` 行一致

## 非目标

- 不改列/索引定义，仅搬位置；不新增表

## 改前/改后

```
before: packages/db/src/schema/knowledge 560 + artifacts 449 集中
after:  service-identity-access/schema 6表
        service-knowledge-write/schema 7表
        service-knowledge-read/schema 3表
        service-candidate-ingestion/schema 4表
        service-governance-review/schema 3表（含 conflict_relations）
        service-job-runtime/schema 3表
        packages/db/src/schema/* 仅 export *
```

## 接口（示例）

```ts
// service-knowledge-write/src/schema.ts
export const knowledgeEntries = pgTable('knowledge_entries', { ... })
```

## Tasks

- [x] **4.1 Owner 拆分** — 每 service `schema.ts` 自持 `pgTable` 定义，`db/src/schema/*.ts` 仅聚合；`column-factories.ts` 留 `db` 复用
- [x] **4.2 消灭例外** — `conflict_relations` 正式建模于 `service-governance-review`，`DATABASE_SCHEMA.md` 增治理域小节并标注原双源已收敛
- [x] **4.3 索引复核** — 保持 `HNSW(tsvector) + tsvector GIN + jsonb GIN/函数索引`，`task_queue` 是否加 `pending_dequeue` 部分索引以实测决择，仅文档与注释对齐，不新增存储
- [x] **4.4 守卫对齐** — 跑 `check:table-schema 42/42` 与 `check:pgtable-single-source`（`service-*` 内 `pgTable(` 仅在 `schema.ts`）

## 完成标准

- 42 表总量不变，owner 分布与文档节计数一致；`check:table-schema` 与 `pgtable-single-source` 双绿

## 测试（精确）

```bash
pnpm check:table-schema
pnpm check:pgtable-single-source
pnpm check:structure
# 空库建库验证
pnpm --filter @trapmap/db test --run test/schema.test.ts
```

## 证据

- 变更文件：`service-*/schema.ts` 6, `db/src/schema/*` 聚合, `DATABASE_SCHEMA.md` 重分节
- 命令：见上

## 文档与测试

- [ ] 更新 `DATABASE_SCHEMA.md` 与 `docs/architecture/components/PERSISTENCE.md` Owner 表
- [ ] `pnpm check:structure` 绿

## Subagent 分派

| Subagent | 文件集 |
|---|---|
| D1 | `service-identity-access/schema.ts + service-knowledge-write/schema.ts + db/schema/knowledge.ts` |
| D2 | `service-candidate-ingestion/schema.ts + service-governance-review/schema.ts + db/schema/candidates.ts` |
| D3 | `service-knowledge-read/schema.ts + service-job-runtime/schema.ts + db/schema/retrieval.ts,queue.ts` |

