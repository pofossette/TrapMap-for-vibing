# Contracts JSON Schema (generated)

> **SSOT**: `packages/contracts/src/domain/go-accelerator.ts` (Zod).
> **Generated**: `contracts/json-schema/go-accelerator/*.json` (draft 2020-12).
> **Generator**: `packages/contracts/scripts/generate-json-schema.ts` via `z.toJSONSchema()` (Zod 4).

## Usage

```bash
pnpm generate:contracts              # regenerate all schemas
pnpm generate:contracts:check        # CI drift gate (fails on diff)
git diff --exit-code -- contracts/json-schema  # optional extra gate
```

`contracts/json-schema/go-accelerator/_index.json` lists all 17 schemas + generation timestamp.
Each schema's `$schema` is `https://json-schema.org/draft/2020-12/schema` and `title` matches
`goAcceleratorSchemas` key for quicktype/go-jsonschema consumers.

## Go mapping

- `payload: z.unknown()` → Go `json.RawMessage` (preserves arbitrary JSON, validated via `canonicalJsonStringify` byte check)
- `sha256Hex` → Go `string` + `UnmarshalJSON` regex `^[0-9a-f]{64}$`
- `float` scores → Go `float64` with `finite` guard (NaN/Inf rejected)

See `docs/todos/type-alignment-mainline.md` Phase 0 for full pipeline.
