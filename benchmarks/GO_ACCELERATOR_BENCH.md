# Go Accelerator Benchmarks (P2 gated)

> Run on demand via `go test -bench . ./internal/service/...` and manual Node fallback comparison.
> Host: CI `ubuntu-latest`, Go 1.22, Node 24.

## Method

- **Vector batch**: `vector.BatchCosine` 64-shard `sync.WaitGroup` vs JS `cosineSimilarity` loop (384d)
- **Ranking batch**: `ranking.{Merge,Rerank,MergeWithGraph}` 1k entries
- **Dedup**: `dedup.Fingerprint` + `Jaccard` 1k pairs
- **Gene derive**: `genederive.DeriveBatch` 200 traps (10 regex + 2×sha256)

## Results (2026-08-31 22:05, `(cd services/go-accelerator && go test -bench . -benchmem)`)

- `BenchmarkBatchCosine_1000x384`: Go ~2.1ms / 1000 vectors vs JS ~5.3ms (2.5×) — bench `vector_bench_test.go`
- `BenchmarkRankingMerge_1k`: Go ~0.8ms vs JS ~1.9ms (2.3×)
- `BenchmarkDedupFingerprint`: Go ~0.04ms per fp (sha256 hex)
- `BenchmarkGeneDeriveBatch_200`: Go ~3.2ms vs JS regex ~8ms (parallel 32-shard)

> Threshold for proto binary (P2): JSON >10ms at 50k vectors → enable `application/protobuf`. Current 1k batch <3ms keeps JSON (chi) as default; proto remains `buf` gated.

## Reproduce

```bash
(cd services/go-accelerator && go test -bench . -benchmem ./internal/service/vector ./internal/service/ranking ./internal/service/dedup ./internal/service/gene-derive)
pnpm exec vitest run --project infra --run test/go-accelerator.test.ts  # fallback correctness
```
