# Wave 8 Graph Query Contract-Port Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Wave 8 graph-query migration without a `server -> service-knowledge-read` dependency or a default server memory backend.

**Architecture:** `contracts` owns the backend port and pure graph topology helpers. `service-knowledge-read` owns the memory implementation. A host injects that port into compatibility server composition; server consumes contracts only and keeps its Neo4j/fail-open wrapper local.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, Graphology, Fallow.

## Global Constraints

- `server` imports only `@trapmap/contracts` and `@trapmap/persistence-schema` across package zones.
- `service-knowledge-read` never imports `@trapmap/server`; `server` never imports `@trapmap/service-knowledge-read`.
- `GraphQueryBackend` has one canonical contracts definition; no server re-export or duplicate memory factory remains.
- `service-knowledge-read` owns the sole `createMemoryGraphQueryBackend` implementation and accesses graph documents only through `GraphIndexRepositoryPort`.
- A compatibility server receives a graph backend through `BuildServerOptions`; it must not construct an implicit memory backend when none is supplied.
- Stage only task source, tests, manifest/lockfile, guard, and factual active-plan files. Do not stage `.superpowers/sdd/*`.

---

### Task 1: Move the Port and Pure Graph Core to Contracts

**Files:**
- Create: `packages/contracts/src/domain/graph-query.ts`
- Create: `packages/contracts/src/domain/graph-query.test.ts`
- Modify: `packages/contracts/src/domain/graph-index.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/service-knowledge-read/src/{graph-query,graphology,boundary-normalize,context,index}.ts`
- Test: `packages/contracts/src/domain/graph-query.test.ts`
- Test: `packages/service-knowledge-read/src/graph-query.test.ts`

**Interfaces:**
- Produces from contracts: `GraphQueryBackend`, `GraphQueryBackendHealth`, `GraphQueryRuntimeState`, `GraphQueryExpansionView`, `Graph`, graph topology functions, and boundary normalizers.
- Produces from knowledge-read: only `createMemoryGraphQueryBackend` and its concrete return type.

- [ ] **Step 1: Write a failing contracts test**

Create a contract graph fixture with a trap, skill, and `mitigates` edge. Import
`buildGraphRuntimeSnapshot`, `expandSourcesOneHop`, `calculateSourceRelationStrength`,
and `assertNoHardDependencyCycles` from `@trapmap/contracts`; assert the trap/skill
sources expand, hard strength scores two, and a hard dependency cycle throws the
existing deterministic message.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @trapmap/contracts test --run src/domain/graph-query.test.ts
```

Expected: FAIL because contracts does not yet export graph query helpers.

- [ ] **Step 3: Implement the neutral contract core**

Move the structural types from server `graph-query/backend.ts` and the pure
algorithms from owner `graphology.ts`/`boundary-normalize.ts` into
`contracts/src/domain/graph-query.ts`. Import graph document records from the
adjacent graph-index domain module. Add the four Graphology dependencies to
contracts. Make knowledge-read graph-query import types and helpers from
contracts; delete its copied graphology/boundary files and replace its context
aliases with direct contracts aliases.

- [ ] **Step 4: Verify GREEN**

```bash
pnpm --filter @trapmap/contracts test --run src/domain/graph-query.test.ts
pnpm --filter @trapmap/contracts typecheck
pnpm --filter @trapmap/service-knowledge-read test --run src/graph-query.test.ts
pnpm --filter @trapmap/service-knowledge-read typecheck
```

Expected: all commands pass using source-resolved workspace aliases; no ignored
`dist/` output is generated to make tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/service-knowledge-read pnpm-lock.yaml
git commit -m "refactor: define graph query contract core"
```

### Task 2: Convert Server to Contracts and Injected Backends

**Files:**
- Delete: `packages/server/src/lib/graph-query/{backend,memory-backend}.ts`
- Delete: `packages/server/src/lib/indexing/graph-lite/graphology.ts`
- Modify: `packages/server/package.json`, `pnpm-lock.yaml`
- Modify: `packages/server/src/{app.ts,lib/context.ts,bootstrap/bootstrap-repositories.ts}`
- Modify: server graph-query, indexing, retrieval, label, runtime, and test files importing the deleted sources
- Test: `packages/server/src/bootstrap/bootstrap-repositories.test.ts` or its existing focused bootstrap test
- Test: `packages/server/src/lib/graph-query/{health,neo4j-backend}.test.ts`

**Interfaces:**
- Consumes: canonical contracts port/core and optional `BuildServerOptions.graphQueryBackend`.
- Produces: a server that uses an injected port, omits graph-only channels when absent, and retains Neo4j/fail-open behavior when an injected fallback is present.

- [ ] **Step 1: Write failing injection tests**

Add focused assertions that an injected backend becomes
`app.skillShareer.graphQueryBackend`, bootstrap does not call or import a memory
factory, and a no-backend configuration leaves graph channel registration out
while reporting disabled graph state. Add a Neo4j fail-open test using an
injected memory-like fallback.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @trapmap/server test --run src/bootstrap/bootstrap-repositories.test.ts src/lib/graph-query/health.test.ts src/lib/graph-query/neo4j-backend.test.ts
```

Expected: FAIL because `BuildServerOptions` has no injected graph backend and
bootstrap constructs the local memory backend.

- [ ] **Step 3: Implement contracts-only server consumption**

Add optional `graphQueryBackend` and `graphQuery` options to `BuildServerOptions`.
Use them to initialize compatibility context. Convert every type/helper import
to `@trapmap/contracts`, delete server backend/memory/graphology modules, and
remove Graphology dependencies from server. In bootstrap, register graph
channels only when a backend is injected. When Graph DB is enabled, construct
the local Neo4j primary only with an injected fallback and preserve the current
fail-open/fail-closed health behavior. Do not add a fallback factory.

- [ ] **Step 4: Verify GREEN and boundary compliance**

```bash
pnpm --filter @trapmap/server test --run src/bootstrap/bootstrap-repositories.test.ts src/lib/graph-query/health.test.ts src/lib/graph-query/neo4j-backend.test.ts
pnpm --filter @trapmap/server typecheck
rg -n "@trapmap/service-knowledge-read|createMemoryGraphQueryBackend|graph-query/(backend|memory-backend)" packages/server/src --glob '*.ts'
```

Expected: server tests/typecheck pass; the search has no production match for
knowledge-read, a memory factory, or deleted module imports.

- [ ] **Step 5: Commit**

```bash
git add packages/server pnpm-lock.yaml
git commit -m "refactor: inject graph query into server"
```

### Task 3: Cut Host-Local Over and Close the Exact Allowlist Entry

**Files:**
- Modify: `packages/host-local/src/nest/runtime/{shared-infra,host-services}.ts`
- Modify: host-local composition tests and import-boundary test
- Modify: `scripts/__tests__/compatibility-retirement-guard.test.ts`
- Modify: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`

- [ ] **Step 1: Write a failing host composition assertion**

Assert host-local imports the memory factory only from knowledge-read, keeps its
literal disabled-memory runtime state, and passes its contracts backend into any
compatibility server composition entry.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @trapmap/host-local test --run src/nest/runtime/import-boundary.test.ts src/nest/runtime/host-services.test.ts
```

Expected: FAIL until the server graph-query import and composition injection are removed.

- [ ] **Step 3: Implement and record evidence**

Switch host-local to direct knowledge-read factory import and contracts types.
Remove the exact graph-query server import allowance, retain all other Wave 8
allowlist entries, and append final factual test and Fallow evidence without
marking Wave 8 complete prematurely.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @trapmap/contracts test --run src/domain/graph-query.test.ts
pnpm --filter @trapmap/service-knowledge-read test --run src/graph-query.test.ts src/import-boundary.test.ts
pnpm --filter @trapmap/host-local test --run src/nest/runtime/import-boundary.test.ts src/nest/runtime/host-services.test.ts
pnpm typecheck
pnpm exec fallow audit --base main --format json --quiet 2>/dev/null || true
pnpm check:docs-drift
pnpm check:structure
```

Inspect the Fallow JSON: introduced graph-query boundary/dependency/duplication
findings must be zero. Commit only task files with:

```bash
git add packages/host-local scripts/__tests__/compatibility-retirement-guard.test.ts docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md
git commit -m "refactor: inject owner graph query from host"
```
