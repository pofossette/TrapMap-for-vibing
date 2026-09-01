# Go Tech Stack — TrapMap Gradual Migration

> SSOT for Go service dependencies. This doc is source for `services/*/go.mod` and `fallow`/`complexity` guards.
> Prioritize mature implementation, ban hand-rolled critical paths.

## Toolchain

- Go `1.23` (stdlib `log/slog`, iterators), `golangci-lint`

## Dependencies

| Domain | Pick | Version | Ban |
|---|---|---|---|
| Web | `go-chi/chi v5` | 5.2.1 | gin/echo |
| DB | `jackc/pgx/v5 + pgxpool` | 5.7.4 | database/sql+pq |
| Cache | `hashicorp/golang-lru/v2` + `golang.org/x/sync/singleflight` | 2.0.7 / 0.11 | container/list hand-roll |
| Metrics | `prometheus/client_golang` | 1.20.4 | hand-rolled map |
| Logging | `log/slog` (stdlib) + otel bridge | 1.23 | log.Printf |
| Config | `kelseyhightower/envconfig` | 1.4.0 | os.Getenv hand-roll |
| Tracing | `go.opentelemetry.io/otel` | 1.34.0 | none |
| Validation | `oapi-codegen` + `go-playground/validator` | 2.4.1 / 10.26 | hand-rolled |
| Test | `stretchr/testify` | 1.10.0 | — |

## Anti Large File

- `≤300` per file, `≤400` hard fail, `≤600` per module, `≤30%` per module of total
- `ranking.go 393` is anti-pattern, must split into `merge.go/rerank.go/boundary.go`
- `cmd/server/main.go ≤150`

## File Layout

```
services/knowledge-read-go/internal/{api,query,recall,ranking,assembly,cache}/
  domain/*.go ≤150
  service/*.go ≤180
  port.go ≤50
```

## Commands

```bash
go vet ./...
go test ./... -count=1
golangci-lint run ./...
pnpm check:complexity
pnpm exec fallow audit --base main
```

