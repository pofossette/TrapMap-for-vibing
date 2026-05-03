# Phase 71: Add CLI and Contracts Tests Plus Coverage Tooling - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Derived from test coverage analysis - final integration phase

<domain>
## Phase Boundary

Phase 71 should add tests for CLI commands and contracts schemas, integrate Vitest coverage tooling, and establish coverage thresholds in CI.

This phase is the final integration phase that completes the test coverage initiative with both new tests and tooling.

In scope:
- CLI command tests (`knowledge`, `team`, `http`, `config`, `output`)
- Contracts schema validation tests
- `@vitest/coverage-v8` installation and configuration
- Coverage threshold configuration (70% target)
- CI workflow integration for coverage reporting

Out of scope:
- Adding new CLI commands
- Modifying contracts schema
- Coverage enforcement blocking CI (thresholds are warnings first)
- Codecov or external coverage services

</domain>

<decisions>
## Implementation Decisions

### Why CLI and contracts are grouped with coverage tooling

- CLI tests are lower risk (user-facing, easier to mock)
- Contracts tests are schema validation, not business logic
- Coverage tooling naturally comes last after all tests are in place
- This phase integrates and validates the work from Phases 69 and 70

### Working assumptions

- CLI commands use `@inquirer/prompts` which can be mocked
- Contracts use Zod schemas that can be tested with valid/invalid inputs
- Vitest coverage tooling works with the current test setup

### Target direction

- Achieve 70% line coverage across all packages
- Establish coverage reporting as part of CI
- Create `test:coverage` script for local development
- Document coverage expectations in TESTING.md

</decisions>

<code_context>
## Existing Code Insights

### CLI module coverage status

```
packages/cli/src/
├── index.ts                  ❌ No tests - Entry point
├── lib/
│   ├── input.ts              ❌ No tests - Input handling
│   ├── prompts.ts            ❌ No tests - Interactive prompts
│   ├── http.ts               ❌ No tests - HTTP client
│   ├── config.ts             ❌ No tests - Configuration
│   ├── output.ts             ❌ No tests - Output formatting
│   ├── skill-artifact-export.ts  ❌ No tests
│   └── activation-policy.ts  ✅ Has tests
└── commands/
    ├── knowledge.ts          ❌ No tests
    ├── team.ts               ❌ No tests
    ├── trap.ts               ❌ No tests
    ├── maintenance.ts        ❌ No tests
    ├── auth.ts               ❌ No tests
    ├── evidence.ts           ❌ No tests
    ├── feedback-admin.ts     ❌ No tests
    ├── audit.ts              ❌ No tests
    ├── retrieval.ts          ✅ Has tests
    ├── skill.ts              ✅ Has tests
    ├── operations.ts         ✅ Has tests
    ├── review.ts             ✅ Has tests
    ├── decay.ts              ✅ Has tests
    ├── feedback.ts           ✅ Has tests
    └── member.ts             (covered by commands/)
```

### Contracts module coverage status

```
packages/contracts/src/
├── index.ts                  ✅ Has tests
└── domain/
    ├── knowledge.ts          ❌ No tests
    ├── artifacts.ts          ❌ No tests
    ├── retrieval.ts          ❌ No tests
    ├── team.ts               ❌ No tests
    ├── auth.ts               ❌ No tests
    ├── operations.ts         ❌ No tests
    ├── candidates.ts         ❌ No tests
    ├── maintenance.ts        ❌ No tests
    ├── review.ts             ❌ No tests
    ├── evidence.ts           ❌ No tests
    ├── admin.ts              ❌ No tests
    ├── decay.ts              ❌ No tests
    ├── evals/
    │   ├── report.ts         ❌ No tests
    │   ├── retrieval.ts      ❌ No tests
    │   └── summary.ts        ❌ No tests
    ├── plans.ts              ✅ Has tests
    ├── feedback.ts           ✅ Has tests
    ├── parsing.ts            ✅ Has tests
    ├── conflict.ts           ✅ Has tests
    └── boundary.ts           ✅ Has tests
```

### Current test coverage estimates

| Package | Source Files | Test Files | Coverage |
|---------|-------------|------------|----------|
| server  | 130         | 71         | ~55%     |
| cli     | 23          | 7          | ~30%     |
| contracts | 24         | 7          | ~29%     |

### Coverage tooling setup

```bash
# Install coverage tool
pnpm add -D @vitest/coverage-v8

# vitest.config.ts addition
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/dist/**',
        '**/node_modules/**'
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    }
  }
})
```

</code_context>

<specifics>
## Specific Test Files to Create

### CLI Tests

1. `packages/cli/src/lib/http.test.ts`
   ```typescript
   // Test: request() with various response types
   // Test: Error handling and retries
   // Test: Authentication header injection
   ```

2. `packages/cli/src/commands/knowledge.test.ts`
   ```typescript
   // Test: knowledge list command
   // Test: knowledge get command
   // Test: knowledge submit command
   ```

3. `packages/cli/src/commands/team.test.ts`
   ```typescript
   // Test: team create/list/update commands
   ```

### Contracts Tests

4. `packages/contracts/src/domain/knowledge.test.ts`
   ```typescript
   // Test: knowledgeEntrySchema validation
   // Test: Required fields enforcement
   // Test: Optional fields defaults
   ```

5. `packages/contracts/src/domain/retrieval.test.ts`
   ```typescript
   // Test: retrievalRequestSchema validation
   // Test: Mode validation (semantic/hybrid/graph-assisted)
   ```

### Coverage Tooling

6. Update `vitest.config.ts` with coverage configuration
7. Add `test:coverage` script to root `package.json`
8. Update `.github/workflows/*.yml` for coverage reporting

</specifics>

<deferred>
## Deferred Ideas

- Codecov integration
- Coverage badges in README
- Per-package coverage thresholds
- Coverage trend tracking
- Differential coverage for PRs

</deferred>
