# Stress — go-accelerator HTTP 并发压测（不运行，仅基建）

> 仅基建不自动跑；按需手工执行，输出写入 `benchmarks/results/stress-*.json`（git ignored）。

## 工具选型

- **autocannon**（Node, 零额外服务）为主：`npx autocannon -c 50 -d 10 -p 10 http://localhost:4100/v1/vector/batch-cosine`
- **k6**（可选，Docker）：`docker run --network host -v $PWD/benchmarks/stress/k6:/scripts grafana/k6 run /scripts/batch-cosine.js`
- 两者均仅测 Go 侧 HTTP（chi），不经过 DB；fallback 正确性由 `bench:compare` 覆盖

## 场景

| 脚本 | 端点 | 负载 | 阈值 |
|------|------|------|------|
| `batch-cosine.js` | `POST /v1/vector/batch-cosine` 1k×384 | 50并发 10s | p95 <15ms, p99 <30ms, 0% 5xx |
| `ranking-batch.js` | `POST /v1/retrieval/ranking-batch` 1k entries | 30并发 10s | p95 <20ms |
| `dedup-flood.js` | `POST /v1/dedup/fingerprint` 1k parts | 100并发 10s | p95 <10ms |
| `gene-derive.js` | `POST /v1/gene/derive-batch` 200 traps | 10并发 10s | p95 <50ms |

## 运行（按需）

```bash
# 需先起 Go 服务：TRAPMAP_GO_ACCELERATOR_ENABLED=true pnpm --filter none dev:go || (cd services/go-accelerator && go run ./cmd/server)
pnpm stress:batch-cosine   # autocannon batch-cosine
pnpm stress:ranking
pnpm stress:dedup
pnpm stress:gene-derive
pnpm stress:all            # 串行四场景
k6 run benchmarks/stress/k6/batch-cosine.js  # k6 替代
```

## 限流与隔离

- Go `chi` 已有 `middleware.Timeout(10s)` + `Recoverer` + `RequestID`/`RealIP`
- 新增 `middleware.RateLimit(100 rps)` 为 P1 建议（见性能审视），压测时通过 `RATE_LIMIT=200` 覆盖
- Node 侧对 Go 批请求做 `p-limit(5)` 并发上限（见审视），压测不走 Node，仅 Go 直压
- Vitest 隔离：`benchmarks/stress/*.bench.ts` 不入 `pnpm test`，仅 `pnpm stress:*`
