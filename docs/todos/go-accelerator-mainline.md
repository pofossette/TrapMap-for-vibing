# Go Accelerator Mainline

Active execution surface for Go acceleration plane (distributed-only).

## Status
- Design finalized (2026-08-31)
- Implementation scaffold complete
- Integration: infra client + host-distributed config + docker-compose
- Tests: go test + infra fallback vitest (pending CI)

## Scope (this mainline owns)
- services/go-accelerator/* (Go binary)
- packages/infra/src/go-accelerator/* (TS client + fallback)
- packages/host-distributed/src/config/service-config.ts (Go config)
- docker-compose.yml (go-accelerator service)
- docs/architecture/GO-ACCELERATOR.md

## Not in scope
- host-local changes (must remain Go-free)
- contracts changes (no new shared types beyond go-accelerator internal)
- retrieval DB / pgvector (still in Node)

## Checklist
- [x] Hotspot analysis (hash, vector, tokenize, retrieval, gene)
- [x] Go service scaffold + handlers
- [x] TS client with fallback
- [x] Config + docker-compose + fallow ignore
- [x] Docs
- [ ] go test passing locally
- [ ] infra fallback integration test
- [ ] Gateway health aggregation (optional)
- [ ] Benchmark: JS vs Go (50k vectors batch)
- [ ] Closeout + merge to pre

## Problem Pool
- Embedding still in Node; Go embedding cache could be next.
- gRPC vs HTTP latency tradeoff not yet benchmarked.
