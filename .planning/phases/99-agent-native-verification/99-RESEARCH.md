# Phase 99: Agent-Native Verification - Research

**Researched:** 2026-05-06
**Domain:** Verification / Integration testing for Phase 96-98 agent-native features
**Confidence:** HIGH

## Summary

Phase 99 is a verification-only phase that validates the end-to-end correctness of Phases 96 (`trapmap load`), 97 (`trapmap init`), and 98 (SKILL.md rewrite). The research reveals a critical sequencing constraint: **only Phase 96 has been executed**. Phases 97 and 98 have CONTEXT.md files but no implementation commits. This means Phase 99 must be designed to accommodate partial execution -- it should validate whatever exists from the upstream phases at the time it runs.

Phase 96 is complete and well-tested (321 CLI tests passing, TypeScript compiles clean, code review completed with all findings resolved via Plans 06-07). The `trapmap load` command is registered, the markdown formatter produces correct output, and integration tests exercise the real formatter via `vi.importActual`. The main gaps for Phase 99 verification of Phase 96 are: (1) scripts/assets edge cases in the formatter have no dedicated test coverage, (2) capsule fallback rendering is untested in integration, and (3) the `packages/skills/` copy of SKILL.md does not mention `trapmap load` (only `.claude/skills/` does).

**Primary recommendation:** Structure Phase 99 as a verification checklist with three independent workstreams -- one per upstream phase -- where Phase 97/98 workstreams execute only after those phases complete, while Phase 96 verification can proceed immediately.

## User Constraints (from CONTEXT.md)

### Locked Decisions (from 99-CONTEXT.md)
- Verify Phase 96-98 all implementations' end-to-end correctness
- Extend markdown-formatter test coverage for scripts/assets edge cases
- Verify all CLI tests pass
- Verify TypeScript compilation passes
- Verify SKILL.md rewrite completeness

### Claude's Discretion
- Test structure and verification approach
- Specific test cases to add
- Verification order and grouping

### Deferred Ideas (OUT OF SCOPE)
- None explicitly stated, but Phase 99 defers to upstream phase scope for feature decisions

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| V99-01 | Verify `trapmap load` command end-to-end correctness | Phase 96 fully implemented; load.ts + markdown-formatter.ts + tests exist and pass |
| V99-02 | Extend markdown-formatter test coverage for scripts/assets edge cases | Formatter handles activationRefs (references, assets, scripts) but tests only cover references path |
| V99-03 | Verify all CLI tests pass | 321 tests currently passing across 16 test files |
| V99-04 | Verify TypeScript compilation passes | Full monorepo typecheck clean (0 errors) |
| V99-05 | Verify `trapmap init` command functionality | Phase 97 NOT YET EXECUTED -- init.ts does not exist |
| V99-06 | Verify SKILL.md rewrite completeness | Phase 98 NOT YET EXECUTED -- packages/ SKILL.md missing `trapmap load`; `artifacts.md` and `retrieval.md` still present in packages/skills/ |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CLI command registration | CLI (packages/cli) | -- | Commands are defined and tested in CLI package |
| Markdown formatter output | CLI (packages/cli) | -- | Formatter is pure function in lib/markdown-formatter.ts |
| SKILL.md content correctness | Skills (.claude/skills + packages/skills) | -- | Two copies must stay in sync |
| TypeScript type safety | Build system | -- | Validated via `pnpm typecheck` across monorepo |
| Test suite health | Test framework (vitest) | -- | All packages share vitest config pattern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | (workspace) | Test runner | Project standard test framework, configured per-package [VERIFIED: vitest.config.ts exists] |
| commander | (workspace) | CLI framework | Used for all CLI commands including load [VERIFIED: load.ts imports Command] |
| @trapmap/contracts | (workspace) | Shared schemas | Zod schemas for GraphPlanSearchResponse etc. [VERIFIED: load.ts imports from contracts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | (workspace) | Type checking | `pnpm typecheck` for all verification gates |

### Installation
No new packages needed -- this phase uses existing test and typecheck infrastructure.

## Architecture Patterns

### System Architecture Diagram

```
Phase 96 artifacts (EXISTING):
  packages/cli/src/commands/load.ts ──> packages/cli/src/lib/markdown-formatter.ts
          │                                       │
          ├── registerLoadCommand()               ├── formatLoadContext()
          ├── calls /v3/retrieval/search          ├── escapeMarkdown()
          └── printsResult()                      └── truncateText()

Phase 97 artifacts (NOT YET IMPLEMENTED):
  packages/cli/src/commands/init.ts ──> agent detection + skill install

Phase 98 artifacts (NOT YET IMPLEMENTED):
  SKILL.md rewrite ──> delete retrieval.md + artifacts.md from both locations

Phase 99 verification flow:
  ┌──────────────────────────────────────────────────┐
  │                 Verification Gate                  │
  ├─────────────┬─────────────┬───────────────────────┤
  │ Phase 96    │ Phase 97    │ Phase 98              │
  │ (READY)     │ (PENDING)   │ (PENDING)             │
  │             │             │                       │
  │ 1. Tests    │ 1. Tests    │ 1. SKILL.md content   │
  │ 2. Typecheck│ 2. Typecheck│ 2. File deletions     │
  │ 3. Formatter│ 3. CLI help │ 3. Sync check         │
  │ 4. Cmd reg  │ 4. Cmd reg  │ 4. Reference map      │
  └─────────────┴─────────────┴───────────────────────┘
           │             │              │
           └─────────────┴──────────────┘
                         │
                    Final gate:
                    pnpm test + pnpm typecheck + pnpm eval:smoke
```

### Recommended Project Structure
No new files created. Verification operates on existing files:
```
packages/cli/src/
├── commands/load.ts          # Phase 96 command [EXISTS]
├── commands/load.test.ts     # Phase 96 tests [EXISTS, 9 tests]
├── commands/init.ts          # Phase 97 command [MISSING - not yet implemented]
├── commands/init.test.ts     # Phase 97 tests [MISSING]
├── lib/markdown-formatter.ts      # Phase 96 formatter [EXISTS]
└── lib/markdown-formatter.test.ts # Phase 96 formatter tests [EXISTS, 12 tests]

.claude/skills/trapmap-knowledge-workflow/
├── SKILL.md                  # Updated with trapmap load [EXISTS, updated]
└── references/
    ├── retrieval.md          # Updated with trapmap load docs [EXISTS, updated]
    ├── artifacts.md          # Phase 98 should DELETE [EXISTS, still present]
    └── ...                   # accumulation.md, registration.md, review.md kept

packages/skills/trapmap-knowledge-workflow/
├── SKILL.md                  # Phase 98 should update [EXISTS, NOT updated with load]
└── references/
    ├── retrieval.md          # Phase 98 should DELETE [EXISTS, still present]
    ├── artifacts.md          # Phase 98 should DELETE [EXISTS, still present]
    └── ...
```

### Pattern 1: Verification Gating Pattern
**What:** Run a sequence of automated checks that each produce a pass/fail result, with the phase failing fast on any failure.
**When to use:** Every verification phase.
**Example:**
```bash
# Verification gate sequence (from Phase 96 SUMMARY.md)
pnpm --filter @trapmap/cli typecheck
pnpm --filter @trapmap/cli test
pnpm typecheck
pnpm test
pnpm eval:smoke
```

### Pattern 2: vi.importActual for Integration Testing Under Global Mock
**What:** When a test file uses global `vi.mock()` to replace a module, use `vi.importActual()` inside individual test bodies to access the real implementation for integration tests.
**When to use:** Integration tests that need real formatter behavior alongside mocked HTTP/config.
**Example:**
```typescript
// Established in Phase 96 Plan 07 [VERIFIED: load.test.ts lines 201-274]
const { formatLoadContext: realFormatter } = await vi.importActual<
  typeof import('../lib/markdown-formatter.js')
>('../lib/markdown-formatter.js');
const output = realFormatter(realMockResponse);
expect(output).toContain('<!-- trapmap-load-context -->');
```

### Anti-Patterns to Avoid
- **Testing mock behavior instead of real behavior:** Phase 96 Plan 07 already fixed this (IN-01), but any new tests for scripts/assets must use real formatter, not mocked one.
- **Verifying only one copy of SKILL.md:** Both `.claude/skills/` and `packages/skills/` copies must be checked for consistency.
- **Running eval:smoke without server:** Eval smoke tests require a running server with fixtures. Unit tests and typecheck do not.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown escaping | Custom escape function | `escapeMarkdown()` from markdown-formatter.ts | Already implemented and tested |
| Text truncation | Custom truncation | `truncateText()` from markdown-formatter.ts | Already implemented with ellipsis handling |
| Response validation | Manual field checking | `graphPlanSearchResponseSchema.parse()` from contracts | Zod validation covers all edge cases |

**Key insight:** This is a verification phase, not an implementation phase. All tools and functions already exist. The only "new" work is adding test cases for uncovered edge cases.

## Common Pitfalls

### Pitfall 1: Verifying Phases That Have Not Yet Executed
**What goes wrong:** Phase 99 CONTEXT.md lists Phase 97 and 98 as dependencies, but neither has been executed. Running verification now would find many "failures" that are actually "not yet implemented."
**Why it happens:** Phase 99 was planned alongside Phases 96-98, and the dependency graph was declared before execution order was determined.
**How to avoid:** Structure verification as three independent workstreams with explicit preconditions. Phase 96 verification can proceed immediately. Phase 97/98 verification should be conditional on those phases completing first.
**Warning signs:** Test failures for files that don't exist yet (init.ts, init.test.ts).

### Pitfall 2: SKILL.md Drift Between .claude/ and packages/ Copies
**What goes wrong:** The two SKILL.md locations (`.claude/skills/trapmap-knowledge-workflow/` and `packages/skills/trapmap-knowledge-workflow/`) can drift out of sync.
**Why it happens:** Updates are applied to one copy but not the other. Currently, `.claude/` version has `trapmap load` references but `packages/` version does not.
**How to avoid:** Verification must diff both copies and flag any discrepancies.
**Warning signs:** `diff` shows differences between the two SKILL.md files.

### Pitfall 3: Capsule Fallback Untested in Integration
**What goes wrong:** The `formatCapsuleFallback()` function is implemented in markdown-formatter.ts but has no dedicated integration test that exercises it through the real formatter pipeline.
**Why it happens:** All existing tests use `plan: null, fallback: null` -- the capsule fallback path is never exercised.
**How to avoid:** Add test cases with `fallback.routeFamily === 'capsule'` and actual capsule data.
**Warning signs:** If fallback rendering breaks, no test would catch it.

### Pitfall 4: Scripts/Assets Edge Cases Uncovered
**What goes wrong:** The formatter handles three activation refs types (references, assets, scripts), but tests only cover the references path.
**Why it happens:** The single skill test uses `activationRefs: { references: [{ path: 'ref/guide.md', ... }], assets: [], scripts: [] }`.
**How to avoid:** Add test with non-empty assets and scripts arrays.
**Warning signs:** Format string changes in `formatSkillNode()` for assets/scripts paths would be undetected.

## Code Examples

### Current Test Gap: Scripts/Assets Coverage
```typescript
// Source: packages/cli/src/lib/markdown-formatter.ts lines 76-88
// This code path is UNTESTED for assets and scripts:
const refs = skill.activationRefs;
if (refs.assets.length > 0) {
  const assetPaths = refs.assets.map(a => `\`${a.path}\``).join(', ');
  lines.push(`- Assets: ${assetPaths}`);
}
if (refs.scripts.length > 0) {
  const scriptInfo = refs.scripts.map(s => `\`${s.path}\` (${s.defaultPolicy})`).join(', ');
  lines.push(`- Scripts: ${scriptInfo}`);
}
```

### Current Test Gap: Capsule Fallback
```typescript
// Source: packages/cli/src/lib/markdown-formatter.ts lines 112-154
// formatCapsuleFallback() is defined but never called in tests.
// Need a test case with:
const response: GraphPlanSearchResponse = {
  routingTrace: mockTrace,
  plan: null,  // or plan with empty traps/skills
  fallback: {
    routeFamily: 'capsule',
    response: {
      capsules: [{
        capsuleId: 'cap-1',
        artifactId: 'art-1',
        situation: '...',
        problem: '...',
        goal: '...',
        labels: ['backend'],
        scope: 'project',
        score: 0.8,
        reason: 'semantic match',
      }],
    },
  },
};
```

### Verification Commands (Phase 96 Baseline)
```bash
# TypeScript compilation -- full monorepo
pnpm typecheck
# Currently: 0 errors [VERIFIED: run 2026-05-06]

# CLI tests
pnpm --filter @trapmap/cli test
# Currently: 321 tests passing, 16 files [VERIFIED: run 2026-05-06]

# Full test suite
pnpm test
# Currently: 2734 tests passing, 154 files [VERIFIED: run 2026-05-06]

# Eval smoke (requires server)
pnpm eval:smoke
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global vi.mock without real formatter testing | vi.importActual for integration tests under mock | Phase 96 Plan 07 (2026-05-06) | Real formatter can be tested without unmocking globally |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 97 (trapmap init) will create `packages/cli/src/commands/init.ts` | Architectural Responsibility Map | Verification steps for Phase 97 would target wrong files |
| A2 | Phase 98 will delete `references/retrieval.md` and `references/artifacts.md` from both `.claude/` and `packages/` copies | Phase Requirements | File existence checks would be wrong |
| A3 | Phase 98 will simplify SKILL.md Control Path to 3-step flow using `trapmap load` | Phase Requirements | SKILL.md verification criteria would be wrong |
| A4 | `pnpm eval:smoke` requires a running server with test fixtures | Verification Commands | Smoke tests would fail if server not running |

## Open Questions

1. **Should Phase 99 block on Phase 97/98 completion?**
   - What we know: Phase 99 CONTEXT.md lists Phase 97 and 98 as dependencies. Neither has been executed.
   - What's unclear: Will Phases 97/98 be executed before Phase 99, or should Phase 99 verify only Phase 96 and leave 97/98 for later?
   - Recommendation: Split Phase 99 into conditional workstreams. Execute Phase 96 verification immediately. Phase 97/98 verification triggers conditionally when those phases complete.

2. **Should the `packages/skills/` copy of SKILL.md be considered Phase 96 or Phase 98 scope?**
   - What we know: `.claude/skills/` SKILL.md was updated in Phase 96 to reference `trapmap load`, but `packages/skills/` SKILL.md was NOT updated.
   - What's unclear: Whether Phase 98's rewrite will reconcile both copies or only touch one.
   - Recommendation: Phase 99 verification should check BOTH copies for consistency regardless of which upstream phase was responsible.

3. **What level of formatter test coverage is sufficient for scripts/assets?**
   - What we know: The formatter code handles references, assets, and scripts paths. Only references are tested.
   - What's unclear: Whether a single combined test (references + assets + scripts) or separate per-type tests are preferred.
   - Recommendation: Single test with all three activation ref types populated, plus one edge case test with empty refs (already exists).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Build/test runner | Yes | workspace | -- |
| vitest | Test runner | Yes | workspace | -- |
| TypeScript | Type checking | Yes | workspace | -- |
| Node.js | Runtime | Yes | verified | -- |
| Running server (eval:smoke) | Eval smoke tests | Not checked | -- | Skip eval smoke if server unavailable |

**Missing dependencies with no fallback:**
- None for unit test verification.

**Missing dependencies with fallback:**
- Eval smoke tests (`pnpm eval:smoke`) require a running server. If unavailable, unit tests and typecheck still provide strong verification for Phase 96 scope. The planner should make eval:smoke a soft gate.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (workspace version) |
| Config file | packages/cli/vitest.config.ts |
| Quick run command | `pnpm --filter @trapmap/cli test` |
| Full suite command | `pnpm test` |

### Phase Requirements -- Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| V99-01 | load command E2E correctness | integration | `pnpm --filter @trapmap/cli test` | Yes (load.test.ts) |
| V99-02 | scripts/assets formatter edge cases | unit | `pnpm --filter @trapmap/cli test` | No -- Wave 0 gap |
| V99-03 | All CLI tests pass | gate | `pnpm --filter @trapmap/cli test` | Yes |
| V99-04 | TypeScript compilation | gate | `pnpm typecheck` | Yes |
| V99-05 | init command functionality | integration | `pnpm --filter @trapmap/cli test` | No -- Phase 97 pending |
| V99-06 | SKILL.md completeness | manual/grep | `diff` + grep checks | Partial |

### Sampling Rate
- **Per task commit:** `pnpm --filter @trapmap/cli test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** `pnpm test && pnpm typecheck`

### Wave 0 Gaps
- [ ] `packages/cli/src/lib/markdown-formatter.test.ts` -- add test for skills with assets+scripts in activationRefs (V99-02)
- [ ] `packages/cli/src/lib/markdown-formatter.test.ts` -- add test for capsule fallback formatting (V99-02)
- [ ] `packages/cli/src/commands/init.test.ts` -- depends on Phase 97 execution (V99-05)

## Sources

### Primary (HIGH confidence)
- Codebase inspection of `packages/cli/src/commands/load.ts`, `load.test.ts`, `markdown-formatter.ts`, `markdown-formatter.test.ts` -- verified via file reads
- Test execution: `pnpm --filter @trapmap/cli test` -- 321 tests passing (verified 2026-05-06)
- TypeScript: `pnpm typecheck` -- 0 errors (verified 2026-05-06)
- Full suite: `pnpm test` -- 2734 tests passing (verified 2026-05-06)
- Phase 96 SUMMARY.md, REVIEW.md, Plan 06-07 summaries -- verified all review findings resolved

### Secondary (MEDIUM confidence)
- Phase 96 RESEARCH.md -- detailed API contracts and design decisions
- Phase 97 CONTEXT.md -- scope and requirements (not yet executed)
- Phase 98 CONTEXT.md -- scope and requirements (not yet executed)
- `.claude/skills/trapmap-knowledge-workflow/SKILL.md` -- current state verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- existing project infrastructure, verified by running tests
- Architecture: HIGH -- codebase inspection confirms file locations and test structure
- Pitfalls: HIGH -- pitfalls derived from actual gaps found in codebase (untested paths, file drift)

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (stable -- no external dependencies)
