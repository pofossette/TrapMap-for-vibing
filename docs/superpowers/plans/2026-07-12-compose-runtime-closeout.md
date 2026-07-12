# Compose Runtime Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an isolated real-Compose runtime closeout proving a single `knowledge-write` restart does not interrupt job-runtime and recovers gateway delegation within 60 seconds.

**Architecture:** A compose override limits the runtime to PostgreSQL, gateway, and six internal distributed services while exposing only a parameterized gateway port. A shell orchestrator owns ephemeral port/key/project generation, readiness polling, existing runtime-closeout execution, restart measurement, failure logs, and unconditional Compose teardown.

**Tech Stack:** Docker Compose, POSIX shell, Node.js `fetch`, TypeScript, Vitest.

## Global Constraints

- Do not expose internal service ports to the host or write generated keys, ports, Compose project names, or test artifacts to the repository.
- Always run `docker compose down --volumes --remove-orphans` for the ephemeral project.
- Preserve `Level 2 / transitional-microservice`; the 60-second local threshold proves isolation only, not a production SLO or independent scaling.
- Keep Tranche 7 unchecked until the full real-Compose command matrix passes.

---

### Task 1: Closeout Compose Asset and Static Guard

**Files:**
- Create: `docker-compose.closeout.yml`
- Modify: `scripts/__tests__/distributed-compose-assets.test.ts`

**Interfaces:**
- Consumes: checked-in `docker-compose.yml` service definitions.
- Produces: override selected with `docker compose -f docker-compose.yml -f docker-compose.closeout.yml`; gateway mapping `${TRAPMAP_CLOSEOUT_GATEWAY_PORT}:4000`.

- [ ] **Step 1: Write the failing asset test**

```ts
const closeoutCompose = readRepoFile('docker-compose.closeout.yml');
expect(closeoutCompose).toContain('${TRAPMAP_CLOSEOUT_GATEWAY_PORT}:4000');
expect(closeoutCompose).toContain('gateway:');
expect(closeoutCompose).not.toContain('ports:\n      - "4001:4001"');
```

- [ ] **Step 2: Verify RED**

Run: `rtk pnpm test:file -- scripts/__tests__/distributed-compose-assets.test.ts`

Expected: failure because `docker-compose.closeout.yml` does not exist.

- [ ] **Step 3: Add the minimal override**

```yaml
services:
  gateway:
    ports:
      - "${TRAPMAP_CLOSEOUT_GATEWAY_PORT}:4000"
    restart: "no"
  identity-access: { restart: "no" }
  knowledge-read: { restart: "no" }
  knowledge-write: { restart: "no" }
  candidate-worker: { restart: "no" }
  governance-worker: { restart: "no" }
  outbox-worker: { restart: "no" }
  postgres: { restart: "no" }
```

- [ ] **Step 4: Verify GREEN**

Run: `rtk pnpm test:file -- scripts/__tests__/distributed-compose-assets.test.ts`

Expected: pass.

### Task 2: Ephemeral Runtime Closeout Orchestrator

**Files:**
- Create: `scripts/run-compose-runtime-closeout.sh`
- Modify: `package.json`
- Modify: `scripts/__tests__/closeout-surface.test.ts`

**Interfaces:**
- Consumes: `TRAPMAP_CLOSEOUT_GATEWAY_PORT`, `TRAPMAP_SYSTEM_ADMIN_KEY`, `test:runtime-closeout`.
- Produces: `test:runtime-closeout:compose` with an isolated project and a nonzero exit status on health, runtime-closeout, job-runtime continuity, recovery, or cleanup failure.

- [ ] **Step 1: Write the failing script-surface assertions**

```ts
const script = readRepoFile('scripts/run-compose-runtime-closeout.sh');
expect(script).toContain('docker compose');
expect(script).toContain('down --volumes --remove-orphans');
expect(script).toContain('TRAPMAP_CLOSEOUT_BASE_URL');
expect(script).toContain('knowledge-write');
expect(script).toContain('60000');
```

- [ ] **Step 2: Verify RED**

Run: `rtk pnpm test:file -- scripts/__tests__/closeout-surface.test.ts`

Expected: failure because the closeout script and package command do not exist.

- [ ] **Step 3: Implement the orchestrator**

Use `node -e` with `net.createServer()` to reserve an ephemeral loopback port, and `crypto.randomBytes(32).toString('hex')` for an in-memory key. Set `COMPOSE_PROJECT_NAME=trapmap-closeout-$RANDOM`, export the port/key, start exactly the override service list, poll `${TRAPMAP_CLOSEOUT_BASE_URL}/health`, and invoke `pnpm test:runtime-closeout`.

Install an `EXIT` trap that runs `docker compose ... down --volumes --remove-orphans`. On failure, print `logs --no-color gateway knowledge-write governance-worker outbox-worker`. Restart only `knowledge-write`; poll `/health` and authenticated `/v1/operations/status/async` while it restarts. Retry the authenticated governance command until a successful response or `Date.now() - startedAt >= 60000`, then print the exact recovery duration in milliseconds.

Add:

```json
"test:runtime-closeout:compose": "bash scripts/run-compose-runtime-closeout.sh"
```

- [ ] **Step 4: Verify GREEN**

Run: `rtk pnpm test:file -- scripts/__tests__/closeout-surface.test.ts`

Expected: pass with static guards for cleanup, parameterization, and the measured isolation threshold.

### Task 3: Documentation and Tranche State

**Files:**
- Modify: `docs/todos/observability-traceability-closure.md`
- Modify: `packages/host-distributed/README.md`
- Modify: `docs/architecture/DEPLOYMENT.md`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/operations/REGRESSION-COMMANDS.md`

**Interfaces:**
- Consumes: outcome from `test:runtime-closeout:compose`.
- Produces: exact operator command and real recovery evidence; Tranche 6 correct state; conditional Tranche 7 completion.

- [ ] **Step 1: Correct the existing evidence statement**

Mark Tranche 6 items 2, 5, 6, and 7 as complete and state that prior evidence already covers its implementation, tests, typecheck, eval, docs guards, and Fallow audit. State explicitly that runtime-closeout blocks only Tranche 7.

- [ ] **Step 2: Document the repeatable closeout command**

Add `rtk pnpm test:runtime-closeout:compose` to the service README, deployment, testing, and regression pages. Document generated key/port isolation, automatic teardown, the single-container restart procedure, continuous job-runtime proof, and the 60-second gateway delegation threshold.

- [ ] **Step 3: Record only actual evidence**

After Task 4 passes, record the measured recovery duration and successful command matrix in the active plan, mark all four Tranche 7 items complete, and preserve `Level 2 / transitional-microservice`. If any command fails, leave Tranche 7 unchecked and record the specific blocker instead.

### Task 4: Full Real-Compose Acceptance

**Files:**
- Modify: `docs/todos/observability-traceability-closure.md`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: real environment evidence or a documented failure without false closure.

- [ ] **Step 1: Run focused static verification**

Run: `rtk pnpm test:file -- scripts/__tests__/distributed-compose-assets.test.ts scripts/__tests__/closeout-surface.test.ts`

Expected: pass.

- [ ] **Step 2: Run the requested matrix**

Run sequentially:

```bash
rtk pnpm test:distributed-acceptance
rtk pnpm test:distributed-closeout
rtk pnpm test:runtime-closeout:compose
rtk pnpm test:observability-closeout
rtk pnpm test:deployment-smoke
rtk pnpm typecheck
rtk pnpm eval:smoke
rtk pnpm check:docs-drift
rtk pnpm check:structure
rtk pnpm exec fallow audit --base main
```

- [ ] **Step 3: Close Tranche 7 only on green**

Write the exact runtime recovery measurement and successful results to the active plan, then mark all four remaining Tranche 7 checkboxes complete. Leave the maturity label unchanged.
