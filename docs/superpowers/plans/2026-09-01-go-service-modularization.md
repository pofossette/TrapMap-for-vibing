# Go Service Modularization — knowledge-read-go Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** [DONE] Deliver module-level Go serviceization for read path (knowledge-read-go) and timely exit function-set compute center (go-accelerator) per go-service-gradual-migration-mainline.md — 6 modules each ≤600 lines / ≤300 per file, staged strangler via gateway.

**Architecture:** Single-repo multi-module Go service (services/knowledge-read-go) with chi + pgx (read-only) + hashicorp/lru + singleflight + prometheus/otel, domain/service/port/handler four-layer per module, consumes contracts Zod SSOT via pkg/api/types.go; gateway TRAPMAP_READ_IMPL off/shadow/dual/go with fallback to Node; go-accelerator retrieval/ranking deprecated and archived.

**Tech Stack:** Go 1.23, chi v5, pgx v5 + pgvector-go, hashicorp/golang-lru/v2, golang.org/x/sync, prometheus/client_golang, otel, kelseyhightower/envconfig, oapi-codegen, zod->json-schema->Go

## Global Constraints

- Read path 50:1 — read owns Go, write stays Node; host-local zero Go dep (fallow ignorePatterns)
- Each module ≤600 lines total, ≤300 per file, ≤400 hard fail; ranking.go 393 anti-pattern must split into merge/rerank/boundary
- Contracts SSOT: packages/contracts Zod -> contracts/json-schema -> services/*/pkg/api/types.go, gate pnpm check:go-contract + generate:contracts:check
- Deployment: TRAPMAP_DEPLOYMENT_PROFILE=distributed + TRAPMAP_GO_*_ENABLED double gate, distributed-only
- Fallback semantics: gateway or infra must fallback to Node on timeout/error, semantically identical (canonicalJsonStringify, cosine 0.6/0.4, Dual 0.15 etc)
- Mature deps only: lru=hashicorp, metrics=prometheus, logging=slog, config=envconfig, no hand-rolled cache/metrics/logging

---

### Task 1: Scaffold knowledge-read-go service

**Files:**
- Create: `services/knowledge-read-go/go.mod`
- Create: `services/knowledge-read-go/go.sum`
- Create: `services/knowledge-read-go/Makefile`
- Create: `services/knowledge-read-go/Dockerfile`
- Create: `services/knowledge-read-go/cmd/server/main.go`
- Create: `services/knowledge-read-go/internal/config/config.go`
- Create: `services/knowledge-read-go/internal/observability/metrics.go`
- Create: `services/knowledge-read-go/internal/observability/logging.go`
- Create: `services/knowledge-read-go/pkg/api/types.go`
- Modify: `docker-compose.yml` (add knowledge-read-go service)
- Modify: `.fallowrc.json` (add go-read-* zones, ignorePatterns)
- Modify: `scripts/complexity-budgets.json` (add lineBudgets)
- Modify: `docs/architecture/GO_TECH_STACK.md` (new file, if missing create)

**Interfaces:**
- Consumes: contracts SSOT (`packages/contracts/src/domain/*.ts` -> json-schema), existing go-accelerator pkg/api/types.go as reference
- Produces: `NewConfig() Config {Port, ReadImpl, DatabaseURL, CacheSize}`; `Metrics` prometheus registry; `Types` Go structs for API; chi router skeleton

- [x] **Step 1: Write failing test for config**

```go
// services/knowledge-read-go/internal/config/config_test.go
package config_test
import ("testing"; "os"; "github.com/stretchr/testify/require"; "trapmap-knowledge-read-go/internal/config")
func TestLoad_Defaults(t *testing.T){
  os.Unsetenv("PORT"); os.Unsetenv("TRAPMAP_READ_IMPL")
  cfg := config.Load()
  require.Equal(t, "4101", cfg.Port)
  require.Equal(t, "off", cfg.ReadImpl)
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/config -run TestLoad -v`
Expected: FAIL missing package

- [x] **Step 3: Write minimal implementation**

```go
// go.mod module trapmap-knowledge-read-go go 1.23
// config.go: type Config struct {Port string `env:"PORT,default=4101"`; ReadImpl string `env:"TRAPMAP_READ_IMPL,default=off"`; ...}
func Load() Config { var c Config; envconfig.Process("", &c); return c }
```

```dockerfile
FROM golang:1.23-bookworm AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /server ./cmd/server
FROM gcr.io/distroless/static-debian12
COPY --from=builder /server /server
EXPOSE 4101
ENTRYPOINT ["/server"]
```

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./... -v` in services/knowledge-read-go
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add services/knowledge-read-go/go.mod services/knowledge-read-go/Makefile services/knowledge-read-go/Dockerfile services/knowledge-read-go/cmd/server/main.go services/knowledge-read-go/internal/config/config.go services/knowledge-read-go/internal/observability/metrics.go services/knowledge-read-go/pkg/api/types.go docker-compose.yml .fallowrc.json scripts/complexity-budgets.json
git commit -m "feat(knowledge-read-go): scaffold modular service (Task 1)"
```

---

### Task 2: Query module (tokenize + embedding) — independent

**Files:**
- Create: `services/knowledge-read-go/internal/query/domain/tokenize.go`
- Create: `services/knowledge-read-go/internal/query/domain/embedding.go`
- Create: `services/knowledge-read-go/internal/query/service/query.go`
- Create: `services/knowledge-read-go/internal/query/port.go`
- Create: `services/knowledge-read-go/internal/query/service/query_test.go`

**Interfaces:**
- Consumes: `cache.Port` (Get/Set), `contracts` tokenization weights 3/2/1, `@trapmap/lib` cosine fallback dim 384
- Produces: `func Tokenize(text string) []string`; `func NormalizeQuery(q string) []string`; `type Service struct{...}; func (s *Service) Plan(ctx context.Context, q string) ([]string, []float64, error)`; `type Port interface { Plan(...) }`

- [x] **Step 1: Write failing test**

```go
func TestTokenize_Split(t *testing.T){
  require.Equal(t, []string{"hello","world"}, tokenize.Tokenize("Hello, World!"))
  require.Equal(t, []string{"trap","map"}, tokenize.NormalizeQuery("trap map a"))
}
func TestEmbedding_Dim(t *testing.T){
  v := embedding.DeterministicFallback("hello", 384)
  require.Len(t, v, 384)
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/query/... -v`
Expected: FAIL undefined

- [x] **Step 3: Write minimal implementation**

```go
// domain/tokenize.go ≤150 lines: regexp \p{L}\p{N}_+, lower, split, filter len>=2, KEYWORD weights const
// domain/embedding.go ≤120 lines: fnv hash -> normalized vector dim, reuse vector.DeterministicFallbackVector
// service/query.go ≤180 lines: deps cache singleflight, Plan calls tokenize + cache Get embedding or DeterministicFallback
```

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/query/... -v`
Expected: PASS + lint file len ≤300

- [x] **Step 5: Commit**

```bash
git add services/knowledge-read-go/internal/query/
git commit -m "feat(knowledge-read-go): query module (Task 2)"
```

---

### Task 3: Recall module (semantic/keyword/graph pg read) — independent

**Files:**
- Create: `services/knowledge-read-go/internal/recall/domain/score.go`
- Create: `services/knowledge-read-go/internal/recall/service/semantic.go`
- Create: `services/knowledge-read-go/internal/recall/service/keyword.go`
- Create: `services/knowledge-read-go/internal/recall/service/graph.go`
- Create: `services/knowledge-read-go/internal/recall/store/pg.go`
- Create: `services/knowledge-read-go/internal/recall/port.go`
- Create: `services/knowledge-read-go/internal/recall/service/recall_test.go`

**Interfaces:**
- Consumes: `query.Port` (for query tokens/vectors), `cache.Port`, `pgxpool.Pool`
- Produces: `type RecallResult struct {Entries []Entry; Source string}`; `func (s *Service) Recall(ctx context.Context, q string, qVec []float64, tokens []string) (RecallResult, error)`; `store.PG.Read(ctx, limit int) ([]Entry, error)` read-only

- [x] **Step 1: Write failing test**

```go
func TestScoreKeyword_Weight(t *testing.T){
  s := score.Keyword("trap map", []string{"trap"}, map[string]bool{"trap":true})
  require.Greater(t, s, 0.5)
}
func TestPg_ReadOnly(t *testing.T){
  // mock pool, ensure query is SELECT only
  require.NotContains(t, store.BuildQuery("trap"), "INSERT")
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/recall/... -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```go
// domain/score.go ≤150 lines: cosine batch via BatchCosine, keyword 3/2/1, graph score boost 0.2
// service/semantic.go ≤180 lines: use store.PG, singleflight, lru, pgvector cosine
// service/keyword.go ≤120 lines
// service/graph.go ≤120 lines
// store/pg.go ≤180 lines: pgxpool, SELECT ... WHERE scope/labels, no INSERT/UPDATE
```

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/recall/... -v` + `golangci-lint run ./internal/recall/...`
Expected: PASS, per-file ≤300

- [x] **Step 5: Commit**

```bash
git add services/knowledge-read-go/internal/recall/
git commit -m "feat(knowledge-read-go): recall module (Task 3)"
```

---

### Task 4: Ranking module (split 393-line anti-pattern) — independent

**Files:**
- Create: `services/knowledge-read-go/internal/ranking/domain/merge.go`
- Create: `services/knowledge-read-go/internal/ranking/domain/rerank.go`
- Create: `services/knowledge-read-go/internal/ranking/domain/boundary.go`
- Create: `services/knowledge-read-go/internal/ranking/service/ranking.go`
- Create: `services/knowledge-read-go/internal/ranking/port.go`
- Create: `services/knowledge-read-go/internal/ranking/service/ranking_test.go`
- Modify: `services/go-accelerator/internal/service/ranking/ranking.go` (add deprecated header, will be split in Task 8)

**Interfaces:**
- Consumes: `recall.RecallResult`, `query tokens`
- Produces: `func Merge(sem, kw []Entry) []RankedEntry`; `func Rerank(cands []RankedEntry, queryTokens []string) []RankedEntry`; `func BoundaryDelta(e Entry, ctx Boundary) float64`; `type Service struct{}; func (s *Service) Rank(ctx context.Context, r RecallResult) ([]RankedEntry,error)`

- [x] **Step 1: Write failing test (golden vs backend-core)**

```go
func TestMerge_Weights(t *testing.T){
  sem := []Entry{{ID:"1", Score:0.8}}; kw:=[]Entry{{ID:"1", Score:0.6}}
  merged := merge.Merge(sem, kw) // 0.6*0.8 +0.4*0.6 =0.72
  require.InDelta(t, 0.72, merged[0].Combined, 0.001)
}
func TestRerank_DualBoost(t *testing.T){
  c := []RankedEntry{{ID:"1", Combined:0.5, Channels:[]string{"semantic","keyword"}}}
  out := rerank.Rerank(c, []string{"trap"})
  require.Greater(t, out[0].Final, 0.5)
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/ranking/... -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```go
// domain/merge.go ≤150 lines: MergeSemanticWeight 0.6 / Keyword 0.4
// domain/rerank.go ≤150 lines: DualChannelRerankBoost 0.15, TokenCoverage 0.1, StaleDecay 0.1
// domain/boundary.go ≤120 lines: context/platform delta, normalize label
// service/ranking.go ≤150 lines: calls domain funcs, sorts by FinalScore
```

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/ranking/... -v`
Expected: PASS, each file ≤200 lines

- [x] **Step 5: Commit**

```bash
git add services/knowledge-read-go/internal/ranking/ services/go-accelerator/internal/service/ranking/
git commit -m "feat(knowledge-read-go): ranking module split 393-line anti-pattern (Task 4)"
```

---

### Task 5: Assembly module (citation/summary/boundary) — independent

**Files:**
- Create: `services/knowledge-read-go/internal/assembly/domain/citation.go`
- Create: `services/knowledge-read-go/internal/assembly/domain/summary.go`
- Create: `services/knowledge-read-go/internal/assembly/service/assemble.go`
- Create: `services/knowledge-read-go/internal/assembly/port.go`
- Create: `services/knowledge-read-go/internal/assembly/service/assemble_test.go`

**Interfaces:**
- Consumes: `ranking.RankedEntry[]`
- Produces: `type Response struct{Entries []RankedEntry; Summary string; Citations []Citation}`; `func (s *Service) Assemble(ctx context.Context, ranked []RankedEntry) (Response,error)`

- [x] **Step 1: Write failing test**

```go
func TestCitation_Build(t *testing.T){
  out := citation.Build([]RankedEntry{{ID:"1", Scope:"global"}})
  require.Len(t, out, 1)
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/assembly/... -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```go
// domain/citation.go ≤150 lines: build citations from boundary/version
// domain/summary.go ≤150 lines: compact summary, control-oriented trim
// service/assemble.go ≤180 lines: orchestrate citation+summary+decay
```

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/assembly/... -v`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add services/knowledge-read-go/internal/assembly/
git commit -m "feat(knowledge-read-go): assembly module (Task 5)"
```

---

### Task 6: Cache module (mature LRU + singleflight) — independent

**Files:**
- Create: `services/knowledge-read-go/internal/cache/lru.go`
- Create: `services/knowledge-read-go/internal/cache/singleflight.go`
- Create: `services/knowledge-read-go/internal/cache/cache_test.go`
- Modify: `services/go-accelerator/internal/cache/lru.go` (add deprecated comment, keep for fallback)
- Modify: `services/go-accelerator/internal/observability/metrics.go` (add prometheus note)

**Interfaces:**
- Consumes: `hashicorp/golang-lru/v2`, `golang.org/x/sync/singleflight`
- Produces: `type Cache struct{lru *lru.Cache; sf singleflight.Group}; func New(size int) *Cache; func (c *Cache) GetOrLoad(key string, load func() ([]float64,error)) ([]float64,error)`; `Len() int`

- [x] **Step 1: Write failing test**

```go
func TestCache_LRU_Evict(t *testing.T){
  c := cache.New(2); c.Set("a", []float64{1}); c.Set("b", []float64{2}); c.Set("c", []float64{3})
  _, ok := c.Get("a"); require.False(t, ok)
}
func TestSingleflight_Dedup(t *testing.T){
  // concurrent GetOrLoad same key calls load once
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/cache -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```go
// lru.go ≤120 lines: wrap hashicorp/lru, no hand-rolled list
// singleflight.go ≤80 lines: wrap singleflight.Group with typed helper
```

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/cache -v`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add services/knowledge-read-go/internal/cache/ services/go-accelerator/internal/cache/
git commit -m "feat(cache): mature LRU+singleflight, deprecate hand-rolled (Task 6)"
```

---

### Task 7: API layer + Gateway strangler — integrates previous modules

**Files:**
- Create: `services/knowledge-read-go/internal/api/handler.go`
- Create: `services/knowledge-read-go/internal/api/middleware.go`
- Create: `services/knowledge-read-go/internal/api/router.go`
- Create: `services/knowledge-read-go/internal/api/handler_test.go`
- Modify: `packages/host-distributed/src/config/service-config.ts` (add ReadServiceConfig)
- Modify: `packages/host-distributed/src/gateway/routes.ts` (TRAPMAP_READ_IMPL proxy)
- Modify: `packages/host-distributed/src/gateway/internal-client.ts` (add knowledge-read-go client)
- Modify: `docs/architecture/GO-ACCELERATOR.md` + `docs/architecture/GO_TECH_STACK.md`

**Interfaces:**
- Consumes: `query.Port, recall.Port, ranking.Port, assembly.Port, cache.Port, config.Config`
- Produces: `chi.Router` with `GET /health /ready /metrics, POST /v1/knowledge/read`; gateway `getReadServiceConfig()` and proxy with breaker fallback to Node

- [x] **Step 1: Write failing test**

```go
func TestHandler_Read_KnownQuery(t *testing.T){
  // POST /v1/knowledge/read {query:"trap map"} -> 200 with entries
  // gateway unit: shadow 5% does not block, go timeout falls back
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api -v` ; `pnpm --filter @trapmap/host-distributed test --run test/gateway`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```go
// handler.go ≤120 lines: decode, call query.Plan -> recall.Recall -> ranking.Rank -> assembly.Assemble, encode
// middleware.go ≤100 lines: rate limit, breaker, logging slog, metrics prometheus
// router.go ≤80 lines: chi.NewRouter().Post("/v1/knowledge/read", h.Read)
// gateway: if config.ReadImpl=="go" proxy to Go, else Node; shadow async, dual compare, breakerStatesSnapshot
```

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./... -v` ; `pnpm typecheck` ; `pnpm exec fallow audit`
Expected: PASS, 0 boundary

- [x] **Step 5: Commit**

```bash
git add services/knowledge-read-go/internal/api/ packages/host-distributed/src/config/service-config.ts packages/host-distributed/src/gateway/ docs/architecture/
git commit -m "feat(knowledge-read-go): api + gateway strangler (Task 7)"
```

---

### Task 8: Function-set compute center exit — deprecate & archive go-accelerator retrieval/ranking

**Files:**
- Modify: `services/go-accelerator/internal/handlers/ranking.go` (add deprecated header + log warn, keep thin proxy to new service)
- Modify: `services/go-accelerator/internal/handlers/retrieval.go` (deprecated)
- Modify: `services/go-accelerator/internal/service/ranking/ranking.go` (split already done, now mark deprecated, add forwarding comment)
- Create: `services/go-accelerator/DEPRECATED.md`
- Modify: `packages/infra/src/go-accelerator/client.ts` (add deprecated note, keep fallback for migration period)
- Modify: `packages/infra/src/go-accelerator/fallback.ts` (fallback now prefers knowledge-read-go when available, else JS)
- Create: `docs/archived/GO_ACCELERATOR_FUNCTION_RETIREMENT.md` (archived history, code snapshot index)
- Modify: `services/go-accelerator/README.md` (add deprecation banner)
- Modify: `docs/todos/go-service-gradual-migration-mainline.md` (check Phase 5, update status)
- Delete: `services/go-accelerator/internal/service/ranking/ranking_test.go` moved? No — keep but mark deprecated; actual large file split already

**Interfaces:**
- Consumes: previous Task 4 ranking split, knowledge-read-go ranking service
- Produces: `DEPRECATED.md` with sunset date, gateway prefers new service

- [x] **Step 1: Write failing test for deprecation**

```go
func TestDeprecated_Header(t *testing.T){
  // GET /v1/retrieval/ranking-batch returns X-Deprecated header
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -v`
Expected: FAIL no header

- [x] **Step 3: Write minimal implementation**

```go
// handlers/ranking.go first line: // Deprecated: use knowledge-read-go/internal/ranking, will be removed 2026-10-01
// add w.Header().Set("X-Deprecated", "use knowledge-read-go")
// DEPRECATED.md: lists retrieval/ranking as sunset, batch-cosine/hash/vector retained
```

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./... -v` ; `pnpm check:go-contract` ; `pnpm check:docs`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add services/go-accelerator/ services/go-accelerator/DEPRECATED.md packages/infra/src/go-accelerator/ docs/archived/ docs/todos/go-service-gradual-migration-mainline.md
git commit -m "chore(go-accelerator): deprecate function-set center, archive history (Task 8)"
```

