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
- `POST /v1/vector/cosine`, `POST /v1/vector/batch-cosine`
- `POST /v1/text/tokenize`
- `POST /v1/retrieval/score`
- `POST /v1/gene/select`

## Consistency Guarantee
Go implementations are verified against JS counterparts in `go test` and `infra` vitest fallback tests.
Hash and canonical JSON must be byte-identical for same payload.

## Deployment
- `services/go-accelerator/Dockerfile` multi-stage (golang:1.22 -> distroless)
- `docker-compose.yml` adds `go-accelerator` service with profile `distributed`, depends_on postgres (not needed but for ordering), healthcheck via wget.
- `packages/infra/src/go-accelerator/client.ts` provides typed client with timeout + fallback.

## Observability
- Structured logging via middleware/logging.go
- Gateway health aggregates go-accelerator /ready when enabled.
- Metrics: fallback count (when Go fails, JS used) via infra observability.

## Future
- Add gRPC for lower latency
- Add embedding cache (Go in-memory LRU)
- Add WASM fallback for edge
\n\n## Benchmarks\n\nRun `go test -bench . ./internal/service/vector` — BatchCosine with 1000x384 vectors ~ 2ms (parallel shards) vs 5ms sequential. Fallback metrics exposed via infra observability.\n