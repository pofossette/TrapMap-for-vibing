# Phase 85: CLI Operations Refactoring — Research

## Research Question
"What do I need to know to PLAN this phase well?"

---

## 1. Current State Analysis

### File: `packages/cli/src/commands/operations.ts`
**Total Lines: 1060**

| Section | Lines | Count | Description |
|---------|-------|-------|-------------|
| Imports & Types | 1-52 | 52 | Type imports, schema imports, options interface |
| Helper Functions | 57-407 | 350 | 9 helper functions for artifact bundles |
| `list` command | 414-461 | 48 | List knowledge entries |
| `edit` command | 463-521 | 59 | Edit knowledge entry |
| `deactivate` command | 523-548 | 26 | Deactivate knowledge entry |
| `export` command | 550-595 | 46 | Export knowledge entries |
| `artifact-export` command | 597-668 | 72 | Export skill artifact |
| `import` command | 671-814 | 144 | Import knowledge/artifacts (most complex) |
| `activate` command | 817-941 | 125 | Activate artifact files |
| `migrate` command | 944-1018 | 75 | Migrate legacy knowledge |
| `status` command | 1020-1058 | 39 | Compatibility status |

### Commands Overview (9 total)

1. **list** — `trapmap list` — List knowledge entries with filters
2. **edit** — `trapmap edit <entryId>` — Edit a knowledge entry
3. **deactivate** — `trapmap deactivate <entryId>` — Deactivate a knowledge entry
4. **export** — `trapmap export` — Export knowledge entries to JSON
5. **artifact-export** — `trapmap artifact-export --artifact <id>` — Export skill artifact
6. **import** — `trapmap import --file <path> --level <n>` — Import knowledge/artifacts
7. **activate** — `trapmap activate --artifact <id> --paths <paths>` — Activate artifact files
8. **migrate** — `trapmap migrate` — Migrate legacy knowledge to artifacts
9. **status** — `trapmap status` — Show migration/compatibility status

---

## 2. Helper Functions to Extract

All helpers are file/artifact bundle utilities. Should move to `packages/cli/src/lib/artifact-bundle.ts`:

| Function | Lines | Description |
|----------|-------|-------------|
| `isSkillMdFile` | 57-61 | Check if file path is SKILL.md |
| `buildSingleSkillMdBundle` | 67-113 | Build bundle from single SKILL.md |
| `parseClaudeSkill` | 120-136 | Parse SKILL.md with YAML frontmatter |
| `computeFileHash` | 141-143 | SHA-256 hash computation |
| `scanSkillDirectory` | 149-204 | Recursive directory scan for skill files |
| `readFileContent` | 210-220 | Read file with text/binary detection |
| `parseSkillMetadata` | 225-236 | Extract title/labels from SKILL.md |
| `buildArtifactBundle` | 241-390 | Build canonical artifact bundle |
| `formatListResponse` | 392-407 | Format list output for display |

**Total helper lines: ~350**

**Existing related lib file**: `packages/cli/src/lib/skill-artifact-export.ts` (162 lines)
- Contains `validateOutputPath`, `validateBundleFilePath`, `decodeFileContent`, `materializeSkillDirectory`, `formatExportJson`, `formatExportHuman`
- New helpers can be added here or in a new `artifact-bundle.ts` file

---

## 3. CLI Command Pattern (from other files)

### Registration Pattern

```typescript
// Each command file exports:
export function registerXxxCommands(
  program: Command,
  options: XxxCommandOptions,
): void {
  if (options.allowFoo) {
    program.command('foo')...
  }
}
```

### Entry Point Integration (`packages/cli/src/index.ts`)

```typescript
import { registerOperationsCommands } from './commands/operations.js';

registerOperationsCommands(program, {
  allowExport: visibility.allowKnowledgeExport,
  allowEdit: visibility.allowKnowledgeUpdate,
  allowDeactivate: visibility.allowKnowledgeDeactivate,
  allowImport: visibility.allowKnowledgeImport,
});
```

### Options Interface

```typescript
interface OperationsCommandOptions {
  allowExport: boolean;
  allowEdit: boolean;
  allowDeactivate: boolean;
  allowImport: boolean;
}
```

---

## 4. Proposed Module Structure

Following Phase 80's server-side pattern (thin router + sub-modules):

```
packages/cli/src/
├── commands/
│   ├── operations.ts           # Thin registration (~50 lines)
│   └── operations/
│       ├── index.ts            # Barrel export
│       ├── list.ts             # list command (~60 lines)
│       ├── edit.ts             # edit command (~70 lines)
│       ├── deactivate.ts       # deactivate command (~40 lines)
│       ├── export.ts           # export + artifact-export (~130 lines)
│       ├── import.ts           # import command (~160 lines)
│       ├── activate.ts         # activate command (~140 lines)
│       ├── migrate.ts          # migrate command (~90 lines)
│       └── status.ts           # status command (~50 lines)
└── lib/
    └── artifact-bundle.ts      # Helper functions (~370 lines)
```

### Line Count Targets

| Module | Current | Target | Status |
|--------|---------|--------|--------|
| operations.ts (main) | 1060 | <100 | Extract all |
| list.ts | — | ~60 | New |
| edit.ts | — | ~70 | New |
| deactivate.ts | — | ~40 | New |
| export.ts | — | ~130 | New |
| import.ts | — | ~160 | New |
| activate.ts | — | ~140 | New |
| migrate.ts | — | ~90 | New |
| status.ts | — | ~50 | New |
| lib/artifact-bundle.ts | — | ~370 | New |

---

## 5. Test File Analysis

**File**: `packages/cli/src/commands/operations.test.ts` (860 lines)

### Test Structure

```typescript
describe('CLI operations commands (Phase 13)', () => {
  // Directory detection (IMEX-01)
  // File classification (T-13-01, T-13-02)
  // Single SKILL.md compatibility (IMEX-03)
  // Path validation (T-13-01)
  // Output routing (COMP-01)
  // CLI activation commands (Phase 15-03)
  // CLI migration commands (Phase 16-01)
});
```

### Test Mocking Pattern

```typescript
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

import { registerOperationsCommands } from './operations.js';

// In beforeEach:
program = new Command();
registerOperationsCommands(program, {
  allowImport: true,
  allowExport: true,
  allowEdit: false,
  allowDeactivate: false,
});
```

### Test Updates Required

1. **No changes needed for import path** — Tests import from `./operations.js` which remains the entry point
2. **Helper function tests** — Add unit tests for extracted helpers in `lib/artifact-bundle.test.ts`
3. **Individual command tests** — Optionally split tests per command file

---

## 6. Dependencies & Imports

### Shared Imports (all commands)

```typescript
import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';
import { resolveTextInput } from '../lib/input.js';
```

### Command-Specific Imports

| Command | Additional Imports |
|---------|-------------------|
| list | — |
| edit | — |
| deactivate | — |
| export | `{ writeFile } from 'node:fs/promises'` |
| artifact-export | `{ validateOutputPath, materializeSkillDirectory, formatExportJson, formatExportHuman } from '../lib/skill-artifact-export.js'` |
| import | `{ readFile, stat } from 'node:fs/promises'`, artifact bundle helpers |
| activate | `{ validateOutputPath, materializeSkillDirectory } from '../lib/skill-artifact-export.js'` |
| migrate | — |
| status | — |

### Contracts Imports

```typescript
import type {
  ActivationResponse,
  ArtifactBundle,
  ArtifactExportResponse,
  ArtifactImportRequest,
  ArtifactImportResponse,
  CompatibilityStatusResponse,
  ExportBundle,
  ImportResponse,
  KnowledgeDeactivateResponse,
  KnowledgeEntryResponse,
  KnowledgeListResponse,
  LegacyMigrationResponse,
} from '@trapmap/contracts';

import {
  activationResponseSchema,
  artifactExportResponseSchema,
  artifactImportRequestSchema,
  artifactImportResponseSchema,
  compatibilityStatusResponseSchema,
  detectMediaType,
  exportBundleSchema,
  importResponseSchema,
  isTextLikeMediaType,
  knowledgeDeactivateResponseSchema,
  knowledgeEntryResponseSchema,
  knowledgeListResponseSchema,
  legacyMigrationResponseSchema,
  parseSkillMarkdown,
} from '@trapmap/contracts';
```

---

## 7. Phase 80 Pattern Reference

Phase 80 successfully refactored server-side `operations.ts` using:

1. **Barrel export** (`operations/index.ts`) — Re-exports all sub-modules
2. **Thin router** (`operations.ts`) — Only imports and registers sub-routes
3. **Per-feature modules** — Each handler in its own file
4. **FastifyPluginAsync pattern** — Each module exports a plugin

### Adapted for CLI

| Server Pattern | CLI Equivalent |
|---------------|----------------|
| `FastifyPluginAsync` | `registerXxxCommands(program, options)` |
| `app.register(routes)` | `registerXxxCommands(program, options)` |
| Barrel export | Same pattern |
| `lib/` helpers | Same pattern |

---

## 8. Implementation Approach

### Wave 1: Extract Helpers to lib/

1. Create `lib/artifact-bundle.ts`
2. Move all 9 helper functions
3. Export from new file
4. Update imports in `operations.ts`
5. Create `lib/artifact-bundle.test.ts` for helper tests

### Wave 2: Create Sub-modules

For each command:
1. Create `operations/xxx.ts`
2. Extract command registration and action handler
3. Import shared utilities
4. Export `registerXxxCommand(program, options)`

### Wave 3: Create Thin Router

1. Create `operations/index.ts` with barrel exports
2. Convert `operations.ts` to thin registration file
3. Import and call all sub-module registrations
4. Verify entry point (`index.ts`) still works

---

## 9. Verification Checklist

```bash
# TypeScript compilation
cd packages/cli && pnpm tsc --noEmit

# Line count verification
wc -l packages/cli/src/commands/operations.ts  # Should be < 100
wc -l packages/cli/src/commands/operations/*.ts  # Each should be < 250
wc -l packages/cli/src/lib/artifact-bundle.ts  # Should be < 400

# All sub-modules exist
ls packages/cli/src/commands/operations/

# Tests pass
pnpm test --filter=cli
```

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Circular imports | Verify import structure before extraction |
| Test breakage | Run tests after each wave |
| Command behavior changes | Extract without functional changes |
| Missing exports | Use barrel export pattern |

---

## 11. Key Decisions for PLAN Phase

1. **Should helpers go to existing `skill-artifact-export.ts` or new `artifact-bundle.ts`?**
   - Recommendation: New file for clarity (different responsibility)
   - `skill-artifact-export.ts`: Export formatting and materialization
   - `artifact-bundle.ts`: Building and parsing artifact bundles

2. **Should tests be split per command file?**
   - Recommendation: Keep existing test file, add helper tests
   - Tests import from `./operations.js` which remains valid

3. **What's the correct export name for sub-modules?**
   - Recommendation: `registerXxxCommand` (singular) for individual commands
   - Current: `registerOperationsCommands` (plural) for all operations

4. **Should there be a shared types file?**
   - Recommendation: Yes, `operations/types.ts` for `OperationsCommandOptions`
   - Alternatively, keep types in main `operations.ts`

---

## 12. References

- Phase 80 PLAN: `.planning/phases/80-operations-route-refactoring/80-01-PLAN.md`
- Phase 85 CONTEXT: `.planning/milestones/v1.8-phases/85-cli-operations-refactoring/85-CONTEXT.md`
- Server operations structure: `packages/server/src/routes/operations/`
- CLI lib patterns: `packages/cli/src/lib/`
