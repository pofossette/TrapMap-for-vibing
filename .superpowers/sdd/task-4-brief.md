# Task 4: CI Pipeline + run-ci.ts + Pre-commit Hook Updates

## Task Description

Update CI, local CI runner, and pre-commit hook to incorporate all new tools from Tasks 1-3.

### Part 1: Merge CI jobs

**File:** `.github/workflows/ci.yml`

Current state: Two redundant CI jobs run overlapping commands:
- `architecture-guardrails`: runs `check:docs-drift`, `check:mermaid`, `check:complexity`
- `doc-rules`: runs `check:docs-drift`, `check:mermaid`, `check:structure`

Replace BOTH with a single `doc-guardrails` job:

```yaml
doc-guardrails:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '24'
    - uses: pnpm/action-setup@v3
      with:
        version: 10.33.0
    - run: pnpm install --frozen-lockfile
    - run: pnpm check:docs-drift
    - run: pnpm check:arch-freeze
    - run: pnpm check:deps
    - run: pnpm check:mermaid
    - run: pnpm check:structure
    - run: pnpm check:complexity
    - run: pnpm check:md-lint
    - run: pnpm check:links || true
```

**Important:** The `check:links` step uses `|| true` because the link checker finds pre-existing broken links in archived docs. This makes it informational, not blocking. Once those stale links are cleaned up, remove `|| true`.

### Part 2: Update run-ci.ts

**File:** `scripts/run-ci.ts`

Add new steps to the STEPS array (insert after existing `check:structure` entry):

```typescript
{
  name: 'check:deps',
  command: 'pnpm',
  args: ['run', 'check:deps'],
},
{
  name: 'check:arch-freeze',
  command: 'pnpm',
  args: ['run', 'check:arch-freeze'],
},
{
  name: 'check:md-lint',
  command: 'pnpm',
  args: ['run', 'check:md-lint'],
},
{
  name: 'check:links',
  command: 'pnpm',
  args: ['run', 'check:links'],
},
```

The final STEPS order should be:
1. check:imports
2. typecheck
3. lint (biome check)
4. test:coverage
5. check:docs-drift
6. check:arch-freeze
7. check:deps
8. check:mermaid
9. check:complexity
10. check:structure
11. check:md-lint
12. check:links

### Part 3: Update pre-commit hook

**File:** `.husky/pre-commit`

Add `check:md-lint` after the existing checks:

```sh
#!/usr/bin/env sh

pnpm format || exit 1

# Refresh tracked files in the index so formatting changes are included.
git update-index --again || exit 1

pnpm check:imports || exit 1
pnpm check:mermaid || exit 1
pnpm check:md-lint || exit 1
```

## Context

- Tasks 1-3 added: `check:deps`, `check:arch-freeze`, `docs:api`, `check:md-lint`, `check:links`
- CI currently has 8 jobs. After this change it will have 7 (architecture-guardrails + doc-rules → doc-guardrails)
- The `run-ci.ts` currently has 8 steps; after this change it will have 12
- Pre-commit hook currently runs: format, check:imports, check:mermaid

## Key Files

- `.github/workflows/ci.yml` — merge two jobs into one
- `scripts/run-ci.ts` — add 4 new steps to STEPS array
- `.husky/pre-commit` — add check:md-lint

## Your Job

1. Edit `.github/workflows/ci.yml`: remove `architecture-guardrails` and `doc-rules` jobs, add `doc-guardrails` job
2. Edit `scripts/run-ci.ts`: add the 4 new steps to the STEPS array
3. Edit `.husky/pre-commit`: add `pnpm check:md-lint || exit 1`
4. Verify the CI YAML is valid (no syntax errors)
5. Run `pnpm run ci` locally (or at least the new steps individually) to verify they work
6. Commit your work

## Work From

/home/wunai/Disks/Data/my-project/Trap-Map
