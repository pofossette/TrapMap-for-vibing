# Server 三分类清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the three-category cleanup of `packages/server` per the frozen spec — delete dead code, migrate ownership to `host-local`, and shrink the compatibility shell.

**Architecture:** Three-wave execution following the spec's 7-step deletion order. Wave 1 (safe deletions): remove compatibility-shell helper, 501-only write route halves, and backend-core re-export facades. Wave 2 (ownership migration): move config, runtime, and buildServer ownership from `packages/server` to `packages/host-local`. Wave 3 (legacy write path migration): split read/write in maintenance and decay, then remove legacy authoritative write routes.

**Tech Stack:** TypeScript, Fastify, NestJS, Vitest, pnpm monorepo

**Spec:** `docs/superpowers/specs/2026-06-27-server-cleanup-three-categories-design.md`

**Plan:** `docs/archived/archived-plans/backend-build-targets-plan.md` Phase 2

---

## File Map

### Files to Delete (Wave 1)

| File | Reason |
|---|---|
| `packages/server/src/routes/compatibility-shell.ts` | Only exports `sendCompatibilityShellUnsupported()` — a 501 response helper with no real business |
| `packages/backend-core/src/modules/index.ts` | Pure re-export facade (`export * from '../<context>/index.js'`) — zero external consumers |
| `packages/backend-core/src/modules/knowledge-read.test.ts` | Tests for the facade — no longer needed after facade deletion |
| `packages/backend-core/src/modules/boundary-ownership.test.ts` | Tests for the facade |
| `packages/backend-core/src/modules/boundary-import-guard.test.ts` | Tests for the facade |
| `packages/backend-core/src/modules/knowledge-read-dist-contract.test.ts` | Tests for the facade |

### Files to Modify (Wave 1)

| File | Change |
|---|---|
| `packages/server/src/routes/decay.ts` | Remove `sendCompatibilityShellUnsupported` import and rewrite the `POST /v1/operations/decay/batch` handler to return 501 directly |
| `packages/server/src/routes/maintenance.ts` | Remove `sendCompatibilityShellUnsupported` import and rewrite the `POST /v1/operations/maintenance/batch` handler to return 501 directly |

### Files to Modify/Create (Wave 2)

| File | Change |
|---|---|
| `packages/server/src/config.ts` | Extract `ServerConfigSchema`, `ServerConfig`, `loadConfig()` ownership — keep as compatibility re-export after extraction |
| `packages/host-local/src/nest/config/config-bridge.ts` | Import from new ownership location instead of `@trapmap/server/config.js` |
| `packages/server/src/app.ts` | Extract route registration, startup sequence, and runtime wiring to host-local |
| `packages/host-local/src/bootstrap/server.ts` | Switch from `buildServer()` to host-local owned composition |

### Files to Modify (Wave 3)

| File | Change |
|---|---|
| `packages/server/src/routes/maintenance.ts` | Split: keep GET `/v1/operations/maintenance/entries` and POST `/v1/admin/reconcile-knowledge-indexes`; remove POST `/v1/operations/maintenance/batch` |
| `packages/server/src/routes/decay.ts` | Split: keep GET `/v1/operations/decay/entries` and POST `/v1/operations/decay/search`; remove POST `/v1/operations/decay/batch` |
| `packages/server/src/routes/review.ts` | Migrate write path to Nest module or delegate to backend-core port |
| `packages/server/src/routes/candidates/resolution.ts` | Migrate write path to Nest module or delegate to backend-core port |

---

## Wave 1: Safe Deletions (可直接删)

These tasks only delete dead code, re-export facades, and inline 501 responses. No business logic changes.

### Task 1: Delete `compatibility-shell.ts` and inline 501 responses

**Context:** `compatibility-shell.ts` exports one function: `sendCompatibilityShellUnsupported()`. It is imported by exactly two files: `decay.ts` (line 25) and `maintenance.ts` (line 33). Both files use it only in their batch write POST handlers, which already just return 501. The read routes in both files are real functionality and must be preserved.

**Files:**
- Modify: `packages/server/src/routes/decay.ts:25,86-95`
- Modify: `packages/server/src/routes/maintenance.ts:33,223-231`
- Delete: `packages/server/src/routes/compatibility-shell.ts`
- Test: `packages/server/src/routes/decay.test.ts`
- Test: `packages/server/src/routes/maintenance.test.ts`

- [ ] **Step 1: Read the current 501 handler in decay.ts to confirm exact code**

Read `packages/server/src/routes/decay.ts` lines 86-95. The current code is:

```typescript
app.post('/v1/operations/decay/batch', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    return sendCompatibilityShellUnsupported(
      reply,
      'decay batch writes',
      'host-distributed authoritative decay service',
    );
  });
```

- [ ] **Step 2: Inline the 501 response in decay.ts**

In `packages/server/src/routes/decay.ts`:

1. Remove the import on line 25:
   ```typescript
   import { sendCompatibilityShellUnsupported } from './compatibility-shell.js';
   ```

2. Replace the `POST /v1/operations/decay/batch` handler body (lines 86-95) with:
   ```typescript
   app.post('/v1/operations/decay/batch', async (request, reply) => {
     const auth = await resolveAuthContext(app.skillShareer, request);
     requirePermission(auth, 'knowledge:update');

     return reply.status(501).send({
       code: 'capability_unsupported',
       message:
         'This server route is a compatibility shell and no longer performs authoritative writes. Use host-distributed authoritative decay service for decay batch writes.',
     });
   });
   ```

- [ ] **Step 3: Inline the 501 response in maintenance.ts**

In `packages/server/src/routes/maintenance.ts`:

1. Remove the import on line 33:
   ```typescript
   import { sendCompatibilityShellUnsupported } from './compatibility-shell.js';
   ```

2. Replace the `POST /v1/operations/maintenance/batch` handler body (lines 223-231) with:
   ```typescript
   app.post('/v1/operations/maintenance/batch', async (request, reply) => {
     const auth = await resolveAuthContext(app.skillShareer, request);
     requirePermission(auth, 'knowledge:update');
     return reply.status(501).send({
       code: 'capability_unsupported',
       message:
         'This server route is a compatibility shell and no longer performs authoritative writes. Use host-distributed authoritative maintenance service for maintenance batch writes.',
     });
   });
   ```

- [ ] **Step 4: Delete `compatibility-shell.ts`**

```bash
rm packages/server/src/routes/compatibility-shell.ts
```

- [ ] **Step 5: Run affected tests to verify no breakage**

```bash
rtk pnpm --filter @trapmap/server test --run src/routes/decay.test.ts src/routes/maintenance.test.ts
```

Expected: All tests pass. The 501 behavior is identical — only the code location changed.

- [ ] **Step 6: Run typecheck to verify no dangling imports**

```bash
rtk pnpm typecheck
```

Expected: No errors. The `compatibility-shell.ts` import was removed before deletion.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/decay.ts packages/server/src/routes/maintenance.ts
git rm packages/server/src/routes/compatibility-shell.ts
git commit -m "refactor: inline 501 responses and remove compatibility-shell helper

The sendCompatibilityShellUnsupported() helper was only used by decay.ts
and maintenance.ts batch write handlers. Inline the 501 response and
delete the helper file.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Delete `backend-core/src/modules` re-export facade

**Context:** `packages/backend-core/src/modules/index.ts` is a pure re-export facade that does `export *` from six context directories. Grep confirms zero external imports of `@trapmap/backend-core/modules` anywhere in the codebase. The facade has its own test files that test boundary import guards, boundary ownership, and knowledge-read re-exports.

**Files:**
- Delete: `packages/backend-core/src/modules/index.ts`
- Delete: `packages/backend-core/src/modules/knowledge-read.test.ts`
- Delete: `packages/backend-core/src/modules/boundary-ownership.test.ts`
- Delete: `packages/backend-core/src/modules/boundary-import-guard.test.ts`
- Delete: `packages/backend-core/src/modules/knowledge-read-dist-contract.test.ts`

- [ ] **Step 1: Confirm zero external consumers**

```bash
grep -rn '@trapmap/backend-core/modules' --include='*.ts' packages/ | grep -v node_modules
```

Expected: No output. No file in the codebase imports from `@trapmap/backend-core/modules`.

Also check docs/README for references:

```bash
grep -rn 'backend-core/modules' docs/ packages/*/README.md README.md
```

If any references exist, note them for documentation update in Task 9.

- [ ] **Step 2: Delete the facade and its tests**

```bash
rm packages/backend-core/src/modules/index.ts
rm packages/backend-core/src/modules/knowledge-read.test.ts
rm packages/backend-core/src/modules/boundary-ownership.test.ts
rm packages/backend-core/src/modules/boundary-import-guard.test.ts
rm packages/backend-core/src/modules/knowledge-read-dist-contract.test.ts
```

- [ ] **Step 3: Check if the `modules/` directory has any other files**

```bash
ls packages/backend-core/src/modules/
```

If empty, remove the directory:

```bash
rmdir packages/backend-core/src/modules/
```

If other files exist, investigate before proceeding — stop and escalate if they contain non-facade code.

- [ ] **Step 4: Run backend-core tests to verify no breakage**

```bash
rtk pnpm --filter @trapmap/backend-core test --run
```

Expected: All tests pass. The deleted tests were testing re-exports from the facade that no longer exists.

- [ ] **Step 5: Run typecheck**

```bash
rtk pnpm typecheck
```

Expected: No errors.

- [ ] **Step 6: Run structure check**

```bash
rtk pnpm check:structure
```

Expected: Passes. If the structure check references `modules/`, update the structure rules.

- [ ] **Step 7: Commit**

```bash
git rm -r packages/backend-core/src/modules/
git commit -m "refactor: delete backend-core modules re-export facade

The modules/index.ts was a pure re-export facade with zero external
consumers. All imports should go through @trapmap/backend-core or
@trapmap/backend-core/<context> directly.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Wave 2: Ownership Migration (先迁后删 — config/runtime)

These tasks migrate ownership of config and runtime from `packages/server` to `packages/host-local`. Per the spec: "先迁 buildServer 依赖 → 再迁 runtime/config owner → 再迁 status/readiness owner."

> **⚠️ ESCALATION NOTE:** These tasks involve architectural ownership decisions. A weak agent should complete the investigation steps (Steps 1-2 in each task) and then STOP and escalate to a strong agent for the actual migration implementation. The strong agent must verify that no bootstrap/config/runtime/status/readiness dependency breaks.

### Task 3: Migrate `server/config.ts` ownership to `host-local`

**Context:** `packages/server/src/config.ts` (368 lines) is the env schema truth source. It exports `ServerConfigSchema`, `ServerConfig`, `loadConfig()`, `buildConfigGovernanceSummary()`, and `ConfigGovernanceSummary`. The only direct external consumer is `packages/host-local/src/nest/config/config-bridge.ts` (line 13: `import { loadConfig, type ServerConfig } from '@trapmap/server/config.js'`).

The config.ts file also imports from several `server/lib/` sub-modules:
- `./lib/ai/index.js` → `loadAiProviderConfig`
- `./lib/graph-query/config.js` → `GraphDbConfigSchema`, `loadGraphDbConfig`
- `./lib/rag-log.js` → `loadRagLogConfig`
- `./lib/runtime/deployment-profile.js` → `resolveDeploymentProfileCompatibility`, `resolveRuntimeDeployment`
- `./lib/user-ops-log.js` → `loadUserOpsLogConfig`

**Files:**
- Read: `packages/server/src/config.ts`
- Read: `packages/host-local/src/nest/config/config-bridge.ts`
- Modify: `packages/host-local/src/nest/config/config-bridge.ts`
- Test: `packages/server/src/config.test.ts`
- Test: `packages/host-local/src/nest/config/config-bridge.test.ts` (if exists)

- [ ] **Step 1: Audit all consumers of `server/config.ts`**

```bash
rtk pnpm typecheck 2>&1 | grep -i 'config' | head -20
```

Search for all import paths:

```bash
grep -rn '@trapmap/server/config' --include='*.ts' packages/ | grep -v node_modules
grep -rn "from.*'\./config\.js'" --include='*.ts' packages/server/src/ | grep -v node_modules | grep -v '.test.'
```

Document all consumers. Per codegraph, the external consumer is only `config-bridge.ts`.

- [ ] **Step 2: Run existing config tests to establish baseline**

```bash
rtk pnpm --filter @trapmap/server test --run src/config.test.ts
```

Expected: All tests pass. Record this as the baseline.

- [ ] **Step 3: STOP — Escalate to strong agent**

The actual migration requires:
1. Deciding whether to move the full `config.ts` to `host-local` or create a shared config seam
2. Handling the transitive dependencies on `server/lib/*` sub-modules
3. Ensuring `packages/server` internal consumers (app.ts, routes) still work
4. Creating a re-export shim at `packages/server/src/config.ts` for backward compatibility

**This is an architecture ownership decision. Escalate.**

---

### Task 4: Migrate `buildServer()` and runtime ownership to `host-local`

**Context:** `packages/server/src/app.ts` exports `buildServer()` (296 lines). It creates a Fastify instance, resolves runtime deployment, registers request/trace hooks, registers all routes, and wires startup/shutdown sequences. Current consumers:

| Consumer | Type |
|---|---|
| `packages/host-local/src/bootstrap/server.ts:22` | Production — Fastify rollback path |
| `packages/server/src/worker.ts:3` | Production — worker entry |
| `packages/server/src/index.ts:3` | Production — server entry |
| `packages/server/scripts/benchmark-graph-backend.ts:7` | Dev tooling |
| `packages/server/src/lib/retrieval/__fixtures__/auth-store-helpers.ts:12` | Test fixture |
| `scripts/test-skill-import-export.ts:18` | Test script |
| `evals/retrieval/lib/adapters.ts:13` | Eval adapter |

**Files:**
- Read: `packages/server/src/app.ts` (296 lines)
- Read: `packages/host-local/src/bootstrap/server.ts` (218 lines)
- Read: `packages/host-local/src/nest/main.ts`
- Test: `packages/host-local/src/bootstrap/server.test.ts`
- Test: `packages/host-local/src/nest/app.test.ts`

- [ ] **Step 1: Run baseline tests**

```bash
rtk pnpm --filter @trapmap/host-local test --run src/bootstrap/server.test.ts
rtk pnpm --filter @trapmap/host-local test --run src/nest/app.test.ts
rtk pnpm test:deployment-smoke
```

Expected: All pass. Record as baseline.

- [ ] **Step 2: Map what `buildServer()` does that belongs to host-local**

Read `packages/server/src/app.ts` and categorize each section per the spec's ownership table:

| Section in app.ts | Spec ownership | Target |
|---|---|---|
| Fastify instance creation (lines 139-147) | host-local | `host-local` owns bootstrap |
| Request/trace header hook (lines 149-155) | host runtime seam | Already in `host-local/src/nest/runtime/request-context.*` |
| Runtime route registration (lines 157-165) | shared seam → host-local | Migrate to host-local |
| SkillShareerServices composition (lines 167-227) | host-local | Host assembly owns service wiring |
| Capability route registration (lines 65-99, 242-244) | host-local | Host owns route mounting |
| 501 not-found handler (lines 246-264) | host-local | Host owns error surface |
| Startup sequence (lines 268-270) | host-local | Host owns lifecycle |
| Graceful shutdown (lines 273-289) | host-local | Host owns lifecycle |
| Error handler (lines 291-293) | shared runtime seam | Keep as shared helper |

- [ ] **Step 3: STOP — Escalate to strong agent**

The actual migration requires:
1. Creating a host-local owned server composition that replaces `buildServer()`
2. Moving route registration, startup sequence, and lifecycle hooks to host-local
3. Keeping `packages/server/src/app.ts` as a thin shim during transition
4. Updating all 7 consumers gradually
5. Ensuring `deployment-smoke` and `runtime-foundations` still pass

**This is the highest-risk migration in the entire plan. Escalate.**

---

### Task 5: Migrate runtime routes and status/readiness surface

**Context:** `packages/server/src/lib/runtime/http-surface.ts` exports `registerRuntimeRoutes()` and `handleRuntimeError()`. These are imported by `app.ts` (lines 29) and used to register `/health`, `/ready`, `/meta/routes` endpoints. Per the spec, status/readiness owner should be host-local, not server.

**Files:**
- Read: `packages/server/src/lib/runtime/http-surface.ts`
- Read: `packages/server/src/lib/runtime/route-surface.ts`
- Read: `packages/server/src/lib/runtime/deployment-profile.ts`
- Test: `packages/server/src/lib/runtime/*.test.ts`

- [ ] **Step 1: Audit runtime module consumers**

```bash
grep -rn 'registerRuntimeRoutes\|handleRuntimeError\|buildRouteSurfaceSummary\|flattenDocumentedRoutes' --include='*.ts' packages/ | grep -v node_modules | grep -v '.test.'
```

Document which files import these symbols.

- [ ] **Step 2: Run baseline runtime tests**

```bash
rtk pnpm --filter @trapmap/server test --run src/lib/runtime/
rtk pnpm test:runtime-foundations
```

Expected: All pass. Record as baseline.

- [ ] **Step 3: STOP — Escalate to strong agent**

Migration requires deciding:
1. Should runtime routes move to a shared seam package or to host-local directly?
2. How to handle the `handleRuntimeError` shared error handler?
3. How to keep backward compatibility during transition?

**This is an architecture ownership decision. Escalate.**

---

## Wave 3: Legacy Write Path Migration (先迁后删 — write routes)

These tasks handle the legacy authoritative write paths that must be migrated before deletion.

> **⚠️ ESCALATION NOTE:** All Wave 3 tasks require strong agent execution. They involve creating new Nest modules or backend-core port implementations, which are architecture decisions.

### Task 6: Migrate `review.ts` write path

**Context:** `packages/server/src/routes/review.ts` has two endpoints:
- `GET /v1/knowledge/review-queue` — **read**, real functionality (lines 31-61)
- `POST /v1/knowledge/review` — **write**, authoritative (lines 63-109)

The write path calls `createReviewApplicationService()` and `reviewService.applyDecision()`. Per the spec, this must be migrated to `host-local` Nest or `backend-core`/service seam before the Fastify version can be deleted.

**Files:**
- Read: `packages/server/src/routes/review.ts` (110 lines)
- Read: `packages/server/src/lib/knowledge/review-application-service.ts`
- Candidate target: `packages/host-local/src/nest/governance-review/governance-review.module.ts`
- Candidate target: `packages/service-governance-review/src/routes.ts`
- Test: `packages/server/src/routes/review.test.ts`

- [ ] **Step 1: Run baseline review tests**

```bash
rtk pnpm --filter @trapmap/server test --run src/routes/review.test.ts
```

Expected: All pass. Record as baseline.

- [ ] **Step 2: Check if Nest governance-review module already exists**

```bash
ls packages/host-local/src/nest/governance-review/ 2>/dev/null
ls packages/service-governance-review/src/routes.ts 2>/dev/null
```

Document what exists.

- [ ] **Step 3: STOP — Escalate to strong agent**

This requires:
1. Creating or extending a Nest module that handles `POST /v1/knowledge/review`
2. Wiring the `createReviewApplicationService` through Nest DI
3. Verifying the Nest route passes the same test scenarios as `review.test.ts`
4. Only then can the Fastify write route be deleted

**Per the spec: "review.ts 和 candidates/resolution.ts 仍是 authoritative write。若弱 agent 误判为 compatibility route 直接删，会破坏 light 真实写链路。"**

---

### Task 7: Migrate `candidates/resolution.ts` write path

**Context:** `packages/server/src/routes/candidates/resolution.ts` has two endpoints:
- `POST /v1/candidates/:candidateId/manual-result` — **write**, authoritative (lines 37-62)
- `POST /v1/candidates/:candidateId/apply-resolution` — **write**, authoritative (lines 65-83)

Both call `attachManualResult()` and `applyResolution()` from `@trapmap/server/lib/candidates/services/resolution-service.js`.

**Files:**
- Read: `packages/server/src/routes/candidates/resolution.ts` (85 lines)
- Read: `packages/server/src/lib/candidates/services/resolution-service.ts`
- Candidate target: `packages/host-local/src/nest/candidate-ingestion/candidate-ingestion.module.ts`
- Candidate target: `packages/service-candidate-ingestion/src/routes.ts`
- Test: `packages/server/src/routes/candidates.test.ts`

- [ ] **Step 1: Run baseline candidates tests**

```bash
rtk pnpm --filter @trapmap/server test --run src/routes/candidates.test.ts
```

Expected: All pass. Record as baseline.

- [ ] **Step 2: Check if Nest candidate-ingestion module already exists**

```bash
ls packages/host-local/src/nest/candidate-ingestion/ 2>/dev/null
ls packages/service-candidate-ingestion/src/routes.ts 2>/dev/null
```

Document what exists.

- [ ] **Step 3: STOP — Escalate to strong agent**

Same rationale as Task 6 — this is an authoritative write path that cannot be deleted without a replacement.

---

### Task 8: Split maintenance.ts and decay.ts read/write

**Context:** Both `maintenance.ts` and `decay.ts` are read-write mixed files:

**maintenance.ts** endpoints:
- `GET /v1/operations/maintenance/entries` — **read**, real (lines 82-215)
- `POST /v1/operations/maintenance/batch` — **write**, already 501 (lines 223-231)
- `POST /v1/admin/reconcile-knowledge-indexes` — **admin**, real write (lines 240-277)

**decay.ts** endpoints:
- `GET /v1/operations/decay/entries` — **read**, real (lines 34-78)
- `POST /v1/operations/decay/batch` — **write**, already 501 (lines 86-95)
- `POST /v1/operations/decay/search` — **read** (POST but query-only), real (lines 102-152)

The 501 batch write handlers can be removed outright (they're already shells). The read routes must stay. The `reconcile-knowledge-indexes` admin endpoint in maintenance.ts is a real write and needs migration.

**Files:**
- Modify: `packages/server/src/routes/maintenance.ts`
- Modify: `packages/server/src/routes/decay.ts`
- Test: `packages/server/src/routes/maintenance.test.ts`
- Test: `packages/server/src/routes/decay.test.ts`

- [ ] **Step 1: Run baseline tests**

```bash
rtk pnpm --filter @trapmap/server test --run src/routes/maintenance.test.ts src/routes/decay.test.ts
```

Expected: All pass. Record as baseline.

- [ ] **Step 2: Remove the 501 batch write handlers**

In `decay.ts`, remove the `POST /v1/operations/decay/batch` handler (lines 86-95). This was already inlined in Task 1 — now delete it entirely.

In `maintenance.ts`, remove the `POST /v1/operations/maintenance/batch` handler (lines 223-231). This was already inlined in Task 1 — now delete it entirely.

- [ ] **Step 3: Assess `POST /v1/admin/reconcile-knowledge-indexes`**

This is a real admin write endpoint (calls `reconcileKnowledgeIndexes`). Per the spec, this cannot be deleted without migration. Document it as a remaining write path.

- [ ] **Step 4: Run tests after 501 handler removal**

```bash
rtk pnpm --filter @trapmap/server test --run src/routes/maintenance.test.ts src/routes/decay.test.ts
```

Expected: Tests that tested the 501 batch endpoints may need to be updated to expect 404 (route no longer exists) instead of 501.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/maintenance.ts packages/server/src/routes/decay.ts
git commit -m "refactor: remove 501 batch write handlers from maintenance and decay routes

These handlers were already returning 501 capability_unsupported.
Removing them entirely since no caller depends on the 501 response.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Wave 4: Documentation and Verification (文档与守卫)

## Wave 4: Audit, Documentation, and Verification (审计、文档与守卫)

### Task 9: Audit `operations/**` legacy route pack

**Context:** `packages/server/src/routes/operations/` contains 13+ route files. Per the spec: "需要逐个区分真实读面、真实写面、纯 compatibility/501，不能整包拍脑袋删。" This task is an audit — not a deletion.

**Files:**
- Read: `packages/server/src/routes/operations/index.ts` (route aggregator)
- Read: Each route file in `packages/server/src/routes/operations/`
- Test: `packages/server/src/routes/operations/index.test.ts`
- Test: `packages/server/src/routes/operations/status.test.ts`

- [ ] **Step 1: Read the operations route aggregator**

Read `packages/server/src/routes/operations/index.ts` to understand which routes are registered.

- [ ] **Step 2: Categorize each operations route file**

For each file in `packages/server/src/routes/operations/`, classify as:

| File | Category | Evidence |
|---|---|---|
| `status.ts` | Read — real | Runtime/operator status surface |
| `stats.ts` | Read — real | Statistics endpoint |
| `audit.ts` | Read — real | Audit log endpoint |
| `badcases.ts` | Read — real | Badcase listing |
| `knowledge-legacy.ts` | **Investigate** | May have mixed read/write |
| `artifacts-activate.ts` | **Investigate** | May have real write logic |
| `artifacts-export.ts` | Read — real | Export endpoint |
| `artifacts-import.ts` | **Investigate** | May have real write logic |
| `capsule-index.ts` | **Investigate** | May have real write logic |
| `migrate.ts` | **Investigate** | May have real write logic |
| `skill-edit.ts` | **Investigate** | May have real write logic |
| `skill-review.ts` | **Investigate** | May have real write logic |
| `status-phase3.ts` | **Investigate** | May be 501 or real |

- [ ] **Step 3: For each "Investigate" file, check if it uses `sendCompatibilityShellUnsupported` or returns 501**

```bash
grep -n 'sendCompatibilityShellUnsupported\|capability_unsupported\|status(501)' packages/server/src/routes/operations/*.ts
```

Files that ONLY return 501 can be scheduled for deletion in Wave 1 style. Files with real write logic must be escalated.

- [ ] **Step 4: Document findings**

Create a categorization table and include it in the commit message or a follow-up comment. This becomes input for the strong agent's migration plan.

- [ ] **Step 5: Run operations tests**

```bash
rtk pnpm --filter @trapmap/server test --run src/routes/operations/
```

Expected: All pass.

- [ ] **Step 6: Commit the audit notes (no code changes)**

```bash
git commit --allow-empty -m "docs: audit operations/** route pack categorization

Identified read-only, write-only-501, and real-write routes in
packages/server/src/routes/operations/. See task 9 notes for details.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Update documentation to reflect cleanup

**Context:** After Waves 1-3, update documentation to reflect the new state. Per the spec's documentation requirements and `backend-build-targets-plan.md` Phase 2 doc requirements.

**Files:**
- Modify: `docs/archived/archived-plans/backend-build-targets-plan.md` — historical source for completed Phase 2 items
- Modify: `docs/reference/REPO_STRUCTURE.md` — if modules/ directory removed
- Modify: `docs/PACKAGES.md` — update `packages/server` and `packages/backend-core` descriptions
- Modify: `packages/server/README.md` — note removed compatibility shell
- Modify: `packages/backend-core/README.md` — note removed modules facade
- Check: `docs/reference/SYSTEM_TRUTH_SOURCES.md`

- [ ] **Step 1: Run docs drift check**

```bash
rtk pnpm check:docs-drift
```

If failures, fix the drift.

- [ ] **Step 2: Update `backend-build-targets-plan.md`**

Check off completed items in Phase 2:
- [x] 删除 `packages/backend-core/src/modules/*.ts` compatibility re-export facade
- [x] 删除 compatibility-shell.ts helper
- [x] 已退化为 501 的 batch write route 已移除

- [ ] **Step 3: Update package READMEs**

In `packages/server/README.md`:
- Note that `compatibility-shell.ts` has been removed
- Note that 501 batch write handlers have been removed
- Note remaining write paths (review, candidates/resolution, reconcile-knowledge-indexes)

In `packages/backend-core/README.md`:
- Note that `src/modules/` facade has been removed
- Confirm all imports go through `@trapmap/backend-core` or `@trapmap/backend-core/<context>`

- [ ] **Step 4: Run full doc and structure checks**

```bash
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

Expected: Both pass.

- [ ] **Step 5: Commit**

```bash
git add docs/archived/archived-plans/backend-build-targets-plan.md docs/reference/ docs/PACKAGES.md packages/server/README.md packages/backend-core/README.md
git commit -m "docs: update docs to reflect Phase 2 cleanup progress

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Final verification matrix

**Context:** Run the full verification matrix from the spec to confirm no regressions.

- [ ] **Step 1: Connector seam tests**

```bash
rtk pnpm --filter @trapmap/host-local test --run src/nest/adapters/adapter-factory.test.ts
```

Expected: Pass.

- [ ] **Step 2: Request/trace propagation tests**

```bash
rtk pnpm --filter @trapmap/host-local test --run src/nest/runtime/request-context.test.ts
```

Expected: Pass.

- [ ] **Step 3: Light host cutover tests**

```bash
rtk pnpm --filter @trapmap/host-local test --run src/bootstrap/server.test.ts
rtk pnpm --filter @trapmap/host-local test --run src/nest/app.test.ts
```

Expected: Pass.

- [ ] **Step 4: Server legacy route tests**

```bash
rtk pnpm --filter @trapmap/server test --run src/routes/review.test.ts src/routes/candidates.test.ts src/routes/maintenance.test.ts src/routes/decay.test.ts
```

Expected: Pass.

- [ ] **Step 5: Deployment smoke**

```bash
rtk pnpm test:deployment-smoke
```

Expected: Pass.

- [ ] **Step 6: Typecheck**

```bash
rtk pnpm typecheck
```

Expected: Pass.

- [ ] **Step 7: Doc and structure guards**

```bash
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

Expected: Both pass.

---

## Execution Summary

| Wave | Tasks | Agent Level | Risk |
|---|---|---|---|
| Wave 1: Safe Deletions | Task 1-2 | Weak agent OK | Low |
| Wave 2: Ownership Migration | Task 3-5 | **Strong agent required** | High |
| Wave 3: Legacy Write Paths | Task 6-8 | **Strong agent required** | High |
| Wave 4: Audit, Docs, Verify | Task 9-11 | Weak agent OK | Low |

**Weak agent can execute:** Tasks 1, 2, 8 (501 removal only), 9, 10, 11
**Must escalate to strong agent:** Tasks 3, 4, 5, 6, 7 (all ownership migrations and write path replacements)

## Spec Requirements Not Covered By This Plan

The following spec items require multiple sessions and are tracked by `backend-build-targets-plan.md` Phases 2-4:

1. **Full buildServer migration** (Task 4 is investigation-only; implementation is a separate plan)
2. **review.ts and candidates/resolution.ts Nest migration** (Tasks 6-7 are investigation-only)
3. **host-local Fastify rollback path closure** (requires default script cutover — Phase 2 Track B)
4. **packages/server final shrink** (depends on all migrations completing — Phase 2 Track B/C)
5. **Connector seam unification** (Phase 2 Track D — distributed connector convergence)
