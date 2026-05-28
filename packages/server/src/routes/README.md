# Server Route Layout

Routes are thin Fastify modules. They parse requests, check auth/permissions, and delegate to `lib/`.

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
