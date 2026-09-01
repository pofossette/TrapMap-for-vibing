> **已归档 2026-09-01**：模块级 Go 服务化与函数级及时退出已完成（`main@d5f18c43`，`pre→main PR #3/#4`），读路径 `query→recall→ranking→assembly+cache` 同进程闭环，`go-accelerator` 检索/排序 已 `410 Gone`。详见本文 Closeout。原 `docs/todos/go-service-gradual-migration-mainline.md` 归档至此。

# 服务渐进 Go 化主线（Go Service Gradual Migration Mainline）

> **角色**：TrapMap 全仓服务从 Node/TypeScript 向 Go 的渐进迁移 owner 文档，承接 `go-accelerator-mainline → go-compute-hub-mainline` 的「函数级加速」成果，升级为「服务级接管」。读多写少（读:写 ≈ 50:1）下，**优先将读路径整段搬 Go**，其余服务按瓶颈与收益排期绞杀迁移。
> **前置**：`services/go-accelerator` chi :4100 已合入 `main@622a0732`（6 端点 + `infra fallback` + `distributed-only`），`go-compute-hub-mainline` 已完成 P0-P2 重计算批处理与 `canonicalHash` 链路，`type-alignment-mainline` P0 `Zod→JSON Schema→Go` 门禁已落地。
> **本主线**：定义**服务级**迁移的愿景、边界、模块化原则、分期与验收门禁。读服务必须**模块化内聚、部署解耦**，禁止单 Go 二进制承载检索/排序/组装/缓存等全部能力。
> **状态**：已归档 2026-09-01（Phase 0-5 全量交付，`main@d5f18c43` PR #3/#4 已合入）；`plan.md` Active 仍为 Experience Gene，本主线不再抢占 Gene 资源，仅作历史证据。
> **Owner**：`infra` + `backend-core` + `service-knowledge-read` + `host-distributed` + `go-accelerator`
> **关联**：`go-compute-hub-mainline.md`（函数→服务）、`type-alignment-mainline.md`（合同）、`performance-infra-mainline.md`（bench/stress/可观测）、`GO-ACCELERATOR.md`、`BOUNDARIES.md`、`SYSTEM_TRUTH_SOURCES.md`

---

## 1. 背景与硬约束

### 1.1 为什么要服务级 Go 化

- **业务画像**：`retrieval / ranking / dedup / gene-derive` 为 CPU 密集型热点（见 `benchmarks/GO_ACCELERATOR_BENCH.md`：`BatchCosine 1k×384 Go 2ms vs Node 5ms`，`Ranking merge/graph 2.3×`），且读:写 `≈50:1`（`performance-infra-mainline` 的 `mixed-50-1` 场景），每次读经 `gateway → service-knowledge-read Node → go-accelerator HTTP → fallback` 的 `RTT+序列化` 已占 `p95` 预算的 30-50%。
- **函数级加速已到边际**：`go-accelerator` 无 DB、不拥有数据，`pgvector recall` 仍在 Node，读路径最重的 `PG 读 + 向量召回 + rerank + 汇聚` 仅 30% 在 Go。继续在 `go-accelerator` 加 `keyword-score/dedup/xxx` 端点会使加速面膨胀为“第二套业务域”。
- **目标形态**：**将读路径的处理权完整交给 Go**（含 PG 只读 + 缓存 + 排序），Node 退为 `proxy + fallback + 写侧`；其余服务（`candidate-ingestion dedup`、`governance-review`、`knowledge-write` 的 `derive`）按「瓶颈>通用>写侧」绞杀。

### 1.2 硬约束（不可违背）

- **运行时语义不变**：同输入必须字节/分数一致，`canonicalJsonStringify` / `cosineSimilarity` / `ranking` 常量（`DUAL 0.15 / COVERAGE 0.1 / GENE MissingValidationPenalty 0.05`）以 `backend-core/domain` 纯函数为 oracle，`infra` fallback 单测守卫。
- **部署面约束**：`host-local` 永远零 Go 依赖（`fallow ignorePatterns: services/go-accelerator/**` 保持），仅 `distributed` 切 Go；`TRAPMAP_DEPLOYMENT_PROFILE=distributed` + `TRAPMAP_GO_*_ENABLED=true` 双开关。
- **契约唯一真相源**：`packages/contracts/src/domain/*.ts` (Zod) 为 SSOT → `z.toJSONSchema()` → `contracts/json-schema` → `services/*/pkg/api/types.go`（`json.RawMessage` 承载 `payload: z.unknown()`），门禁 `pnpm check:go-contract` + `pnpm generate:contracts:check` + `git diff --exit-code`。
- **架构边界**：`fallow` 18 zones，`contracts → lib → infra → backend-core → service-* → host-*` 方向不可逆；新增 Go 服务不新增 `RouteDef` 绕过契约，网关仅做 `RouteDef adapter` 消费。
- **仅基建不自动**：`bench/stress` 不入 `pnpm test` / CI 自动，仅按需 `pnpm bench:compute / stress:go:*`，结果落 `benchmarks/results/`（git ignored）。

### 1.3 现状已交付（基线）

- `services/go-accelerator`：chi、二进制、`pkg/api`、`internal/service/{hash,vector,tokenize,retrieval,ranking,dedup,gene-derive}`、`handlers`、`cache LRU`、`observability/metrics`、`/metrics`、`Dockerfile → distroless`、`docker-compose profiles:["distributed"]`、CI `setup-go 1.22`。
- 接线：`retrieval-semantic batchCosineWithFallback`、`retrieval-recall-coordinator rankingBatch`、`embedding fallbackVector`、`candidate-ingestion dedupFingerprint`、`dedup batch-similarity`、`canonicalHash` 链、`gene derive-batch` 暖通，均经 `packages/infra/src/go-accelerator/*` 带超时回退。
- 类型与质量：`pnpm typecheck 0`、`go test ./... 8 包 ok`、`fallow audit 0 boundary`。

> 剩余工作是**把“被加速的函数”收敛为“拥有数据的服务”**，而非继续在加速面堆端点。

---

## 2. 非目标

- 不在本主线将 **写路径**（`knowledge-write / candidate-ingestion 写 / governance-review` 决议）整体搬 Go（写侧瓶颈低、事务与补偿在 Node 已稳定，Go 仅接 `dedup`/`derive` 等纯计算）；
- 不在本主线重写 `pgvector` / DB 写入、迁移、事务管理（Go 仅做**只读** `pgx` 视角，复用 `@trapmap/db` 的迁移与表定义）；
- 不在本主线把 `ai-providers` 的 Embedding Provider 整体搬 Go（Go 仅做 `deterministicFallbackVector 384d` + `LRU+singleflight` 缓存，Provider 仍在 Node 或 Go 直调二选一）；
- 不新增 `RouteDef` 工厂契约的替代形态（Go 服务通过 `host-distributed` 网关代理现有 `RouteDef`，不手写第二套路由）；
- 不以性能为由放宽 `fallback 一致性校验` 与 `host-local` 零 Go 约束。

---

## 3. 架构愿景与原则

### 3.1 愿景

```
[client / web-panel / cli / mcp] → [gateway Fastify] ─┬─→ [knowledge-read-go 读服务簇] ─→ PG(只读) + pgvector
                                                      └─→ [Node 读 fallback/shadow]      （双跑/熔断）
                                 → [knowledge-write / ingestion / governance-review Node] (写侧不变)
                                 → [go-accelerator 纯计算面] (保留给非读的重计算：dedup/derive/hash)
```

- 读路径 **整段** 在 Go 内完成：`query → 规划 → 召回 → 排序 → 组装 → 缓存`，单次 `gateway → Go` HTTP，而非 `gateway → Node → Go` 两跳。
- 写路径保持 Node，Go 通过 `fallback` 参与写侧的 `dedup / derive / hash` 纯计算，不拥有写事务。

### 3.2 模块化原则（读服务禁止大单体）

> **本节为硬约束**：任何 Go 模块/文件超预算视为架构回退，`pnpm check:complexity` + `golangci-lint` 阻断。

**反集中定律**：读路径 `50:1` 不等于把所有读能力塞进一个服务。采用**单仓多模块单二进制起步、三二进制触发式**，每个模块 **≤30% 总 LOC、≤300 行/文件、≤600 行/模块**，单文件超 `400 行` 必须拆。

**反大文件定律**：`go-accelerator` 已暴露风险（`ranking.go 393 行`、`cmd/stress/main.go 538 行` 为红线），新服务禁止复现。`internal/*` 必须 `domain/service/port/handler` 四层分文件，`handler` 仅做 `校验→service.Call→encode`，业务在 `domain`。

**原则 1 — 单一职责 + 显式依赖**：读服务**不是**一个 `knowledge-read-go` 大单体。采用**单仓多模块单二进制起步、按压测与团队边界再拆二进制**的策略：
- 每个能力为 `internal/<module>/` 独立包，拥有 `domain`（纯函数）+ `service`（编排）+ `port`（依赖倒置）三层，禁止跨模块直接 import `store/pg`。
- 模块间仅通过 `port` 接口与 `pkg/api` DTO 通信，`fallow` 新增 `zone: go-read-*` 校验。

**原则 2 — 数据主权清晰**：Go 读服务仅拥有**读模型投影**（只读），不拥有写模型；写仍由 `service-knowledge-write` 落库，读经 `PG 视图` 或 `CDC` 消费。

**原则 3 — 绞杀而非重写**：每个模块以 `gateway 代理 + shadow 双跑 + 熔断回 Node` 的绞杀器迁移，同 `go-accelerator` 的 `fallback` 语义，但粒度为**路由级**而非函数级。

**原则 4 — 可观测与可回退**：每个模块暴露 `/health /ready /metrics`，`fallback_total` 与 `p95/p99` 按模块 label 切分，熔断阈值 per-route。

---

## 4. 服务全景与优先级（RICE）

| 优先级 | 服务/切片 | 现状瓶颈 | Go 收益 | 风险 | 本主线阶段 |
|---|---|---|---|---|---|
| **P0** | **读路径（knowledge-read）** — `semantic recall / keyword / graph / ranking / assembly` | 最高、读 50:1、CPU+IO 双高 | 最高，p95 预期 -35% | 中（PG 只读 + 缓存一致性） | **Phase 1-3** |
| **P1** | `candidate-ingestion / dedup` — `fingerprint / batch-similarity` | 中高，`O(M) Jaccard` | 高，批处理已验证 `0.04ms` | 低（纯计算） | **Phase 4a**（已部分落地于 `go-accelerator`，本主线收敛为独立 `go-dedup` 模块） |
| **P1** | `knowledge-write / gene derive` — `10 regex + 2 hash` | 中，`derive-batch 200 ~3.2ms` | 中高 | 低 | **Phase 4b** |
| **P2** | `governance-review` — `review-queue-projection / conflict` | 低-中 | 中 | 中（事务） | **Deferred**，仅抽 `ranking` 助手 |
| **P2** | `embedding cache` + `vector ops` | 低 | 中（命中率） | 低 | **Phase 1 内联** |
| **不迁** | `identity-access / job-runtime / cron` | 低 | 低 | 高（鉴权/调度） | **不迁**，维持 Node |

> **顺序不可逆**：必须完成 **P0 读** 的端到端绞杀与基线，再启动 P1/P2，避免多线并行导致回退路径不可测。

---

## 5. 读服务模块化设计（重点）

> 详见 `docs/architecture/performance/ARCHITECTURE_PERFORMANCE_REVIEW.md` 的 5 链路根因，此处将其收敛为模块边界。

### 5.1 模块地图（一图胜千言）

```mermaid
flowchart TB
  subgraph edge["gateway (Fastify, Node)"]
    GRR[RouteDef 代理 + 熔断 + shadow]
  end
  subgraph go_read["knowledge-read-go (Go, 单仓多模块)"]
    direction TB
    M0["read-api<br/>HTTP + 鉴权透传 + 参数校验<br/>RouteDef 复用"]
    M1["query-planning<br/>intent / tokenize / embedding<br/>pure + cache"]
    M2["recall<br/>semantic(kv/pgvector) + keyword + graph<br/>pgx 只读 + singleflight"]
    M3["ranking<br/>merge / rerank / channel-merge<br/>Go 已对齐常量"]
    M4["assembly<br/>citations + summary + decay + boundary<br/>compaction"]
    M5["cache<br/>LRU+TTL + read-model projection<br/>invalidation seam"]
    M0 --> M1 --> M2 --> M3 --> M4
    M1 & M2 & M5 --- CACHE[(LRU 10k<br/>+ singleflight)]
    M2 --- PG[(PG / pgvector 只读)]
  end
  GRR --> M0
  M0 -. fallback .-> NR[Node 读 fallback]
  GOA[go-accelerator 纯计算面] --- M1 & M3
```

### 5.2 模块职责与边界（禁止越界）

| 模块 | 包路径 | 职责 | 拥有 | 禁止 | 依赖方向 |
|---|---|---|---|---|---|
| **read-api** | `services/knowledge-read-go/internal/api/` | HTTP `RouteDef` 转译、鉴权透传（`Authorization: Bearer` 转 `x-session`）、参数校验（Zod → Go 的 `json.RawMessage` 校验）、熔断/限流、shadow 分流 | `chi` 路由、中间件、DTO | 任何 ranking/recall 业务判断 | `→ query-planning, recall, ranking, assembly` |
| **query-planning** | `internal/query/` | `intent-recognition`、分词(`tokenize` 3/2/1 权重)、`embedding` 生成与缓存（`FALLBACK_EMBEDDING_DIMENSION 384`）、查询改写 | `service/tokenize`、`service/vector`、`cache` port | 直接查 PG | `→ cache, infra/embedding` |
| **recall** | `internal/recall/` | 三通道召回：`semantic`（`pgvector` + `cosine` 批）、`keyword`（`shortcut/detail/labels`）、`graph`（`graph-query`）、通道合并去重 | `pgx` 只读、`infra/vector` | 最终排序逻辑 | `→ query, pg, cache` |
| **ranking** | `internal/ranking/` | `merge`/`rerank`/`mergeWithGraph`（Go 已对齐 `DUAL 0.15 COVERAGE 0.1`）、`Gene` 选择（`MissingValidationPenalty 0.05`） | `service/ranking`、`service/gene` | DB 访问、摘要生成 | `→ query, recall` |
| **assembly** | `internal/assembly/` | `response-assembly`、`citations`、`refinement`、`boundary`、`decay` 的 `compaction` 与 `control-oriented` 裁剪 | `backend-core/knowledge-read/domain` 移植 | 向量计算 | `→ ranking, cache` |
| **cache** | `internal/cache/` | `LRU+TTL+singleflight`（复用 `services/go-accelerator/internal/cache/lru.go` 10k）、`read-model-cache` 投影、失效 seam（`PG NOTIFY` / `poll`） | `cache/lru.go`、`observability` | 业务规则 | `—` 被所有模块依赖 |

> **文件布局约定**（单仓多模块单二进制起步，**每文件 ≤300 行，超 400 行 CI 失败**）：
> ```
> services/knowledge-read-go/
>   cmd/server/main.go              // ≤150 行：仅装配 + 启动
>   go.mod                          // module trapmap-knowledge-read-go, go 1.23
>   Dockerfile                      // golang:1.23 → distroless
>   pkg/api/types.go                // 生成，禁止手写业务
>   pkg/api/oapi_gen.go             // 生成
>   internal/api/                   // read-api ≤500 行总量
>     handler.go        // ≤120 行：校验+鉴权透传+调用
>     middleware.go     // ≤100 行：限流/熔断/shadow
>     router.go         // ≤80 行：chi 路由表
>   internal/query/                 // ≤600 行总量
>     domain/tokenize.go    // ≤150 行：复用 tokenize 3/2/1
>     domain/embedding.go   // ≤120 行：fallback 384
>     service/query.go      // ≤180 行：编排 + cache port
>     port.go               // ≤50 行：接口
>   internal/recall/                // ≤700 行总量（最大模块，仍 ≤30%）
>     domain/score.go       // ≤150 行：cosine/keyword/graph 纯算
>     service/semantic.go   // ≤180 行：pgvector 召回
>     service/keyword.go    // ≤120 行：keyword
>     service/graph.go      // ≤120 行：graph 只读
>     store/pg.go           // ≤180 行：pgx 只读，不含 ranking
>     port.go               // ≤50 行
>   internal/ranking/               // ≤600 行总量，禁止 393 行单文件
>     domain/merge.go       // ≤150 行：merge 0.6/0.4
>     domain/rerank.go      // ≤150 行：rerank 0.15/0.1
>     domain/boundary.go    // ≤120 行：boundary delta
>     service/ranking.go    // ≤150 行：编排
>     port.go
>   internal/assembly/              // ≤600 行总量
>     domain/citation.go    // ≤150 行
>     domain/summary.go     // ≤150 行
>     service/assemble.go   // ≤180 行
>     port.go
>   internal/cache/
>     lru.go                // 复用 hashicorp/golang-lru/v2，不手搓
>     singleflight.go       // golang.org/x/sync/singleflight
> ```
> **拆分触发**：任一 `internal/*` 超 600 行或单文件超 400 行，立即在 `internal/<module>/domain` 内按 `动词` 再拆文件；禁止把 `ranking` 的 `merge/rerank/boundary` 合并为单 `ranking.go`（现状 `393 行` 为反例，迁移时必须拆三文件）。
> service/                // 编排 + port 适配
> port/
> internal/recall/
> internal/ranking/
> internal/assembly/
> internal/cache/
> internal/observability/
> internal/config/
> internal/middleware/
> ```

### 5.3 防集中与防大文件门禁（与 `scripts/complexity-budgets.json` 联动）

- **行预算**（新增至 `lineBudgets`）：
  ```json
  { "file": "services/knowledge-read-go/internal/ranking/domain/merge.go", "maxLines": 200 },
  { "file": "services/knowledge-read-go/internal/recall/service/semantic.go", "maxLines": 200 },
  { "file": "services/knowledge-read-go/cmd/server/main.go", "maxLines": 150 },
  { "file": "services/go-accelerator/internal/service/ranking/ranking.go", "maxLines": 250 }
  ```
  存量 `ranking.go 393 行` 在本主线 `Phase 1` 必须拆为 `merge.go/rerank.go/boundary.go` 并将预算收敛至 `200`，`cmd/stress/main.go 538 行` 拆为 `stress/runner.go + stress/scenario/*.go`。
- **复杂度预算**：`golangci-lint` 启用 `gocyclo >15`、`funlen >60` 失败；`pnpm check:complexity` 新增 Go 文件扫描。
- **依赖方向门禁**：`fallow` 新增 `zone: go-read-*`，`go-read-ranking → go-read-recall` 禁止，`recall → ranking` 单向；`internal/*` 禁止跨 `store/pg` 直引。
- **任务分散门禁**：每个 Phase 仅拥有 `1 个主模块 + ≤1 个协作模块`（如 `Phase 1 = recall 主 + query 协作`），禁止 `Phase 1 = recall+ranking+assembly` 全量并行。

### 5.4 部署形态演进（单二进制 → 三二进制）

- **起步（Phase 1-2）**：**单二进制** `knowledge-read-go :4101` 内含 6 模块，`gateway` 单 `upstream`；收益最大、运维最小，压测证明瓶颈不在进程内再拆。
- **演进条件（Phase 3 后，触发式）**：任一满足即拆为 **三二进制**：
  - `go-read-recall :4111`（`recall + query + cache`）— PG 读与向量密集
  - `go-read-ranking :4112`（`ranking`）— CPU 密集，可独立水平扩展
  - `go-read-assembly :4113`（`assembly`）— 轻量，依赖少
  拆分阈值：`recall p99 >20ms 且 CPU <60%`（IO 限）、或 `ranking 占用 >40% CPU`（计算限）、或团队需独立发版。
- **禁止**：不等压测即拆为 5+ 微服务；禁止为每个 `internal/*` 建独立 repo。

### 5.4 与现有 `go-accelerator` 的关系

- `go-accelerator :4100` **保留**为跨服务纯计算面（`hash/canonical`、`vector`、`dedup`、`gene derive`），`knowledge-read-go` 通过 `infra client` 复用 `vector.BatchCosine` 等能力，而非自实现第二份。
- 当 `knowledge-read-go` 稳定后，`go-accelerator` 的 `retrieval/ranking` 端点标记 `deprecated`，仅保留 `hash/vector/tokenize`。

---

## 6. 契约、类型与生成链路

- **复用 `type-alignment-mainline` P0**：`packages/contracts/src/domain/go-accelerator.ts` 等 22 schemas 已是 SSOT；新增读服务契约不新建 SSOT，扩展 `packages/contracts/src/domain/knowledge-read.ts`（Zod）→ `contracts/json-schema/knowledge-read/*.json` → `services/knowledge-read-go/pkg/api/types.go`。
- **校验链**：
  ```bash
  pnpm generate:contracts --check
  pnpm check:go-contract
  git diff --exit-code -- contracts/json-schema services/knowledge-read-go/pkg/api
  (cd services/knowledge-read-go && go vet ./...)
  ```
- **负载**：`payload: z.unknown()` → Go `json.RawMessage`，`sha256Hex` 正则、`finite` 校验、维度 `384` 默认保持与 `GO-ACCELERATOR.md` 一致。

---

## 7. 数据与存储策略（只读）

- **DB 访问**：Go 仅以 `pgx` **只读**访问 `knowledge` / `trap` / `skill` / `gene` 的读视图（复用 `packages/db` 的表定义，不自建迁移）；写仍由 `service-knowledge-write` 经 `@trapmap/db` 事务落库。
- **一致性**：读已提交（`READ COMMITTED`），`requiredLevel` / `scope` / `labels` 过滤与 `backend-core` 的 `retrieval-orchestration` 同逻辑，单测以 `packages/contracts/src/domain/retrieval-fixtures.ts` 的确定性固件为 oracle。
- **缓存**：`query embedding` 与 `read-model` 的 `LRU 10k + singleflight`（复用 `internal/cache/lru.go`），`TRAPMAP_GO_ACCEL_CACHE_SIZE` 控制，失效经 `PG LISTEN/NOTIFY` 或 `poll 5s`（`host-distributed` 已有 `NOTIFY` seam）。
- **禁止**：Go 侧任何 `INSERT/UPDATE/DELETE`、自建 `drizzle` 迁移、`OUTBOX` 写入。

---

## 8. 网关与切流（绞杀器）

```mermaid
sequenceDiagram
  participant C as client
  participant GW as gateway Fastify
  participant GR as knowledge-read-go
  participant NR as Node 读
  C->>GW: GET /v1/knowledge/read?query=...
  GW->>GW: check TRAPMAP_READ_IMPL (off/shadow/dual/go)
  alt go
    GW->>GR: proxy (800ms timeout, breaker)
    GR-->>GW: 200 / 503
    GW-->>C: Go 响应 / fallback Node
  else shadow
    GW->>GR: async 影子（不阻塞）
    GW->>NR: 主路径
    NR-->>GW: 200
    GW-->>C: Node 响应（后台比对）
  else dual
    par
      GW->>GR: 
    and
      GW->>NR: 
    end
    GW->>GW: 比对分数一致性落 metrics
  end
```

- **开关**：`TRAPMAP_READ_IMPL = off | shadow | dual | go` + `TRAPMAP_READ_SHADOW_PERCENT`，`getReadServiceConfig()` 位于 `packages/host-distributed/src/config/service-config.ts` 旁（仿 `getGoAcceleratorConfig()`）。
- **熔断**：`internal-observability breaker`（` breakerStatesSnapshot() `），`goReady !== ready` 时 `gateway /ready → 503 degraded`（复用 `gateway/routes.ts:234` 逻辑）。
- **回退**：任何 `timeout/error/non-200` 必回 `Node`，`fallback_total` 按 `route` label 计数，`pprof` 按需 `PPROF_ENABLED=true`。

---

## 9. 可观测性与性能门禁（仅设施不自动）

- **Go 侧**：复用 `services/go-accelerator/internal/observability/metrics.go` 的 `trapmap_go_requests_total / trapmap_go_fallback_total / trapmap_go_duration_ms`，新增 `module` label（`query/recall/ranking/assembly`）；`internal/middleware/metrics.go` + `cache Len()` + `pprof`。
- **Node 侧**：复用 `docs/architecture/OBSERVABILITY.md` OTEL/LGTM。
- **门禁阈值**（与 `performance-infra-mainline` 同源，`mixed-50-1` 场景 `50VU 10s`）：
  | 场景 | 路径 | p95 | p99 | 0% 5xx |
  |---|---|---|---|---|
  | `read-recall` | `GET /v1/knowledge/read` | <20ms | <40ms | 0 |
  | `ranking` | `internal/ranking` | <10ms | <20ms | — |
  | `dedup` | `POST /v1/dedup/batch-similarity` | <10ms | <20ms | 0 |
- **命令**（均手工，按需）：
  ```bash
  pnpm bench:compute
  pnpm bench:compare
  (cd services/knowledge-read-go && go test -bench . -benchmem ./internal/ranking ./internal/recall -run=^$)
  go run ./services/go-accelerator/cmd/stress -scenario mixed-50-1 -vus 50 -duration 10s -check
  curl http://localhost:4101/metrics | grep trapmap_go
  ```

---

## 10. 分期计划与验收清单

> 每个 Phase 的复选框仅在「代码+文档+focused test+守卫+closeout 证据」齐全后勾选；根 `plan.md` 不复制复选框，owner 在此文档回写。

### Phase 0 — 基线与空转（1 周，并行 Gene 主线，不抢占）

- [x] 完成 `mixed-50-1` 基线压测与 `ARCHITECTURE_PERFORMANCE_REVIEW.md` 更新（现状 p95/p99/RPS 落库 `benchmarks/results/`）
- [x] 落 `services/knowledge-read-go` 空二进制（`chi` + `/health /ready /metrics`，`canary` 返回 `501`），`Dockerfile` 与 `docker-compose profiles:["distributed"]` 占位，`fallow` 新增 `ignorePatterns`
- [x] 扩展 `packages/contracts/src/domain/knowledge-read.ts` 的 `read` 检索契约（`retrievalScoreEntry` 等复用，不新增业务枚举），`pnpm generate:contracts:check` 绿
- [x] 网关加 `TRAPMAP_READ_IMPL=off` 空开关与 `fallback_total` 埋点
- 证据：`go test ./...` 1 包 ok、`pnpm check:go-contract` ok、`fallow audit 0`

### Phase 1 — recall（2 周，读收益最大）

- [x] 移植 `packages/backend-core/src/knowledge-read/domain` 的 `query/planning` 纯函数至 `internal/query/domain`（`tokenize` 3/2/1、`buildEmbeddingText` 零改），`go test` 字节对齐
- [x] 实现 `internal/recall` 的 `pgx` 只读 + `singleflight` + `BatchCosine`（复用 `go-accelerator` 的 `vector` 服务），三通道 `semantic/keyword/graph` 按 `retrieval-orchestration` 同参
- [x] 网关 `shadow 5%` 双跑，比对 `semanticScore/keywordScore` 落 `metrics`，Node 仍主路径
- 证据：`shadow` 一致性 `>99.5%`、`p95 read-recall <25ms`（`stress:go:batch-cosine` 基线对比）

### Phase 2 — ranking（1.5 周）

- [x] 移植 `ranking`（`merge/rerank/mergeWithGraph/channel-merge`）与 `gene select` 常量对齐，`vitest --project service-knowledge-read` 的固件在 Go 侧同断言
- [x] `dual 10%` 开启 `ranking` 在 Go 内闭环（`recall→ranking` 同进程，不再 `Node→Go` 两跳），熔断阈值 per-route
- 证据：`dual` 排序一致性 `>99.9%`、`ranking p95 <10ms`

### Phase 3 — assembly + cache（1.5 周）

- [x] 移植 `response-assembly / citations / refinement / boundary / decay` 的 `compaction` 逻辑，`cache LRU+TTL` 与失效 seam 接 `PG NOTIFY`
- [x] 切流 `go 50% → 100%`（read-only），`gateway /ready` 聚合 `knowledge-read-go/ready`
- 验收：`read 50:1` 下 `p95 <20ms p99 <40ms`、`fallback_total <0.1%`、`0% 5xx`（`mixed-50-1`）

### Phase 4 — 其余服务收敛（持续，按需，不与 P0 并行）

- [x] `candidate-ingestion/dedup` 的 `fingerprint/batch-similarity` 从 `go-accelerator` 收敛为 `internal/dedup` 独立模块（或独立 `go-dedup` 二进制，触发式）
- [x] `knowledge-write/gene derive` 的 `10 regex + 2 hash` 收敛为 `go-gene-derive` 定时任务（`cron-scheduler` 触发，复用 `derive.go`）
- [x] `type-alignment` P1 `openapi` 加固 HTTP 边界，P2 `proto+buf` 仅 `batch` 批处理 gated by `1k BatchCosine >10ms`

### Phase 5 — Closeout 与归档

- [x] `pnpm typecheck 0`、`pnpm check:structure` `PASS`、`fallow audit 0`、`go vet/test` 全仓 ok（main@20e38a79，pre→main PR #3 已合入，`pnpm typecheck 0 / check:structure PASS / check:docs PASS / check:complexity 9/9 PASS / fallow 0 boundary / go vet 0 / go test 4/4 PASS`）
- [x] `docs/architecture/GO-ACCELERATOR.md` 与 `SERVICE-DISCOVERY.md` 更新（新增 `knowledge-read-go` 的发现与健康契约，见 `7ffea38a docs+fix: GO-ACCELERATOR timely exit + SERVICE-DISCOVERY`）
- [x] 本文档归档至 `docs/archived/archived-plans/go-service-gradual-migration-archived.md`，`docs/todos/README.md` 与 `docs/archived/README.md` 索引同步（`2026-09-01` 归档 `main@d5f18c43`，见 `docs/archived/README.md` 与本行）

---

## 11. 测试与验证矩阵

| 层 | 命令 | 门禁 |
|---|---|---|
| 单元 | `go test ./...` + `pnpm --filter @trapmap/service-knowledge-read test --run test/retrieval*` | 分数/字节一致性单测，`golden` 固件同断言 |
| 合同 | `pnpm generate:contracts:check` + `pnpm check:go-contract` | `RawMessage` 与 `finite` 校验，CI 阻断 |
| 集成 | `pnpm test:file -- packages/infra/test/go-accelerator.test.ts` + `gateway internal-client.test.ts` | `shadow/dual` 分流与熔断 |
| 端到端 | `pnpm --filter @trapmap/web-panel test:e2e`（`read` 检索链路） | Node 与 Go 双实现同绿 |
| 性能 | `pnpm bench:compare` + `go test -bench` + `stress:go:mixed-50-1` | p95/p99 阈值（§9） |
| 架构 | `pnpm exec fallow audit --base main` | 0 boundary，`host-local` 零 Go |

---

## 12. 部署与配置

```yaml
# docker-compose.yml (distributed profile)
  knowledge-read-go:
    image: trap-map-knowledge-read-go:latest
    profiles: ["distributed"]
    build: { context: ./services/knowledge-read-go, dockerfile: Dockerfile }
    ports: ["4101:4101"]
    environment:
      - PORT=4101
      - TRAPMAP_READ_IMPL=${TRAPMAP_READ_IMPL:-shadow}
      - TRAPMAP_GO_ACCELERATOR_URL=http://go-accelerator:4100
      - TRAPMAP_GO_ACCEL_CACHE_SIZE=10000
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/trapmap  # 只读用户
    healthcheck: { test: ["CMD", "wget", "-qO-", "http://127.0.0.1:4101/health"] }
    restart: unless-stopped
```

```ts
// packages/host-distributed/src/config/service-config.ts
export interface ReadServiceConfig { impl: "off"|"shadow"|"dual"|"go"; url: string; timeoutMs: number; shadowPercent: number }
export function getReadServiceConfig(): ReadServiceConfig { /* env TRAPMAP_READ_IMPL */ }
```

---

## 13. 风险与回退

| 风险 | 缓解 | 回退 |
|---|---|---|
| Go 侧 ranking 与 Node 不一致 | `golden` 固件双测 + `shadow` 比对落 `metrics` | 网关 `TRAPMAP_READ_IMPL=off` 瞬切 Node |
| PG 只读滞后 / 复制延迟 | 读已提交 + `PG NOTIFY` 失效 + `cache TTL 30s` | 降 `cache TTL` 或关 `cache` |
| 单二进制过重 | `internal/*` 模块边界清晰，`Stage 3` 后按 CPU/IO 拆三二进制 | 回单二进制 |
| 契约漂移 | `check:go-contract` 阻断，`buf breaking` 仅 P2 | `git diff --exit-code` 卡 CI |

---

## 14. 问题池与延期

- `embedding provider` 是否随读服务一并迁 Go（当前 Node `ai-providers` 仍主，需压测决定）？
- `read-model` 投影是否需 `CDC (Debezium)` 而非 `NOTIFY`（当前 `NOTIFY` 足量，`PG` 压力待观测）？
- `knowledge-read-go` 的三二进制拆分阈值是否需按实例规格（1c vs 4c）分档？
- `WASM fallback` 是否作为 edge 读的 P2（`performance-infra` 已延期）？

延期落点：`docs/todos/open-debt-and-compromises.md`（平台成熟度登记）与 `docs/archived/archived-plans/instrumentation-observability-plan.md`（可观测）。

---

## 15. 附录

### A. 依赖方向（fallow 增量）

```json
{ "name": "go-read-api", "patterns": ["services/knowledge-read-go/internal/api/**"] },
{ "name": "go-read-recall", "patterns": ["services/knowledge-read-go/internal/recall/**"] },
{ "name": "go-read-ranking", "patterns": ["services/knowledge-read-go/internal/ranking/**"] }
// 规则：go-read-* → contracts, lib, infra, persistence-schema;  禁止 go-read-* → host-*
```

### B. 配置样例

```env
TRAPMAP_DEPLOYMENT_PROFILE=distributed
TRAPMAP_GO_ACCELERATOR_ENABLED=true
TRAPMAP_GO_ACCELERATOR_URL=http://go-accelerator:4100
TRAPMAP_READ_IMPL=shadow
TRAPMAP_READ_SHADOW_PERCENT=5
TRAPMAP_GO_ACCEL_CACHE_SIZE=10000
TRAPMAP_LOG_LEVEL=info
```

### C. 回归命令（速查）

```bash
pnpm typecheck
pnpm check:go-contract && pnpm generate:contracts:check
pnpm exec fallow audit --base main
(cd services/knowledge-read-go && go vet ./... && go test ./... -count=1)
pnpm --filter @trapmap/service-knowledge-read test --run test/retrieval*
go run ./services/go-accelerator/cmd/stress -scenario mixed-50-1 -vus 50 -duration 10s -check
```

---

> **下一步**：本主线为「待激活并行主线」，激活条件为 `Experience Gene` 主线完成 Closeout 或显式在 `plan.md` 增 `delegated execution surface`。试点前先完成 `Phase 0` 的 `mixed-50-1` 基线与空二进制占位，不阻塞当前 Active。
