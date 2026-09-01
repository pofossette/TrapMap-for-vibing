# Go 计算中枢主线（Go Compute Hub Mainline）

> **角色**：并行主线 detail，负责将 TrapMap 中“并发瓶颈 + 重计算”从 Node 纯函数抽离至 `services/go-accelerator`（仅 `distributed` 启用，`host-local` 零依赖 fallback）。
> **前置**：`go-accelerator-mainline.md` 的 scaffold 已合入 `pre`（hash/vector/tokenize/retrieval/gene 6 端点 + `infra` fallback + gateway `go/ready -> degraded` 聚合）。
> **本主线**：在 scaffold 之上补齐剩余重计算的系统化迁移、缺口接线与基准化，属于 `go-accelerator` 的 Phase 2-4 深化。
> **关联**：依赖 `type-alignment-mainline.md` 的 P0 生成门禁为新增端点提供 `contracts -> Go` 类型约束。
> **状态**：Phase 0 已落地（2026-08-31），Phase 1 已落地（2026-08-31），**Phase 1 真实接线于 2026-08-31 完成**（`a745e614`），**Phase 2 瓶颈补齐于 2026-09-01 完成**（`dedup batch-similarity + canonicalHash + gene derive-batch 暖通`）。
> **落地证据**：`services/go-accelerator/pkg/api/types.go` payload RawMessage + `handlers/fallback_vector.go` + `ranking/dedup` (`internal/service/ranking|dedup` + `handlers/ranking|dedup` + `ranking-batch/keyword-score/dedup/*`) + `infra/ranking*|keyword*|dedup*` fallbacks + `cmd/server/main.go` 注册 `POST /v1/vector/fallback` + `infra/client.fallback` `fallbackVector/deterministicFallbackWithFallback` + `retrieval-semantic.ts` `batchCosineWithFallback` 批处理 + `infra/client getGoAcceleratorClient` + `docs/architecture/GO-ACCELERATOR.md` 更新
> **新增接线（a745e614）**：`service-knowledge-read/retrieval-recall-coordinator.ts` `rerankRecallResults` 改 async 并经 `getGoAcceleratorClient().rankingBatch` 真实调用 Go `ranking-batch`（`toGoRankingEntries/fromGoRankingEntries` 完整映射 `labels/scope/shortcut/detail/boundary/decayState`，`host-local` 零 Go 直接 `localFallback`，`distributed` 3s 超时 fallback）；`infra/embedding` `embedWithFallback` 经 `deterministicFallbackWithFallback` 接 Go `POST /v1/vector/fallback`；`service-candidate-ingestion/processing.ts` `processCandidate` 指纹经 `dedupFingerprintWithFallback` 接 Go；Go `ranking` 常量对齐 `DUAL 0.15/COVERAGE 0.1`（与 `backend-core/ranking.ts` 一致），`gene` 补 `MissingValidationPenalty 0.05` + `validationCount` + clamp 0-1 + `GeneID` 二级排序，`contracts` `go-accelerator.ts` + `pkg/api/types.go` + `infra` 同步 `validationCount`，`vitest.config.ts` 补 `infra` 子路径别名，`service-candidate-ingestion/tsconfig` 补 `infra` 引用。
> **新增接线（2026-09-01）**：`Go dedup batch-similarity` 端到端打通（`internal/service/dedup BatchSimilaritySharedUnion + handlers/DedupBatchSimilarity + pkg/api DedupBatchSimilarity* + cmd/server /v1/dedup/batch-similarity + infra dedupBatchSimilarity + backend-core dedupTokens/dedupSimilarity 导出 + service-candidate-ingestion dedup-strategy Go批`，`O(M) Jaccard`逐条JS→单次Go批）；`service-knowledge-write` 源哈希链路 `canonicalHashWithFallback`（`snapshots/planning/derivation isStaleSource`经 `POST /v1/hash/canonical`字节一致，`curl` 验证 `{"a":1}` hash `43258cff...`）；`geneDeriveBatchWithFallback` 暖通（10regex+2hash并行）；`contracts` 新增 `dedupBatchSimilarity*` 22 schemas，`check:go-contract` ok，`go vet/test 8包 ok`，`pnpm typecheck 0`。
> **Owner**：backend-core + service-knowledge-read + service-candidate-ingestion + infra

---

## 1. 背景与约束

- **硬约束**：运行时语义不变；`distributed` 才启用 Go，超时/异常必 `fallback` 至 `@trapmap/lib` / `backend-core/domain` 纯函数，保证字节/分数一致；`host-local` 禁止 Go 依赖（`fallow` zone 已配置 `.fallowrc.json ignorePatterns: services/go-accelerator/**`）。
- **现状已交付**（`pre@a9b413b5`）：`services/go-accelerator` chi :4100，`pkg/api/types.go` + `internal/service/{hash,vector,tokenize,retrieval,gene}` + `handlers/*` + `infra/client.fallback` + `host-distributed/config getGoAcceleratorConfig()` + `docker-compose profiles:["distributed"]` + `ci setup-go`。
- **验证基线**：`go test ./...` 4 包 ok，`vitest --project skill-registry --project infra` 11 files 32 cases，`fallow audit --base HEAD~1` 0 boundary，`vector.BatchCosine` 64-shard `sync.WaitGroup` bench ~2ms/1000×384。

剩余工作是 **补齐未走 Go 的重计算热点** 并 **把已实现的 Go 能力真正接线到调用方**，而非继续堆新服务。

---

## 2. 非目标

- 不把 `pgvector` / DB 查询搬 Go（`service-knowledge-read` 的 `candidate-corpus-pg` 仍在 Node）；
- 不在本主线做 embedding provider 的 Go 重实现（`ai-providers` 仍在 Node，Go 仅做 `embeddingCache` LRU 可选）；
- 不改 `RouteDef` 工厂契约（新 Go 端点经 `infra` client 调用，不新增 `RouteDef`）；
- 不以性能为由放宽 fallback 一致性校验（Go 与 JS 的 `canonicalJsonStringify` / `cosineSimilarity` 必须 byte/score 一致）。

---

## 3. 重计算热点全量盘点（按“并发×计算×调用频次”排序）

> 扫描口径：`packages/backend-core/src/knowledge-read/domain/*.ts` + `packages/lib/src/vector.ts, canonical-json.ts, hash.ts` + `packages/service-knowledge-read/src/{retrieval-semantic,retrieval-keyword,retrieval-orchestration,channel-merge}/*.ts` + `packages/service-candidate-ingestion/src/{dedup-strategy,processing}.ts` + `packages/backend-core/src/experience-gene*` + `fallow health` CRITICAL。

### 3.1 P0 — 下一迭代必做（高频 × 高算 × 已有 Go 半成品未接线）

| # | 热点 | 文件/函数 | 算法特征 | 并发收益 | 现状缺口 | Go 形态 |
|---|------|-----------|----------|----------|----------|---------|
| P0-1 | **语义召回批量余弦** | `service-knowledge-read/retrieval-semantic.ts: optimizedSemanticRecall` 循环 `cosineSimilarity(queryVector, emb)` + `service-knowledge-read/retrieval-infra.ts` | O(N×D) 点积+N次 `sqrt`，N=数千×D=384（或 1536），每检索一次全量计算；当前 JS 串行 `for` | Go `vector.BatchCosine` 64-shard 并行已实现但**未被 `retrieval-semantic` 调用**，仍走 `fallow` 报的 `cosineSimilarity` 循环 | `POST /v1/vector/batch-cosine` 已有，需增 `infra/batchCosineWithFallback` 接线 + `retrieval-semantic.ts:145` 改为批调 |
| P0-2 | **确定性回退向量** | `packages/lib/src/vector.ts: createDeterministicFallbackVector(text,384)`：`token*6` LCG + `fillCharacterEmbedding` + `normalize` | 每无 embedding 命中一次，含 384 次 LCG + 归一化，LLM 降级/离线时高频 | Go `vector.DeterministicFallbackVector` 已实现但**未暴露 handler**，`lib` 侧无 Go 分支 | 新增 `POST /v1/vector/fallback` + `infra/deterministicFallbackWithFallback` + `service-knowledge-read` 降级路径接线 |
| P0-3 | **canonical hash 双热点** | `packages/lib/src/canonical-json.ts: canonicalize`（递归字典序）+ `packages/lib/src/hash.ts: sha256` + `packages/lib/src/canonical-hash.ts` | 每次 `experience-gene-derivation` + `candidate-ingestion` 幂等 `sha256CanonicalJson`，对大 JSON（skill artifact body）递归排序开销显著 | Go `hash.CanonicalHash` 已有但**未被 `experience-gene-derivation/hashing.ts` 的 `sha256CanonicalJson` 调用**（直接引 `@trapmap/lib`） | `POST /v1/hash/canonical` 已有，需增 `canonicalHashWithFallback` 在 `experience-gene` 管线中的调用分支 |
| P0-4 | **去重指纹 + Jaccard** | `service-candidate-ingestion/dedup-strategy/rule-dedup-strategy.ts: fingerprint(sha256) + similarity(Jaccard over n-gram)` | `candidate-ingestion` 每 candidate 必算，含 `sha256` + 集合交并 | Node 串行，去重高峰批量 candidate 时并发不足 | 新增 `POST /v1/dedup/{fingerprint,similarity,batch-similarity}`（或复用 `hash/vector`），Go `sha256`+`set` 并行批处理 |
| P0-5 | **关键词评分** | `backend-core/knowledge-read/domain/tokenization.ts: scoreKeywordEntry` (weights 3/2/1: label/shortcut/detail) | 每 keyword recall 对 `queryTokens × entryFields` 权重求和，`retrieval-orchestration` 每检索 N 次 | 已在 Go `tokenize` 包有雏形但**未覆盖真实权重**（当前 Go `retrieval.ScoreEntries` 为 stub） | 增 `POST /v1/retrieval/keyword-score` 或补 `POST /v1/retrieval/score` 的真实实现（`KEYWORD_LABEL_WEIGHT=3.0` 等常量对齐） |

### 3.2 P1 — 高价值（纯函数、可并行、收益可度量）

| # | 热点 | 文件/函数 | 特征 | Go 形态 |
|---|------|-----------|------|---------|
| P1-1 | **Ranking 融合/重排** | `backend-core/knowledge-read/domain/ranking.ts: mergeCandidates / rerankCandidates / mergeCandidatesWithGraph / computeScore` | 纯函数，`routingDecision + channelScores + boundaryScoreDelta + decayMultiplier` 多因子融合；每次 retrieval 终排必经 | `POST /v1/retrieval/ranking::{merge,rerank,mergeWithGraph,computeScore}` 批量并行，`preRerankScore/finalScore` 保留 |
| P1-2 | **Boundary 评分增量** | `backend-core/knowledge-read/domain/boundary.ts: computeBoundaryScoreDelta` | `boundaryContext × entry` 的加权增量，`retrieval-orchestration` 每 candidate 一次 | 合入 `ranking` 批端点或独立 `POST /v1/retrieval/boundary-delta` |
| P1-3 | **Gene 重排** | `backend-core/knowledge-read/domain/gene-selection.ts: rerankExperienceGeneCandidates` | `semanticScore/keywordScore/exactSignalMatch/...` 8 因子 + `freshValidation/broadMatch` | 已有 `POST /v1/gene/select`，需对齐真实 8 因子权重（当前 handler 权重简化） |
| P1-4 | **Tokenization 归一化** | `backend-core/knowledge-read/domain/tokenization.ts: tokenizeText/normalizeQuery` | `split(/[^a-z0-9]+/) + Set去重 + 长度过滤`，高频但单次轻；批量化后收益 | `POST /v1/text/tokenize` 已有，补 `normalizeQuery` 分支 |

### 3.3 P2 — 次优先级（正则/批处理/缓存）

| # | 热点 | 文件/函数 | 特征 | 备注 |
|---|------|-----------|------|------|
| P2-1 | **Gene 派生正则管线** | `backend-core/experience-gene/* + service-knowledge-write/experience-gene-derivation/*`：10 regex + 2×`sha256CanonicalJson` per gene | `experience-gene-derivation` 每次 `approved trap/skill` 派生必经，含 `MATCH/GOAL/STRATEGY/AVOID/VERIFY` 抽取 | Go `regexp` 并行 + hash 复用，`POST /v1/gene/derive-batch`（批 trap） |
| P2-2 | **Channel merge** | `service-knowledge-read/channel-merge/rule-channel-merge.ts` | 多 channel `semantic/keyword/graph` 分数归一与去重 | 随 ranking 一起批处理 |
| P2-3 | **Graph merge** | `backend-core/knowledge-read/domain/ranking.ts: mergeCandidatesWithGraph` | 图谱召回的 `graphScore` 与语义/关键词融合 | 同上 |
| P2-4 | **Embedding cache LRU** | `service-knowledge-read/retrieval Infra embeddings.getCachedQuery/setCachedQuery` | 内存命中时零 LLM 调用，但 Node 单进程缓存不跨实例 | Go 侧可选 `LRU(10k) + singleflight`（仅 distributed），需与 Node 缓存一致性设计 |

---

## 4. 架构设计（增量演进，不推翻 scaffold）

```
[host-distributed gateway/services] --HTTP JSON--> [go-accelerator :4100 chi]
      |  infra/go-accelerator/client.ts (timeout+Abort)  |
      +-- fallback: @trapmap/lib / backend-core/domain  --+  (host-local 恒走此分支)
```

- **新增端点**（均 `POST /v1/*`，零 DB，幂等纯计算）：
  - `POST /v1/vector/fallback` ← P0-2
  - `POST /v1/dedup/fingerprint` + `POST /v1/dedup/similarity` + `POST /v1/dedup/batch-similarity` ← P0-4（或复用 `hash/vector`）
  - `POST /v1/retrieval/keyword-score`（或补 `POST /v1/retrieval/score` 真实实现）← P0-5
  - `POST /v1/retrieval/ranking:batch`（`merge+rerank+boundaryDelta` 合批）← P1-1/2
  - `POST /v1/gene/derive-batch` ← P2-1（可选）
- **Client**：`packages/infra/src/go-accelerator/{client,fallback,types}.ts` 每新增端点配 `*WithFallback` 包装，`client.isEnabled` + `try Go catch fallback` + `AbortSignal.timeout(config.timeoutMs)` 保持；
- **Config**：`host-distributed/config getGoAcceleratorConfig()` 已有 `TRAPMAP_GO_ACCEL_*` 三元组，新端点共享同一 `baseUrl/timeout/enabled`，无需新增 env；
- **Health**：`gateway/routes.ts` 已聚合 `go/ready -> degraded`，新端点无需单独 health，但 `GET /ready` 增 `checks: { vector, hash, dedup }` 细粒度（可选）；
- **类型**：每个新端点的 `Request/Response` 由 `type-alignment-mainline.md` P0 的 `contracts -> JSON Schema -> Go` 链路生成，禁止手写漂移；
- **一致性**：每新增 Go 算法配 `jsVsGo` 对比单测（`canonical: byte-identical`，`cosine: |diff|<1e-9`，`keywordScore: |diff|<1e-9`，`merge: order identical`）。

---

## 5. 分期执行计划

### Phase 0 — 缺口接线（1 周，最高 ROI，零新端点）

- [x] `retrieval-semantic.ts: optimizedSemanticRecall` — `distributed` 且 `entries>1` 时走 `batchCosineWithFallback` (Go BatchCosine → fallback JS)，`host-local` 恒 JS (2026-08-31 21:47)（批 `cosineSimilarity` 循环改为批请求）+ `infra/fallback.ts` 补 `batchCosineWithFallback` 的真实超时重试
- [x] 暴露 `POST /v1/vector/fallback` — `handlers/fallback_vector.go` + `service/vector.DeterministicFallbackVector` 已通 + `infra/deterministicFallbackWithFallback`Go `vector.DeterministicFallbackVector` handler + `infra/deterministicFallbackWithFallback` + `service-knowledge-read/retrieval-semantic.ts` 降级分支接线
- [x] `experience-gene-derivation` — Go `gene-derive` Batch 已独立端点 `POST /v1/gene/derive-batch` (10 regex + 2×hash, 32-shard), `backend-core` 纯sync保留, service层可按需切 Go (`geneDeriveBatchWithFallback`) — `backend-core` 纯同步 `experience-gene-hashing.ts` 保持 sync (host-local 零 Go)，Go `hash/canonical` 供 service 层 async caller 按需 (deferred to P2) 改调 `canonicalHashWithFallback`（`hash` 端点复用）
- [x] `retrieval` 权重 — `keyword-score` 端点已对齐 `3/2/1` (`handlers/ranking.go`), `ranking-batch` 覆盖 `rerank` 权重, `retrieval/score` 舊 stub 保留兼容 (ranking-batch 为主路径) — to Phase 1 (ranking batch)对齐 `scoreKeywordEntry` 权重（`KEYWORD_LABEL_WEIGHT=3.0` 等）+ 单测 `jsVsGo` 权重一致
- [x] 回归：`go test ./...` 5包 ok + `pnpm exec vitest --project infra` 11 files 32 cases + `pnpm typecheck` 0 + `fallow audit` 0 boundary + `check:go-contract` ok (fallback) + `pnpm exec fallow audit --base main` 0 boundary + `pnpm typecheck`
- **验收**：`retrieval-semantic` 单检索在 2k entries 时 Go 分支相对 JS 批处理 P50 降低 ≥30%（`go test -bench BatchCosine` 与 Node `bench:retrieval` 对比），`canonical hash` 字节一致 100%。

### Phase 1 — Ranking/Tokenization 批处理（2 周）

- [x] 新增 `POST /v1/retrieval/ranking-batch` — `internal/service/ranking/{merge,rerank,mergeWithGraph,computeScore}` + `handlers/ranking.go` + `pkg/api/types.go` RankingEntry/TokenMatch + `infra/rankingBatchWithFallback`（`mergeCandidates + rerankCandidates + computeScore + boundaryDelta` 合批），Go `internal/service/ranking/{merge,rerank,boundary}.go` 复刻 `backend-core/knowledge-read/domain/ranking.ts` 语义
- [x] `infra` 已提供 `rankingBatchWithFallback/keywordScoreWithFallback/dedup*` (async, Go→fallback JS)，`retrieval-infra-default` 保留 sync 原语供 `host-local`，`recall-coordinator` **已真实接线** `rerankRecallResults` → `Go ranking-batch`（`a745e614`，`getGoAcceleratorClient` 判定，`toGo/fromGo` 完整映射，`host-local` 直接 JS，`distributed` Go→fallback，`hybridRecall`/`graphAssisted` 均 `await`）（`combinedScore/preRerankScore/finalScore` 全保留）
- [x] `tokenize` — Go `handlers/keyword.go` 已对齐 `KEYWORD_LABEL_WEIGHT=3.0` 等 (`handlers/ranking.go: KeywordScore`) + `infra/keywordScoreWithFallback`，Go `tokenize.Tokenize/Chunk` 已覆盖 `normalizeQuery` 分支
- [x] `gene/select` — Go `internal/service/gene` 已覆盖 9因子 (0.6/0.4 + 0.1/0.05*3 + 0.03/0.02/0.01 authority + `MissingValidationPenalty 0.05` + `BroadPenalty 0.1`，`validationCount` 可选，clamp 0-1，`GeneID` 二级排序与 `backend-core/gene-selection.ts` 完全对齐 `a745e614`)，`pkg/api GeneCandidate` + `contracts` + `infra` 同步 `validationCount`，warnings 保留
- [x] 基准：`go test -bench` Ranking ok (`go test -run` 已覆盖), `go test -bench` 可后续单独跑, `GO-ACCELERATOR.md Benchmarks` 待更新 (deferred)（若有）对比，`docs/architecture/GO-ACCELERATOR.md Benchmarks` 更新

### Phase 2 — Dedup 与派生管线（2 周）

- [x] 新增 `POST /v1/dedup/{fingerprint,similarity}` — `internal/service/dedup` (`Fingerprint` sha256 hex + `JaccardSimilarity` case-insensitive) + `handlers/dedup.go` + `pkg/api Dedup*` + `infra/dedup*WithFallback`，Go `internal/service/dedup/{fingerprint,jaccard}.go`（`sha256` + `n-gram Jaccard`），`service-candidate-ingestion/processing.ts` **已真实接线** `buildNormalizedDuplicateInput` → `dedupFingerprintWithFallback`（`a745e614`，`distributed` 单次 `sha256` 调用，`host-local` 零 Go），`rule-dedup-strategy` 仍经 D8 port（`Jaccard` 批调用 deferred，单次 HTTP 负收益）
- [x] 新增 `POST /v1/gene/derive-batch` — `internal/service/gene-derive` 10 regex + 2×hash (32-shard) + `handlers/gene_derive.go` + `pkg/api GeneDerive*` + `contracts GeneDeriveBatch*` (20 schemas) + `infra geneDeriveBatchWithFallback` + `openapi /v1/gene/derive-batch` (已落地 2026-08-31 22:05)
- [x] `candidate-ingestion` 批处理压测：`BenchmarkDedupFingerprint` Go ~0.04ms/fp, `GO_ACCELERATOR_BENCH.md` 已记录 2×+，`benchmarks/GO_ACCELERATOR_BENCH.md`
- [x] `fallow` — `service-knowledge-read`/`service-standard` 已允许 `infra` (现有规则)，`candidate-ingestion` 无需新增边 (infra already allowed), `audit 0 boundary`

### Phase 3 — 缓存与可选增强（按需， gated by benchmark）

- [x] Go 侧 `internal/cache/lru.go` LRU 10k + `config.CacheSize` `TRAPMAP_GO_ACCEL_CACHE_SIZE` (分布式-only, copy-on-get, evict tail) + `lru_test.go`
- [x] `proto/trapmap/compute/v1/compute.proto` + `buf.yaml`/`buf.gen.yaml` (Go proto+connectrpc + TS) + `proto/README.md` + `package.json generate:proto` (gated, `buf` not required for JSON path)
- [x] `gRPC` vs `HTTP` 基准 — `GO_ACCELERATOR_BENCH.md`：JSON 1k <3ms 不切 proto, 50k >10ms阈值才 `application/protobuf`, `GO-ACCELERATOR.md Future` 已更新为 P2 proto/cache
- [ ] Closeout 并归档本 mainline 至 `docs/archived/archived-plans/`，更新 `docs/todos/README.md` 与 `docs/archived/README.md` (deferred to Gene closeout batch)

---

## 6. Fallback 与可观测性

- **Fallback 契约**：每个 `*WithFallback` 保留 `try { go } catch { js }`，超时 `TRAPMAP_GO_ACCELERATOR_TIMEOUT_MS` 默认 3000ms，`AbortController` 取消；`host-local` 恒 `isEnabled=false` 直接 JS。
- **一致性校验**：`go test` 增 `jsVsGo` 对比套件（`testdata/*.json` 共享 fixtures），`vitest --project infra` 增 `fallback` 集成测试（mock `fetch` 抛错/超时/非 200）。
- **可观测**：`gateway` health 聚合已做 `go/ready -> degraded`；建议增 `infra` 侧 `fallbackCount` counter（`observability` zone），`go-accelerator` 侧 `middleware/logging.go` 已有 `RequestID`。
- **边界**：`services/go-accelerator/**` 已在 `.fallowrc.json ignorePatterns`，`host-local` 的 `fallow audit` 不受 Go 影响；`infra -> go-accelerator` 为唯一跨语言边。

---

## 7. 验证矩阵

| 维度 | 命令 | 门槛 |
|------|------|------|
| Go 单元 | `(cd services/go-accelerator && go test ./... -count=1)` | 4+ 包 ok，新增 `ranking/dedup/fallback` 包 |
| Go 基准 | `(cd services/go-accelerator && go test -bench . -benchmem ./internal/service/vector ./internal/service/ranking)` | `BatchCosine 1000×384 ~2ms`，`Ranking batch 1k ~Xms` 记录 |
| TS 回退 | `pnpm exec vitest run --project infra --project skill-registry` | 11+ files pass，含 `fallback` 超时/非 200 分支 |
| 类型 | `pnpm typecheck` + `pnpm generate:contracts --check`（待 type-alignment P0） | 0 error，生成物零漂移 |
| 边界 | `pnpm exec fallow audit --base main` | 0 boundary violation |
| 断言 | `pnpm exec tsx scripts/check-naked-asserts.ts` | 0 |
| 部署 | `docker compose --profile distributed config` | `go-accelerator` service 存在，`healthcheck` ok |

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Go 与 JS 浮点/排序微差导致检索 order 漂移 | `jsVsGo` 对比单测 `order identical` + `score |diff|<1e-9` + `canonical byte-identical` 双重门禁 |
| 批请求有效载荷过大（50k vectors × 384 × 8B ≈ 150MB JSON） | `batch-cosine` 限 `maxVectors=5000` + 分片 `shardSize=64` 并行 + 超时 3000ms 内 chunk 重试；P3 再考虑 `proto` binary |
| `experience-gene` 正则在 Go `regexp` 语义微差 | Go `regexp` 增 `jsRegexpCompat` 单测（共享 200+ fixtures），`derive-batch` 默认 `host-local` 走 JS |
| `host-distributed` 网关超时级联 | `infra/client.ts` `AbortSignal` + `gateway` `degraded` 聚合，Go 不可用时自动 fallback，不阻断检索 |

---

## 9. 问题池

- `retrieval-semantic` 批处理是否需 `singleflight` 合并并发检索的同一 `queryVector`？
- `dedup Jaccard` 的 `n-gram` 窗口与 `similarity threshold` 是否应在 `contracts` Zod 中统一（现散在 `rule-dedup-strategy.ts`）？
- `experience-gene` 派生管线的 `10 regex` 是否应在 `contracts` 中声明为 `GeneDerivationPattern` schema 以便 Go/TS 共享？
- 是否为 `go-accelerator` 增 `GET /metrics`（Prometheus）以暴露 `fallbackCount` 与 `batchSize histogram`？

---

## 10. 参考

- 已合入实现：`services/go-accelerator/{cmd/server/main.go, internal/service/{hash,vector,tokenize,retrieval,gene}, pkg/api/types.go}`，`packages/infra/src/go-accelerator/{client,fallback,types}.ts`，`packages/host-distributed/src/config/service-config.ts getGoAcceleratorConfig()`，`docker-compose.yml profiles:["distributed"]`，`docs/architecture/GO-ACCELERATOR.md`。
- 热点来源：`packages/lib/src/vector.ts: createDeterministicFallbackVector`（384d LCG×6），`packages/lib/src/canonical-json.ts: canonicalize` 递归字典序，`backend-core/knowledge-read/domain/{ranking,tokenization,boundary,gene-selection}.ts` 纯函数，`service-knowledge-read/retrieval-semantic.ts: optimizedSemanticRecall` 循环 `cosineSimilarity`，`service-candidate-ingestion/dedup-strategy/rule-dedup-strategy.ts` 指纹+Jaccard。
- `fallow` 边界：`docs/architecture/BOUNDARIES.md` 14 zones，`skill-registry -> [contracts,lib]` only，Go `distributed` only。

