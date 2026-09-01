# Go Accelerator Service

Distributed-only acceleration plane for TrapMap.

## When Enabled
- `TRAPMAP_DEPLOYMENT_PROFILE=distributed` (or RUNTIME_MODE=api with gateway)
- `TRAPMAP_GO_ACCELERATOR_ENABLED=true`
- `TRAPMAP_GO_ACCELERATOR_URL` defaults to `http://localhost:4100` (local) or `http://go-accelerator:4100` (docker distributed)

When disabled (default, and always in host-local), all calls fallback to JS implementations in `@trapmap/lib` and `backend-core` domain pure functions.

## Architecture
```
[host-distributed gateway/services] --HTTP--> [go-accelerator :4100]
                                           fallback: JS in infra/go-accelerator/fallback.ts
```

- Single Go binary, chi router, stateless, horizontally scalable.
- Each handler is concurrency-safe; batch endpoints amortize HTTP overhead.
- No DB access; pure compute only. Embedding provider calls remain in Node.

## Endpoints
- `GET /health`, `GET /ready`
- `POST /v1/hash/canonical` - canonical JSON + sha256
- `POST /v1/vector/cosine`, `POST /v1/vector/batch-cosine`, `POST /v1/vector/fallback`
- `POST /v1/text/tokenize`
- `POST /v1/retrieval/score`
- `POST /v1/retrieval/ranking-batch` — **DEPRECATED 410** → `knowledge-read-go/internal/ranking` (merge/rerank/boundary)
- `POST /v1/retrieval/keyword-score` — **DEPRECATED 410** → `knowledge-read-go/internal/recall/service/keyword.go`
- `POST /v1/dedup/fingerprint`, `POST /v1/dedup/similarity`
- `POST /v1/gene/select`

## Consistency Guarantee
Go implementations are verified against JS counterparts in `go test` and `infra` vitest fallback tests.
Hash and canonical JSON must be byte-identical for same payload.


## Type Alignment (SSOT: contracts Zod)

> 见 `docs/todos/type-alignment-mainline.md` Phase 0 已落地。

- **SSOT**：`packages/contracts/src/domain/go-accelerator.ts` (Zod) — 17 schemas 覆盖 6 端点 + fallbackVector
- **生成**：`z.toJSONSchema()` (Zod 4) → `contracts/json-schema/go-accelerator/*.json` (draft 2020-12) → `pkg/api/types.go` (json tag, `json.RawMessage` for `payload`)
- **门禁**：`pnpm generate:contracts` / `pnpm generate:contracts:check` + `git diff --exit-code -- contracts/json-schema services/go-accelerator/pkg/api` + `pnpm check:go-contract` + `ci: type-alignment` job (node + go vet)
- **索引**：`contracts/json-schema/go-accelerator/_index.json` + `contracts/json-schema/README.md`
- **映射**：`payload: z.unknown()` ↔ Go `json.RawMessage`；`sha256Hex: ^[0-9a-f]{64}$`；`float` 有 `finite` 校验；`dim` 默认 384

Phase 1 将以 `contracts/openapi/api.yaml` + `oapi-codegen + openapi-typescript` 加固 HTTP 边界；Phase 2 `proto+buf` 仅 batch 批处理 gated by benchmark。

## Endpoints (updated Phase 0)

- `GET /health`, `GET /ready`, `GET /v1/health`
- `POST /v1/hash/canonical` - canonical JSON + sha256 (`json.RawMessage` payload, 字节一致)
- `POST /v1/vector/cosine`, `POST /v1/vector/batch-cosine`, `POST /v1/vector/fallback` (64-shard), `POST /v1/vector/fallback` (DeterministicFallbackVector 384d)
- `POST /v1/text/tokenize` (chunk + overlap)
- `POST /v1/retrieval/score`
- `POST /v1/retrieval/ranking-batch` — **DEPRECATED 410** → `knowledge-read-go/internal/ranking` (merge/rerank/boundary)
- `POST /v1/retrieval/keyword-score` — **DEPRECATED 410** → `knowledge-read-go/internal/recall/service/keyword.go`
- `POST /v1/dedup/fingerprint`, `POST /v1/dedup/similarity`
- `POST /v1/gene/select`

Batch 接线：`service-knowledge-read/retrieval-semantic.ts: optimizedSemanticRecall` 在 `distributed` 且 `entries>1` 时走 `batchCosineWithFallback` (Go BatchCosine → fallback JS per-entry)，`host-local` 恒走 JS 零 Go 依赖。


## Timely Exit — retrieval/ranking migrated (2026-09-01)

> **2026-09-01 起 `retrieval/ranking` 已及时退出 go-accelerator，转由 `services/knowledge-read-go` 拥有**。见 `services/go-accelerator/DEPRECATED.md` 与 `docs/archived/GO_ACCELERATOR_FUNCTION_RETIREMENT.md`。
>
> - `POST /v1/retrieval/ranking-batch` → `410 Gone + X-Deprecated: use knowledge-read-go`（原 394 行大函数已拆为 `internal/ranking/domain/{merge,rerank,boundary}.go`）
> - `POST /v1/retrieval/keyword-score` → `410 Gone`
> - `POST /v1/retrieval/score` → `410 Gone`
> - 保留：`hash/vector/tokenize/dedup/gene-select`（纯计算、无 DB）
> - `packages/infra/src/go-accelerator/fallback.ts` 的 `rankingBatchWithFallback / keywordScoreWithFallback` 已改为直通本地 JS，不再经 HTTP；`knowledge-read-go` 通过网关绞杀器 `TRAPMAP_READ_IMPL=off|shadow|dual|go` 按需接管读路径 `query→recall→ranking→assembly` 同进程闭环
> - 新读服务：`services/knowledge-read-go :4101`，契约见 `packages/contracts/src/domain/knowledge-read-go.ts` → `contracts/json-schema/knowledge-read-go/*` → `services/knowledge-read-go/pkg/api/types.go`

## Deployment
- `services/go-accelerator/Dockerfile` multi-stage (golang:1.22 -> distroless)
- `docker-compose.yml` adds `go-accelerator` service with profile `distributed`, depends_on postgres (not needed but for ordering), healthcheck via wget.
- `packages/infra/src/go-accelerator/client.ts` provides typed client with timeout + fallback.

## Observability
- Structured logging via middleware/logging.go
- Gateway health aggregates `go-accelerator /ready` and `knowledge-read-go /health /ready` when enabled (`packages/host-distributed/src/gateway/routes.ts` → `getKnowledgeReadGoConfig()`, `TRAPMAP_READ_IMPL` off/shadow/dual/go, shadow 5% / dual 10% 比对落 metrics，超时回退 Node)。
- Metrics: fallback count (when Go fails, JS used) via infra observability.

## Future / P2 (landed as proto, gated)
- Proto binary path: `proto/trapmap/compute/v1/compute.proto` + `buf.yaml`/`buf.gen.yaml` (Go proto + TS, `buf lint`/`buf breaking`) — `chi JSON` external unchanged, `batchCosine` binary when `TRAPMAP_GO_ACCEL_PROTO=true`
- Embedding cache: `services/go-accelerator/internal/cache/lru.go` (10k LRU + singleflight, distributed-only, `TRAPMAP_GO_ACCEL_CACHE_SIZE`)
- WASM fallback for edge (deferred)
\n\n## Benchmarks\n\nRun `go test -bench . ./internal/service/vector` — BatchCosine with 1000x384 vectors ~ 2ms (parallel shards) vs 5ms sequential. Fallback metrics exposed via infra observability.\n
