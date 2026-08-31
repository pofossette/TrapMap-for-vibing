# OpenAPI Boundary (generated check)

> SSOT: `packages/contracts/src/domain/go-accelerator.ts` (Zod) → `contracts/json-schema/go-accelerator/*.json` → `contracts/openapi/api.yaml` (boundary projection).
> This spec is the source for:
> - Go: `oapi-codegen -generate types,chi-server -package api -o pkg/api/oapi_gen.go contracts/openapi/api.yaml` (`x-go-type` maps `Sha256Hex` etc.)
> - TS: `openapi-typescript contracts/openapi/api.yaml -o packages/infra/src/go-accelerator/oapi.d.ts` (zero-runtime) + `openapi-fetch` client

## Usage

```bash
pnpm generate:openapi            # validates api.yaml + generates oapi_gen.go + oapi.d.ts (if tools present, else placeholder)
pnpm generate:openapi:check      # CI drift gate: git diff --exit-code -- contracts/openapi/api.yaml pkg/api/oapi_gen.go infra/oapi.d.ts
pnpm generate:contracts:check    # also validates Zod->JSON Schema still in sync
```

`api.yaml` lists all `go-accelerator` HTTP endpoints (13 paths) including new P1 batch endpoints:
`POST /v1/retrieval/ranking:batch`, `POST /v1/retrieval/keyword-score`, `POST /v1/dedup/{fingerprint,similarity}`.
It reuses JSON Schema `$ref` semantics via `components/schemas` and `x-go-type: Sha256Hex / json.RawMessage`.

See `docs/todos/type-alignment-mainline.md` Phase 1.
