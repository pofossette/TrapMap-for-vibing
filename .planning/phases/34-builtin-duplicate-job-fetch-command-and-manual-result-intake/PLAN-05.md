---
wave: 5
depends_on:
  - 34-01
  - 34-02
  - 34-03
  - 34-04
files_modified: []
autonomous: true
---

# Plan 34-05: Verification and Integration Testing

## Objective

Verify all Phase 34 components work together correctly by running builds, type checks, and basic endpoint tests.

## Context

Plans 34-01 through 34-04 implemented:
- Domain types for bundle response and manual result
- Store functions for manual result persistence
- Server endpoints for bundle fetch and result intake
- CLI commands for operator workflow

This plan verifies the complete integration.

## Tasks

### Task 1: Build all packages

<read_first>
- All modified files from previous plans
</read_first>

<acceptance_criteria>
- `pnpm --filter @trapmap/contracts build` succeeds with no errors
- `pnpm --filter @trapmap/server build` succeeds with no errors
- `pnpm --filter @trapmap/cli build` succeeds with no errors
</acceptance_criteria>

<action>
Run build commands for all three packages:

```bash
pnpm --filter @trapmap/contracts build
pnpm --filter @trapmap/server build
pnpm --filter @trapmap/cli build
```

</action>

### Task 2: Verify type exports

<read_first>
- packages/contracts/src/domain/candidates.ts
</read_first>

<acceptance_criteria>
- All new types are exported from `@trapmap/contracts`
- TypeScript can import types without errors
</acceptance_criteria>

<action>
Create a test file to verify imports work:

```bash
# Verify types are importable
node -e "
const contracts = require('@trapmap/contracts');
console.log('ManualResultSubmissionSchema:', typeof contracts.ManualResultSubmissionSchema);
console.log('DuplicateJobBundleResponseSchema:', typeof contracts.DuplicateJobBundleResponseSchema);
console.log('ManualResultResponseSchema:', typeof contracts.ManualResultResponseSchema);
"
```

</action>

### Task 3: Verify CLI command registration

<read_first>
- packages/cli/src/commands/skill.ts
</read_first>

<acceptance_criteria>
- `trapmap skill duplicate-job --help` shows fetch and resolve subcommands
- `trapmap skill duplicate-job fetch --help` shows correct options
- `trapmap skill duplicate-job resolve --help` shows required options
</acceptance_criteria>

<action>
Run CLI help commands to verify registration:

```bash
# Build CLI first
pnpm --filter @trapmap/cli build

# Check command structure
pnpm --filter @trapmap/cli exec trapmap skill duplicate-job --help
pnpm --filter @trapmap/cli exec trapmap skill duplicate-job fetch --help
pnpm --filter @trapmap/cli exec trapmap skill duplicate-job resolve --help
```

</action>

### Task 4: Verify server route registration

<read_first>
- packages/server/src/routes/candidates.ts
- packages/server/src/app.ts
</read_first>

<acceptance_criteria>
- `/meta/routes` endpoint includes new routes
- Server starts without errors
</acceptance_criteria>

<action>
Start server and check routes:

```bash
# Start server in background
pnpm --filter @trapmap/server dev &
sleep 3

# Check routes endpoint
curl -s http://localhost:3000/meta/routes | grep -E "duplicate.*bundle|manual-result"

# Stop server
kill %1
```

</action>

## Verification

```bash
# Full build
pnpm build

# Type check
pnpm --filter @trapmap/contracts typecheck
pnpm --filter @trapmap/server typecheck
pnpm --filter @trapmap/cli typecheck

# CLI commands visible
pnpm --filter @trapmap/cli exec trapmap api:list | grep "duplicate-job"
```

## Success Criteria Summary

1. All packages build without errors
2. New types are importable from `@trapmap/contracts`
3. CLI shows `skill duplicate-job fetch` and `skill duplicate-job resolve` commands
4. Server routes include `/v1/duplicates/:candidateId/bundle` and `/v1/candidates/:candidateId/manual-result`

## Files Modified

None - verification only