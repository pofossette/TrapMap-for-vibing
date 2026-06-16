# Server Route Layout

Routes are the server's `interfaces/http` layer. They are thin Fastify modules that parse requests, check auth/permissions, and delegate to `lib/`.

## Ownership Rule

Routes may do only these things:

- parse transport input and map it to command/query payloads
- run schema validation and auth/permission gates
- resolve actor/request context needed by downstream services
- delegate to application services, read-side assemblers, or operator helpers
- map results/errors back to HTTP responses

Routes do not own:

- multi-step write orchestration
- bootstrap/runtime/process supervision
- queue recovery or worker lifecycle
- read-model assembly for write-side workflows

## Directory Rule

- Single-file routes stay as `routes/<domain>.ts`.
- A route group with multiple sub-operations becomes `routes/<domain>/`.
- Route tests are colocated with the route file unless the test is a cross-route smoke test.

## Current Route Groups

| Path | Responsibility |
|---|---|
| `routes/candidates/` | Candidate submit, query, duplicate lookup, and resolution |
| `routes/operations/` | Operator/admin operations such as status, migrate, audit, artifact import/export/activate |
| `routes/*.ts` | Flat route modules for domains that do not need sub-operation files |

## Layer Mapping By Heavy Context

| Context | Route responsibility |
|---|---|
| `knowledge` | validate knowledge/trap/review/decay requests, authorize, delegate to shared application services |
| `candidate ingestion` | accept submissions and operator decisions, then delegate to candidate services; recovery/re-enqueue is not an HTTP concern |
| `feedback/remediation` | expose command/query endpoints without embedding remediation workflow logic in handlers |
| `operations/runtime` | surface runtime/admin interfaces, but runtime state calculation still comes from infrastructure modules |
