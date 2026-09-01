# Proto (P2 gated, optional binary path)

> SSOT remains `packages/contracts/src/domain/go-accelerator.ts` (Zod). Proto is an **internal binary projection** for high-throughput batch (50k vectors) where JSON becomes >10ms bottleneck (benchmark gated).

- `proto/trapmap/compute/v1/compute.proto` — `BatchCosine` + `DedupFingerprint` (JSON external contract unchanged, `protojson` transcoding keeps chi JSON wire)
- `buf.yaml` — `lint STANDARD` + `breaking FILE` against `main`
- `buf.gen.yaml` — generates Go (`protocolbuffers/go` + `connectrpc/go`) and TS (`protocolbuffers/js`) — single `buf generate` produces both (42-service pattern)
- CI: `buf lint && buf breaking --against origin/main` (opt-in, only when `proto/**` changes)
- Infra binary preference: `packages/infra/src/go-accelerator/client.ts` `batchCosine` can opt `application/protobuf` + `arrayBuffer` when `TRAPMAP_GO_ACCEL_PROTO=true`, fallback to JSON

See `docs/todos/type-alignment-mainline.md` P2.
