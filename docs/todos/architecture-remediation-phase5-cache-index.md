# Phase 5 — 缓存与索引统一

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> 归属：`architecture-remediation-mainline.md` 的 delegated Phase 5。依赖 P4。

**Goal:** Node 与 Go 统一 `Cache Port`，`workflow_runs/outbox` 驱动失效，HNSW/tsvector/GIN 索引注释与迁移对齐。

**探针输入:** 清单 #20 #11-14（缓存/索引）

## Scope

- 新建 `packages/backend-core/src/ports/cache-port.ts` `CachePort {get/set/invalidate/metrics}`
- 新建 `packages/backend-core/src/ports/observability-ports.ts` 若缺
- 改 `packages/service-knowledge-read/src/retrieval-read-model-cache.ts` 实现 `CachePort`
- 改 `services/knowledge-read-go/internal/cache/lru.go` 同 `CachePort` Go 侧，`key=sha256(canonicalJson)`
- 改 `services/knowledge-read-go/internal/recall/store/pg.go` 读前查 cache
- 新建 `packages/service-job-runtime/src/cache-invalidation.ts` 经 `workflow_runs` + `domain_event_outbox`

## 非目标

- 不新增存储（Redis 可选，仅文档）；不改检索语义

## 接口签名

```ts
// backend-core/src/ports/cache-port.ts
export interface CachePort {
  get(key: string): Promise<{ hit: true; value: unknown } | { hit: false }>
  set(key: string, value: unknown, ttlMs: number): Promise<void>
  invalidate(prefix: string): Promise<void>
  metrics(): { hitRate: number }
}
// Go: key = sha256(canonicalJsonStringify(payload))
```

## 验收指标

- `p95 recall 命中 >60%`（shadow 5% / dual 10% 采样落 prometheus）

## Tasks

- [ ] **5.1 定义 Cache Port** — TS 与 Go 同 key 语义 `canonicalJsonStringify` 字节一致，`get` 命中率进 `prometheus`，`invalidate` 由 `workflow_runs` 状态变更触发
- [ ] **5.2 双侧接线** — Node `retrieval-read-model-cache` 与 Go `lru+singleflight` 同源，`shadow/dual` 模式对比命中率落 metrics
- [ ] **5.3 索引复核** — `knowledge_embeddings/capsule_embeddings/experience_gene_embeddings HNSW` + `knowledge_search_documents tsvector GIN` + `candidates.analysis jsonb GIN` 保持，不新增存储，仅补注释与迁移一致说明

## 完成标准

- 命中/失效单测绿；`go test -run Cache` 绿；`workflow_runs` 驱动失效 e2e 绿

## 测试（精确）

```bash
pnpm --filter @trapmap/service-knowledge-read test --run test/retrieval-read-model-cache.test.ts
go test ./internal/cache -run TestCache -count=1
pnpm test:distributed-closeout
```

## 证据

- 变更文件：`ports/cache-port.ts` 1, `retrieval-read-model-cache.ts`, `internal/cache/lru.go`, `cache-invalidation.ts`
- 指标：`hitRate` 进 prometheus

## Subagent 分派

| Subagent | 文件集 |
|---|---|
| E1 | `backend-core/ports/cache-port.ts, observability-ports.ts` |
| E2 | `service-knowledge-read/*cache*, service-job-runtime/cache-invalidation.ts` |
| E3 | `services/knowledge-read-go/internal/cache/*, recall/store/pg.go` |

## 文档与测试

- [ ] 更新 `docs/architecture/components/PERSISTENCE.md` 缓存章节
- [ ] `pnpm test:retrieval` 相关单测绿

