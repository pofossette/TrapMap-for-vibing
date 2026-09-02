# Phase 3 — Go 服务收敛

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> 归属：`architecture-remediation-mainline.md` 的 delegated Phase 3。依赖 P2 网关绞杀器。

**Goal:** 双 Go 收敛为 **compute 纯计算** + **读服务绞杀器**，成熟栈禁手搓，`host-local` 零 Go 依赖。

**探针输入:** 清单 #23-29（Go/Infra）

## Tech Stack（SSOT）

| 域 | 选型 | 版本 | 禁用 |
|---|---|---|---|
| Web | `go-chi/chi v5` | 5.2.1 | gin/echo |
| DB | `jackc/pgx/v5 + pgxpool` | 5.7.4 | database/sql+pq |
| Cache | `hashicorp/golang-lru/v2 + singleflight` | 2.0.7/0.11 | 手搓 |
| Metrics | `prometheus/client_golang` | 1.20.4 | 手写 map |
| Logging | `log/slog` + otel bridge | 1.23 | Printf |
| Config | `kelseyhightower/envconfig` | 1.4.0 | os.Getenv |
| Tracing | `go.opentelemetry.io/otel` | 1.34.0 | — |
| Validation | `oapi-codegen + playground/validator` | 2.4.1/10.26 | 手搓 |

布局 `services/knowledge-read-go/internal/{api,query,recall,ranking,assembly,cache}/{domain,service,port.go}`，`file≤300 module≤600 ratio≤30%`，`cmd/server/main.go≤150`

## 非目标

- 不搬 pgvector 查询至 Go；不重实现 embedding provider

## Sunset

- `go-accelerator` 的 `ranking/retrieval` 已 410，保留代理至 2026-10-01 后删文件；`DEPRECATED.md` 标日期

## Scope

- `services/go-accelerator/` 瘦身仅 `hash/vector/tokenize/dedup/gene`，删 `ranking/retrieval` handlers
- `services/knowledge-read-go/internal/{api,query,recall,ranking,assembly,cache}/*`
- `packages/infra/src/go-accelerator/{client.ts,fallback.ts}`
- `packages/host-distributed/src/config/service-config.ts` `TRAPMAP_READ_IMPL`
- `contracts/json-schema/knowledge-read-go/*` → `pkg/api/types.go`

## Tasks

- [ ] **3.1 go-accelerator 瘦身** — 仅保留 `POST /v1/hash/* /v1/vector/* /v1/text/tokenize /v1/dedup/fingerprint /v1/gene/*`；`retrieval/ranking` 若仍存在则删并在 `DEPRECATED.md` 标 sunset 2026-10-01
- [ ] **3.2 读服务绞杀器** — `query→recall→ranking→assembly→cache` 同进程闭环 6 模块各 ≤600；`api/handler≤120 router≤80 middleware≤100`；`ranking` 已拆 `merge/rerank/boundary` 各 ≤150；`recall` 三通道 + `assembly` 两域复核
- [ ] **3.3 统一 fallback（过渡态明确）** — 保留 `getGoAcceleratorClient` + `getKnowledgeReadGoConfig` 双 client，过渡期 `infra/fallback.ts` 优先 `knowledge-read-go` 再 `compute` 再 `JS`，`host-local` 恒 JS；`optimizedSemanticRecall` 仅 `distributed && entries>1` 时走 Go；计数双写 `Go metrics + Node metrics`
- [ ] **3.4 栈锁死** — `go.mod` 仅白名单依赖，`go vet/test/golangci-lint` 6 包绿，`cmd/main.go≤150`

## 完成标准

- 6 模块各 ≤600 且最大占比 ≤30%；`go test ./... -count=1` 6 包绿；批处理真实打通

## 测试（精确）

```bash
go vet ./... && go test ./... -count=1 && golangci-lint run ./...
pnpm --filter @trapmap/service-knowledge-read test --run test/retrieval-semantic.test.ts
pnpm check:go-contract
```

## 证据

- 变更文件：`services/knowledge-read-go/internal/*` 6 模块, `services/go-accelerator/*` 瘦身, `infra/*` 2
- 测试名：`vector.BatchCosine 2ms/1000x384` bench

## 文档与测试

- [ ] 更新 `docs/architecture/GO_TECH_STACK.md` 与 `GO-ACCELERATOR.md`（compute vs read 边界）；`SYSTEM_TRUTH_SOURCES.md` Go 行
- [ ] `pnpm check:go-contract` 绿

