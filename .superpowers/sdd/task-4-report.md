# Task 4 Report: Shared AI Provider Acceptance

## Status: BLOCKED

Task 4 acceptance evidence was not added to the active plan and no commit was
created. Wave-8 remains open: the `shared-infra.ts` graph-query import from
`@trapmap/server` is still outside this task's scope and has not been removed.

## Baseline

- Starting implementation baseline: `ee5c63e7 refactor: retire server AI providers`.
- Production code was not modified.
- The working tree already contained only `.superpowers/sdd/*` task artifacts.

## Acceptance Results

### Shared package, host-local, and typecheck

Command:

```sh
rtk pnpm --filter @trapmap/ai-providers test && rtk pnpm exec vitest run --project host-local packages/host-local/src/nest/runtime/import-boundary.test.ts packages/host-local/src/nest/runtime/host-services.test.ts && rtk pnpm typecheck
```

Result: PASS.

- `@trapmap/ai-providers`: 3 files, 21 tests passed.
- Host-local import boundary and host services: 2 files, 12 tests passed.
- Root TypeScript check: no errors.

This confirms the shared package and host-local provider/config seam tests pass.

### Deployment, runtime, and eval acceptance

Command:

```sh
rtk pnpm test:deployment-smoke && rtk pnpm test:runtime-foundations && rtk pnpm eval:smoke
```

Initial result: `test:deployment-smoke` could not resolve
`@trapmap/ai-providers` from `packages/server/src/config.ts`. Investigation
showed that `packages/server/package.json` and `pnpm-lock.yaml` correctly
declared the workspace dependency, but the local
`packages/server/node_modules/@trapmap/ai-providers` symlink was absent while
the other workspace links existed. `rtk pnpm install --frozen-lockfile`
restored that symlink without changing tracked files.

Rerun result: BLOCKED by Docker. The non-coordinated deployment portion passed
with 6 files and 135 tests. The PostgreSQL coordinator then failed before
`app.test.ts` or `startup.test.ts` began:

```text
failed to connect to the docker API at unix:///var/run/docker.sock
dial unix /var/run/docker.sock: connect: no such file or directory
```

The same failure occurred when rerun with host-level Docker access. Docker's
default context targets `unix:///var/run/docker.sock`; the daemon/socket is
not available. Because the command is chained with `&&`,
`test:runtime-foundations` and `eval:smoke` did not start and have no passing
acceptance result.

### Fallow architecture audit

Command:

```sh
rtk pnpm exec fallow audit --base main --format json --quiet
```

Result: FAIL (`verdict: fail`, base `main`, head `ee5c63e7`). It reports no
introduced dependency-boundary violation, but the required passing verdict was
not met:

- Introduced dead-code findings: 1 (`FallbackEmbeddings.embed` in
  `packages/ai-providers/src/providers.ts`).
- Introduced complexity findings: 2.
- Introduced duplication clone groups: 3.

The audit also reports inherited issues, including a pre-existing server to
backend-core boundary violation; that violation is marked `introduced: false`.

## Required Follow-up

1. Start or expose the Docker daemon at the active default context, then rerun
   the exact deployment/runtime/eval command.
2. Resolve or explicitly approve the Fallow-introduced findings, then rerun
   the exact Fallow audit until it returns `verdict: pass`.
3. Only after both criteria pass, append the active-plan acceptance evidence.
   That entry must state that the host-local provider/config edge is gone and
   that graph-query ownership still prevents Wave-8 closeout.
