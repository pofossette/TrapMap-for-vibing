# CLI Bug Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 54 confirmed bugs in `packages/cli` identified by the FM-Agent scan, covering 1 critical security vulnerability, 10 high-severity crash/auth/permission defects, 28 medium-severity logic/formatting/injection issues, and 15 low-severity defects.

**Architecture:** All fixes are confined to `packages/cli/src/`. No server or contracts changes are required. Fixes are grouped into 4 phases by severity: security+crash → permission+validation → logic errors → formatting+injection+low. Each phase produces a green `pnpm test`, `pnpm typecheck`, and `pnpm check` before proceeding.

**Tech Stack:** TypeScript, Commander, Vitest, Node.js built-in modules, pnpm

---

## Plan Metadata

- Archived previous root plan to `docs/archived/archived-plans/plan-2026-05-28-pg-first-convergence-and-retrieval-eval.md`
- This file is the active working plan at `plan.md`
- Bug source: FM-Agent scan of `packages/cli` — 163 functions extracted, 83 reported, 54 confirmed
- Severity breakdown: 1 Critical, 10 High, 28 Medium, 15 Low

## Scope

- In scope:
  - All 54 confirmed bugs in `packages/cli/src/`
  - Unit test additions/updates for each fix
  - CLI-specific documentation updates (command surface, permission model)
- Out of scope:
  - Server-side fixes
  - Contracts schema changes
  - Ranking/retrieval logic redesign
  - New CLI features

## Phase Tracker

- [ ] Phase 1: Security + crash fixes (Critical/High — 6 bugs)
- [ ] Phase 2: Permission + validation correctness (High/Medium — 8 bugs)
- [ ] Phase 3: Logic error remediation (Medium — 18 bugs)
- [ ] Phase 4: Formatting, input injection, and low-severity cleanup (Medium/Low — 22 bugs)

## File Structure

**Modify**

- `packages/cli/src/lib/skill-artifact-export.ts` — path traversal fix, bundle path segment check, base64 decode
- `packages/cli/src/lib/output-profile.ts` — resolveRenderer crash, summarizeRetrievalV1 null, summarizeGraphPlan, buildCodexObject, buildCommandResultView, registerOutputProfileCommands spread
- `packages/cli/src/lib/prompts.ts` — isInteractiveEnvironment crash, promptSelect falsy check
- `packages/cli/src/lib/config.ts` — getConfigPath crash, loadCliState falsy check
- `packages/cli/src/lib/http.ts` — requireSessionToken type check
- `packages/cli/src/lib/markdown-formatter.ts` — truncateText edge case, formatRoutingTrace empty, formatTrapNode spec, push_1 numbering
- `packages/cli/src/lib/input.ts` — resolveTextInput stdin detection
- `packages/cli/src/lib/output.ts` — printResult JSON format
- `packages/cli/src/lib/artifact-bundle.ts` — scanSkillDirectory case sensitivity, buildSingleSkillMdBundle scope default, readFileContent encoding
- `packages/cli/src/index.ts` — operations permission flags, review/team permission cleanup
- `packages/cli/src/commands/skill.ts` — allowReview guard, formatSkillMatch injection, formatManualResultResponse injection, formatApplyResolutionResponse order, formatSkillHistoryResponse spacing, formatDuplicateJobBundle falsy
- `packages/cli/src/commands/feedback.ts` — entry-type validation, formatFeedbackResult ANSI injection
- `packages/cli/src/commands/operations/types.ts` — new permission fields
- `packages/cli/src/commands/operations/list.ts` — permission guard
- `packages/cli/src/commands/operations/activate.ts` — permission guard
- `packages/cli/src/commands/operations/status.ts` — permission guard
- `packages/cli/src/commands/operations/migrate.ts` — permission guard
- `packages/cli/src/commands/operations/deactivate.ts` — reason length validation
- `packages/cli/src/commands/operations/edit.ts` — integer validation
- `packages/cli/src/commands/feedback-admin.ts` — formatFeedbackList double newline, formatBatchResult falsy
- `packages/cli/src/commands/maintenance.ts` — formatMaintenanceList double newline, formatMaintenanceBatch falsy
- `packages/cli/src/commands/decay.ts` — formatBatchResult falsy, formatDecayList nullish

**Create**

- `packages/cli/src/lib/sanitize.ts` — shared input sanitization utility

## Global Done Criteria

- [ ] All 54 confirmed bugs have corresponding test cases that fail before the fix and pass after
- [ ] `pnpm typecheck` passes
- [ ] `pnpm check` passes
- [ ] `pnpm test` passes (full suite, no regressions)
- [ ] `pnpm eval:smoke` passes
- [ ] No new ESLint violations introduced

---

### Phase 1: Security + Crash Fixes (Critical/High — 6 bugs)

**Files:**

- Modify: `packages/cli/src/lib/skill-artifact-export.ts:26-42`
- Modify: `packages/cli/src/lib/output-profile.ts:874-878`
- Modify: `packages/cli/src/lib/output-profile.ts:110-118`
- Modify: `packages/cli/src/lib/prompts.ts:60-62`
- Modify: `packages/cli/src/lib/config.ts:44-46`
- Modify: `packages/cli/src/lib/http.ts:65-71`
- Test: `packages/cli/src/lib/skill-artifact-export.test.ts` (extend)
- Test: `packages/cli/src/lib/output-profile.test.ts` (extend)
- Test: `packages/cli/src/lib/config.test.ts` (extend)
- Test: `packages/cli/src/lib/http.test.ts` (extend)

**Phase completion criteria:**

- `validateOutputPath('/etc/passwd', '/home/user')` throws an error instead of returning `/etc/passwd`
- `resolveRenderer` with an unknown `profile.tool` value falls back to the generic renderer instead of throwing `TypeError`
- `summarizeRetrievalV1` with `[null, validEntry]` in `globalConstraints` returns the valid entry's summary instead of crashing
- `isInteractiveEnvironment()` returns `false` when `process.stdin` is `undefined` instead of throwing `TypeError`
- `getConfigPath()` returns a `tmpdir()`-based path when `os.homedir()` throws instead of propagating the exception
- `requireSessionToken` rejects non-string `sessionToken` values (numbers, booleans) with the authentication error

**Documentation updates required:**

- `docs/operations/SECURITY.md`: document the path traversal fix and the `validateOutputPath` boundary check
- `docs/PACKAGES.md`: note that CLI config falls back to `tmpdir()` in containerized environments

**Test / eval updates required:**

- Add `validateOutputPath` test: absolute path input must throw
- Add `resolveRenderer` test: unknown tool must return generic renderer
- Add `summarizeRetrievalV1` test: null first element must scan for valid entries
- Add `isInteractiveEnvironment` test: mock `process.stdin = undefined` must return `false`
- Add `getConfigPath` test: mock `os.homedir` throwing must return tmpdir path
- Add `requireSessionToken` test: numeric token must throw
- Run: `pnpm test -- --run packages/cli/src/lib/skill-artifact-export.test.ts packages/cli/src/lib/output-profile.test.ts packages/cli/src/lib/config.test.ts packages/cli/src/lib/http.test.ts`
- Run: `pnpm typecheck`

**Necessary example structure or code:**

```typescript
// validateOutputPath — packages/cli/src/lib/skill-artifact-export.ts
import { sep } from 'node:path';

export function validateOutputPath(outputPath: string, intendedDir: string): string {
  if (outputPath.includes('\0')) {
    throw new Error('Path contains null bytes');
  }
  const normalized = normalize(outputPath);
  if (normalized.includes('..')) {
    throw new Error(`Path contains directory traversal: ${outputPath}`);
  }
  const resolved = resolve(intendedDir, normalized);
  const resolvedBase = resolve(intendedDir) + sep;
  if (resolved !== resolve(intendedDir) && !resolved.startsWith(resolvedBase)) {
    throw new Error(`Path escapes intended directory: ${outputPath}`);
  }
  return resolved;
}
```

```typescript
// resolveRenderer — packages/cli/src/lib/output-profile.ts
export function resolveRenderer(profile: OutputProfile, kind: RenderKind): Renderer {
  const toolRegistry = registry[profile.tool] ?? registry.generic;
  return (toolRegistry[kind] ?? registry.generic[kind] ?? registry.generic.generic) as Renderer;
}
```

```typescript
// summarizeRetrievalV1 — packages/cli/src/lib/output-profile.ts
function summarizeRetrievalV1(payload: RetrievalResponse): string {
  if (payload.summary?.text) {
    return payload.summary.text;
  }
  if (payload.refinementSummary) {
    return payload.refinementSummary;
  }
  const firstValid =
    payload.globalConstraints.find((c) => c != null) ??
    payload.projectKnowledge.find((c) => c != null);
  return firstValid ? `${firstValid.shortcut} (${firstValid.score.toFixed(2)})` : 'No results found';
}
```

```typescript
// isInteractiveEnvironment — packages/cli/src/lib/prompts.ts
export function isInteractiveEnvironment(): boolean {
  return (
    typeof process.stdin !== 'undefined' &&
    process.stdin.isTTY === true &&
    typeof process.stdout !== 'undefined' &&
    process.stdout.isTTY === true
  );
}
```

```typescript
// getConfigPath — packages/cli/src/lib/config.ts
import { tmpdir } from 'node:os';

function getConfigPath(): string {
  let base: string;
  try {
    base = os.homedir();
  } catch {
    base = tmpdir();
  }
  return path.join(base, '.trapmap', 'cli.json');
}
```

```typescript
// requireSessionToken — packages/cli/src/lib/http.ts
export function requireSessionToken(state: CliState): string {
  if (typeof state.sessionToken !== 'string' || state.sessionToken.length === 0) {
    throw new Error('Not authenticated. Run `skill-shareer login` first.');
  }
  return state.sessionToken;
}
```

- [ ] **Step 1.1: Write failing tests for all 6 security/crash bugs**

Add tests to the existing test files:

```typescript
// In skill-artifact-export.test.ts
describe('validateOutputPath', () => {
  it('rejects absolute paths that escape intended directory', () => {
    expect(() => validateOutputPath('/etc/passwd', '/home/user/projects')).toThrow(
      'Path escapes intended directory',
    );
  });
  it('allows valid relative paths within intended directory', () => {
    const result = validateOutputPath('output/file.txt', '/home/user/projects');
    expect(result).toBe('/home/user/projects/output/file.txt');
  });
});

// In output-profile.test.ts
describe('resolveRenderer', () => {
  it('falls back to generic renderer for unknown tool', () => {
    const profile = { ...getDefaultOutputProfile(), tool: 'unknown-tool' as any };
    const renderer = resolveRenderer(profile, 'generic');
    expect(renderer).toBeDefined();
    expect(renderer.id).toContain('generic');
  });
});

describe('summarizeRetrievalV1', () => {
  it('skips null elements in globalConstraints', () => {
    const payload = {
      globalConstraints: [null, { shortcut: 'test', score: 0.8 }],
      projectKnowledge: [],
    } as any;
    const result = summarizeRetrievalV1(payload);
    expect(result).toContain('test');
  });
});

// In config.test.ts
describe('getConfigPath', () => {
  it('falls back to tmpdir when homedir throws', () => {
    vi.spyOn(os, 'homedir').mockImplementation(() => { throw new Error('no home'); });
    const result = getConfigPath();
    expect(result).toContain(tmpdir());
  });
});

// In http.test.ts
describe('requireSessionToken', () => {
  it('rejects numeric sessionToken', () => {
    expect(() => requireSessionToken({ sessionToken: 123 } as any)).toThrow('Not authenticated');
  });
  it('rejects empty string sessionToken', () => {
    expect(() => requireSessionToken({ sessionToken: '' } as any)).toThrow('Not authenticated');
  });
});
```

Run: `pnpm test -- --run packages/cli/src/lib/skill-artifact-export.test.ts packages/cli/src/lib/output-profile.test.ts packages/cli/src/lib/config.test.ts packages/cli/src/lib/http.test.ts`
Expected: FAIL — tests assert behavior that doesn't exist yet.

- [ ] **Step 1.2: Implement the 6 fixes**

Apply the code changes shown in the "Necessary example structure or code" section above.

- [ ] **Step 1.3: Run tests and verify all pass**

Run: `pnpm test -- --run packages/cli/src/lib/skill-artifact-export.test.ts packages/cli/src/lib/output-profile.test.ts packages/cli/src/lib/config.test.ts packages/cli/src/lib/http.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 1.4: Update security and package docs, commit**

```bash
git add packages/cli/src/lib/ docs/operations/SECURITY.md docs/PACKAGES.md
git commit -m "fix(cli): patch path traversal, crash, and auth bugs (Phase 1)"
```

---

### Phase 2: Permission + Validation Correctness (High/Medium — 8 bugs)

**Files:**

- Modify: `packages/cli/src/commands/skill.ts:226-230`
- Modify: `packages/cli/src/commands/operations/types.ts:1-9`
- Modify: `packages/cli/src/commands/operations/list.ts:11-12`
- Modify: `packages/cli/src/commands/operations/activate.ts:13-14`
- Modify: `packages/cli/src/commands/operations/status.ts:10-11`
- Modify: `packages/cli/src/commands/operations/migrate.ts:10-11`
- Modify: `packages/cli/src/commands/operations/deactivate.ts:20-22`
- Modify: `packages/cli/src/commands/operations/edit.ts:49-51`
- Modify: `packages/cli/src/commands/feedback.ts:72-73`
- Modify: `packages/cli/src/index.ts:152-157`
- Test: `packages/cli/src/commands/skill.test.ts` (extend)
- Test: `packages/cli/src/commands/operations.test.ts` (extend)
- Test: `packages/cli/src/commands/feedback.test.ts` (extend)

**Phase completion criteria:**

- `registerSkillCommands` registers review subcommands when only `allowReview=true`
- `list`, `activate`, `status` commands use their own permission flags (or are unconditionally registered per spec)
- `migrate` command uses its own permission flag (or is unconditionally registered per spec)
- `--entry-type` on feedback command rejects values other than `"trap"` and `"skill"`
- `--reason` on deactivate command rejects strings outside 1-500 character range
- `--required-level` on edit command rejects non-integer values
- `OperationsCommandOptions` type reflects the corrected permission model

**Documentation updates required:**

- `docs/PACKAGES.md`: document the corrected operations permission model
- `docs/architecture/components/GOVERNANCE.md`: update CLI permission flag mapping table

**Test / eval updates required:**

- Add test: `registerSkillCommands` with `{ allowReview: true }` registers review subcommands
- Add test: operations commands register with correct permission flags
- Add test: feedback `--entry-type foo` throws `InvalidArgumentError`
- Add test: deactivate `--reason` with 0 or 501 characters throws
- Add test: edit `--required-level 2.5` is rejected or floored to integer
- Run: `pnpm test -- --run packages/cli/src/commands/skill.test.ts packages/cli/src/commands/operations.test.ts packages/cli/src/commands/feedback.test.ts`
- Run: `pnpm typecheck`

**Necessary example structure or code:**

```typescript
// OperationsCommandOptions — packages/cli/src/commands/operations/types.ts
export interface OperationsCommandOptions {
  allowExport: boolean;
  allowEdit: boolean;
  allowDeactivate: boolean;
  allowImport: boolean;
  allowList: boolean;
  allowActivate: boolean;
  allowStatus: boolean;
  allowMigrate: boolean;
}
```

```typescript
// registerSkillCommands guard — packages/cli/src/commands/skill.ts
export function registerSkillCommands(program: Command, options: SkillCommandOptions): void {
  if (!options.allowSearch && !options.allowSubmit && !options.allowExport && !options.allowReview) {
    return;
  }
  // ...
}
```

```typescript
// list.ts guard
export function registerListCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowList) return;
  // ...
}
```

```typescript
// activate.ts guard
export function registerActivateCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowActivate) return;
  // ...
}
```

```typescript
// status.ts guard
export function registerStatusCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowStatus) return;
  // ...
}
```

```typescript
// migrate.ts guard
export function registerMigrateCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowMigrate) return;
  // ...
}
```

```typescript
// index.ts — updated wiring
registerOperationsCommands(program, {
  allowExport: visibility.allowKnowledgeExport,
  allowEdit: visibility.allowKnowledgeUpdate,
  allowDeactivate: visibility.allowKnowledgeDeactivate,
  allowImport: visibility.allowKnowledgeImport,
  allowList: visibility.allowKnowledgeExport,
  allowActivate: visibility.allowKnowledgeExport,
  allowStatus: visibility.allowKnowledgeExport,
  allowMigrate: visibility.allowKnowledgeImport,
});
```

```typescript
// feedback.ts — entry-type validation
import { InvalidArgumentError } from 'commander';

program
  .command('feedback <entryId>')
  // ...
  .option('--entry-type <type>', 'Entry type: trap or skill', (val) => {
    if (!['trap', 'skill'].includes(val)) {
      throw new InvalidArgumentError('Must be "trap" or "skill"');
    }
    return val;
  }, 'trap')
```

```typescript
// deactivate.ts — reason length validation
.requiredOption('--reason <text>', 'Reason for deactivation (1-500 characters)', (val) => {
  if (val.length < 1 || val.length > 500) {
    throw new InvalidArgumentError('Reason must be between 1 and 500 characters');
  }
  return val;
})
```

```typescript
// edit.ts — integer validation
if (flags.requiredLevel !== undefined) {
  const level = Number(flags.requiredLevel);
  if (!Number.isInteger(level) || level < 0) {
    throw new Error('--required-level must be a non-negative integer');
  }
  body.requiredLevel = level;
}
```

- [ ] **Step 2.1: Write failing tests for permission and validation bugs**

```typescript
// In skill.test.ts
describe('registerSkillCommands', () => {
  it('registers review subcommands when only allowReview is true', () => {
    const program = new Command();
    registerSkillCommands(program, {
      allowSearch: false,
      allowSubmit: false,
      allowExport: false,
      allowReview: true,
    });
    const skillCmd = program.commands.find((c) => c.name() === 'skill');
    expect(skillCmd).toBeDefined();
    const reviewQueue = skillCmd?.commands.find((c) => c.name() === 'review:queue');
    expect(reviewQueue).toBeDefined();
  });
});

// In feedback.test.ts
describe('feedback --entry-type', () => {
  it('rejects invalid entry type', async () => {
    // Attempt to parse with invalid entry-type
    await expect(
      program.parseAsync(['node', 'test', 'feedback', 'entry_1', '--entry-type', 'invalid', '--type', 'incorrect', '--description', 'test description here']),
    ).rejects.toThrow();
  });
});

// In operations.test.ts
describe('deactivate --reason', () => {
  it('rejects empty reason', async () => {
    await expect(
      program.parseAsync(['node', 'test', 'deactivate', 'entry_1', '--reason', '']),
    ).rejects.toThrow();
  });
  it('rejects reason over 500 characters', async () => {
    await expect(
      program.parseAsync(['node', 'test', 'deactivate', 'entry_1', '--reason', 'x'.repeat(501)]),
    ).rejects.toThrow();
  });
});
```

Run: `pnpm test -- --run packages/cli/src/commands/skill.test.ts packages/cli/src/commands/operations.test.ts packages/cli/src/commands/feedback.test.ts`
Expected: FAIL

- [ ] **Step 2.2: Implement permission and validation fixes**

Apply all code changes shown in the "Necessary example structure or code" section above. Update `OperationsCommandOptions` type, all 4 operation sub-command guards, the `registerSkillCommands` guard, feedback entry-type validation, deactivate reason validation, and edit integer validation.

- [ ] **Step 2.3: Run tests and verify all pass**

Run: `pnpm test -- --run packages/cli/src/commands/skill.test.ts packages/cli/src/commands/operations.test.ts packages/cli/src/commands/feedback.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2.4: Update governance docs, commit**

```bash
git add packages/cli/src/commands/ packages/cli/src/index.ts docs/PACKAGES.md docs/architecture/components/GOVERNANCE.md
git commit -m "fix(cli): correct permission flags and input validation (Phase 2)"
```

---

### Phase 3: Logic Error Remediation (Medium — 18 bugs)

**Files:**

- Modify: `packages/cli/src/lib/config.ts:80-95` — `loadCliState` falsy check
- Modify: `packages/cli/src/lib/prompts.ts:16-25` — `promptSelect` falsy check
- Modify: `packages/cli/src/lib/markdown-formatter.ts:41-44` — `truncateText` edge case
- Modify: `packages/cli/src/lib/markdown-formatter.ts:97-107` — `formatRoutingTrace` empty array
- Modify: `packages/cli/src/lib/markdown-formatter.ts:160-190` — `formatLoadContext` plan check
- Modify: `packages/cli/src/lib/input.ts:22-56` — `resolveTextInput` stdin detection
- Modify: `packages/cli/src/lib/skill-artifact-export.ts:48-65` — `validateBundleFilePath` segment check
- Modify: `packages/cli/src/lib/skill-artifact-export.ts:71-86` — `decodeFileContent` base64 padding
- Modify: `packages/cli/src/lib/artifact-bundle.ts:113-167` — `scanSkillDirectory` case sensitivity
- Modify: `packages/cli/src/lib/artifact-bundle.ts:31-77` — `buildSingleSkillMdBundle` scope default
- Modify: `packages/cli/src/lib/output-profile.ts` — `summarizeGraphPlan`, `buildCodexObject`, `buildCommandResultView`
- Modify: `packages/cli/src/commands/feedback-admin.ts:38-56` — `formatBatchResult` falsy check
- Modify: `packages/cli/src/commands/maintenance.ts:42-59` — `formatMaintenanceBatch` falsy check
- Modify: `packages/cli/src/commands/decay.ts:37-54` — `formatBatchResult` falsy check
- Modify: `packages/cli/src/commands/decay.ts:16-32` — `formatDecayList` nullish semantics
- Modify: `packages/cli/src/commands/skill.ts:120-180` — `formatDuplicateJobBundle` falsy check
- Test: `packages/cli/src/lib/markdown-formatter.test.ts` (extend)
- Test: `packages/cli/src/lib/artifact-bundle.test.ts` (extend)
- Test: `packages/cli/src/lib/config.test.ts` (extend)
- Test: `packages/cli/src/commands/decay.test.ts` (extend)
- Test: `packages/cli/src/commands/maintenance.test.ts` (extend)
- Test: `packages/cli/src/commands/feedback-admin.test.ts` (create)

**Phase completion criteria:**

- All 6 falsy-vs-existence check bugs use `!= null` (or `!== undefined && !== null`) instead of truthy checks
- `truncateText('hello', 2)` returns a string of length ≤ 2
- `formatRoutingTrace` with empty `channelsUsed` array outputs `"unknown"` instead of `"- Channels: "`
- `formatLoadContext` with empty `plan` array does not display fallback text
- `validateBundleFilePath('file..txt')` succeeds (only rejects `..` as a path segment)
- `decodeFileContent` accepts base64 without padding
- `scanSkillDirectory` matches `SKILL.md` case-insensitively
- `buildSingleSkillMdBundle` defaults scope to `'global'`
- `resolveTextInput` uses `hasStdinContent()` for stdin detection instead of `!isTTY` alone
- `formatDecayList` outputs `'unknown'` only for `null` values, not `undefined`

**Documentation updates required:**

- `docs/guides/CODE_GUIDE.md`: document the falsy-vs-existence check convention for CLI formatters
- `docs/operations/TESTING.md`: add a required edge-case checklist for path validation and text truncation

**Test / eval updates required:**

- Add test: `loadCliState` with `outputProfile: ''` preserves the empty-string value
- Add test: `promptSelect` with `description: ''` includes the description key
- Add test: `truncateText('hello', 2)` returns string of length ≤ 2
- Add test: `truncateText('hello', 1)` returns string of length ≤ 1
- Add test: `formatRoutingTrace` with `channelsUsed: []` outputs `"unknown"`
- Add test: `validateBundleFilePath('file..txt')` does not throw
- Add test: `validateBundleFilePath('foo/../bar')` throws
- Add test: `decodeFileContent('SGVsbG8')` (no padding) decodes correctly
- Add test: `scanSkillDirectory` finds `skill.md` (lowercase)
- Add test: `buildSingleSkillMdBundle` produces `scope: 'global'`
- Add test: `formatDecayList` with `decayState: null` outputs `'unknown'`, with `undefined` outputs empty
- Run: `pnpm test -- --run packages/cli/src/lib/markdown-formatter.test.ts packages/cli/src/lib/artifact-bundle.test.ts packages/cli/src/lib/config.test.ts packages/cli/src/commands/decay.test.ts packages/cli/src/commands/maintenance.test.ts`
- Run: `pnpm typecheck`

**Necessary example structure or code:**

```typescript
// truncateText fix — packages/cli/src/lib/markdown-formatter.ts
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}
```

```typescript
// formatRoutingTrace fix — packages/cli/src/lib/markdown-formatter.ts
function formatRoutingTrace(trace: GraphPlanRoutingTrace): string {
  const channels =
    trace.channelsUsed && trace.channelsUsed.length > 0
      ? trace.channelsUsed.join(', ')
      : 'unknown';
  const lines = [
    `- Mode: ${trace.selectedMode}`,
    `- Confidence: ${trace.confidenceScore.toFixed(2)} (${trace.confidenceBucket})`,
    `- Channels: ${channels}`,
  ];
  if (trace.fallbackTarget) {
    lines.push(`- Fallback: ${trace.fallbackTarget}`);
  }
  return lines.join('\n');
}
```

```typescript
// validateBundleFilePath fix — packages/cli/src/lib/skill-artifact-export.ts
import { sep } from 'node:path';

export function validateBundleFilePath(relPath: string): string {
  if (relPath.includes('\0')) {
    throw new Error(`File path contains null bytes: ${relPath}`);
  }
  const segments = normalize(relPath).split(sep);
  if (segments.includes('..')) {
    throw new Error(`File path contains directory traversal: ${relPath}`);
  }
  if (relPath.startsWith('/') || /^[A-Za-z]:/.test(relPath)) {
    throw new Error(`File path is absolute: ${relPath}`);
  }
  return normalize(relPath);
}
```

```typescript
// decodeFileContent fix — packages/cli/src/lib/skill-artifact-export.ts
export function decodeFileContent(content: string): Buffer {
  const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(content);
  if (isBase64 && content.length > 0) {
    try {
      return Buffer.from(content, 'base64');
    } catch {
      // Fall through to treat as UTF-8 text
    }
  }
  return Buffer.from(content, 'utf8');
}
```

```typescript
// scanSkillDirectory fix — packages/cli/src/lib/artifact-bundle.ts (line 136)
if (entry.isFile()) {
  if (relPath.toLowerCase() === 'skill.md') {
    // Will be handled separately
  } else if (relPath.startsWith('references/')) {
    // ...
  }
}
// ...
// line 161: also use case-insensitive check
const skillMdCandidates = ['SKILL.md', 'skill.md', 'Skill.md'];
let skillMdPath: string | null = null;
for (const candidate of skillMdCandidates) {
  try {
    const p = join(rootPath, candidate);
    await readFile(p);
    skillMdPath = p;
    break;
  } catch {
    // try next
  }
}
return { skillMd: skillMdPath, references, assets, scripts };
```

```typescript
// buildSingleSkillMdBundle fix — packages/cli/src/lib/artifact-bundle.ts
return {
  scope: 'global',
  // ...
};
```

```typescript
// Generic falsy→existence fix pattern (applied to 6 locations)
// Before: if (x) { ... }
// After:  if (x != null) { ... }

// loadCliState — config.ts line 90
...(outputProfile != null ? { outputProfile } : {}),

// formatBatchResult (feedback-admin.ts) line 43
if (data.appliedAt != null) { lines.push(`Applied at: ${data.appliedAt}`); }

// formatMaintenanceBatch (maintenance.ts) line 47
if (data.appliedAt != null) { lines.push(`Applied at: ${data.appliedAt}`); }

// formatBatchResult (decay.ts) line 42
if (data.appliedAt != null) { lines.push(`Applied at: ${data.appliedAt}`); }

// formatDuplicateJobBundle (skill.ts) — detail check
if (e.detail != null) { lines.push(`  Detail: ${e.detail.slice(0, 150)}...`); }

// promptSelect (prompts.ts) line 22
...(c.description != null ? { description: c.description } : {}),
```

```typescript
// formatDecayList fix — packages/cli/src/commands/decay.ts
const state = item.decayState === null ? 'unknown' : (item.decayState ?? '');
```

```typescript
// resolveTextInput fix — packages/cli/src/lib/input.ts
if (options.stdin || hasStdinContent()) {
  const stdinText = await readFromStdin();
  if (!stdinText) {
    throw new Error(`No ${fieldName} content received on stdin.`);
  }
  return stdinText;
}
```

- [ ] **Step 3.1: Write failing tests for all 18 logic bugs**

Add tests to the existing test files as specified in "Test / eval updates required" above. Each test should assert the correct behavior that the current code fails to provide.

Run: `pnpm test -- --run packages/cli/src/lib/markdown-formatter.test.ts packages/cli/src/lib/artifact-bundle.test.ts packages/cli/src/lib/config.test.ts packages/cli/src/commands/decay.test.ts packages/cli/src/commands/maintenance.test.ts`
Expected: FAIL — at least the new tests should fail.

- [ ] **Step 3.2: Implement the 18 logic fixes**

Apply all code changes shown in the "Necessary example structure or code" section above.

- [ ] **Step 3.3: Run tests and verify all pass**

Run: `pnpm test -- --run packages/cli/src/lib/markdown-formatter.test.ts packages/cli/src/lib/artifact-bundle.test.ts packages/cli/src/lib/config.test.ts packages/cli/src/commands/decay.test.ts packages/cli/src/commands/maintenance.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3.4: Update code guide and testing docs, commit**

```bash
git add packages/cli/src/ docs/guides/CODE_GUIDE.md docs/operations/TESTING.md
git commit -m "fix(cli): correct logic errors in formatters, path validation, and falsy checks (Phase 3)"
```

---

### Phase 4: Formatting, Input Injection, and Low-Severity Cleanup (Medium/Low — 22 bugs)

**Files:**

- Create: `packages/cli/src/lib/sanitize.ts`
- Modify: `packages/cli/src/lib/output.ts:14-21` — `printResult` JSON format
- Modify: `packages/cli/src/lib/markdown-formatter.ts:49-58` — `formatTrapNode` spec compliance
- Modify: `packages/cli/src/lib/markdown-formatter.ts` — `push_1` numbering
- Modify: `packages/cli/src/lib/output-profile.ts` — `renderCodex` token efficiency, `buildCommandResultView` transition, `registerOutputProfileCommands` spread
- Modify: `packages/cli/src/lib/artifact-bundle.ts:173-185` — `readFileContent` encoding consistency
- Modify: `packages/cli/src/lib/skill-artifact-export.ts:134-136` — `formatExportJson` Infinity/NaN
- Modify: `packages/cli/src/commands/skill.ts:39-62` — `formatSkillMatch` newline injection
- Modify: `packages/cli/src/commands/skill.ts:185-196` — `formatManualResultResponse` newline injection
- Modify: `packages/cli/src/commands/skill.ts:201-224` — `formatApplyResolutionResponse` line order
- Modify: `packages/cli/src/commands/skill.ts:99-115` — `formatSkillHistoryResponse` spacing
- Modify: `packages/cli/src/commands/feedback.ts:51-59` — `formatFeedbackResult` ANSI stripping
- Modify: `packages/cli/src/commands/feedback-admin.ts:16-33` — `formatFeedbackList` double newline
- Modify: `packages/cli/src/commands/maintenance.ts:22-37` — `formatMaintenanceList` double newline
- Test: `packages/cli/src/lib/sanitize.test.ts` (create)
- Test: `packages/cli/src/lib/output.test.ts` (extend)
- Test: `packages/cli/src/lib/markdown-formatter.test.ts` (extend)
- Test: `packages/cli/src/commands/skill.test.ts` (extend)
- Test: `packages/cli/src/commands/feedback.test.ts` (extend)

**Phase completion criteria:**

- `formatFeedbackList` and `formatMaintenanceList` produce no double blank lines between header and items
- `printResult` with `--json` outputs compact JSON (no indentation)
- `formatTrapNode` outputs only severity + label per spec
- `formatApplyResolutionResponse` first line is the candidate ID
- `formatSkillHistoryResponse` revision entries have no leading double-space
- `formatSkillMatch` strips newlines from title to prevent line-count injection
- `formatManualResultResponse` strips newlines from candidateId
- `formatFeedbackResult` strips ANSI escape codes from all fields
- `formatExportJson` handles `Infinity` and `NaN` by converting to `0` or string representation
- `sanitize.ts` provides reusable `stripNewlines()` and `stripAnsi()` functions

**Documentation updates required:**

- `docs/guides/CODE_GUIDE.md`: document the `sanitize.ts` utility and when to use it
- `docs/operations/TESTING.md`: add input sanitization checklist for CLI formatter tests

**Test / eval updates required:**

- Add test: `stripNewlines('hello\nworld')` returns `'hello world'`
- Add test: `stripAnsi('\x1b[31mred\x1b[0m')` returns `'red'`
- Add test: `formatFeedbackList` output has no double blank lines
- Add test: `formatMaintenanceList` output has no double blank lines
- Add test: `printResult` with `json: true` outputs compact JSON
- Add test: `formatSkillMatch` with title containing `\n` produces single-line title
- Add test: `formatFeedbackResult` with ANSI codes in input strips them
- Add test: `formatExportJson` with `Infinity` value does not produce `null`
- Run: `pnpm test -- --run packages/cli/src/lib/sanitize.test.ts packages/cli/src/lib/output.test.ts packages/cli/src/lib/markdown-formatter.test.ts packages/cli/src/commands/skill.test.ts packages/cli/src/commands/feedback.test.ts`
- Run: `pnpm typecheck`
- Run: `pnpm eval:smoke`

**Necessary example structure or code:**

```typescript
// packages/cli/src/lib/sanitize.ts (NEW FILE)
export function stripNewlines(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function sanitizeForDisplay(text: string): string {
  return stripAnsi(stripNewlines(text));
}
```

```typescript
// formatFeedbackList fix — packages/cli/src/commands/feedback-admin.ts
function formatFeedbackList(data: FeedbackListResponse): string {
  if (data.items.length === 0) {
    return 'No feedback found';
  }
  const lines: string[] = [];
  lines.push(`Found ${data.total} feedback items`);
  for (const item of data.items) {
    const age = `${Math.round(item.ageDays)}d`;
    const status = item.status;
    lines.push(
      `${item.id}  [${status}]  ${age}  ${item.entryShortcut.slice(0, 40)}  ${item.problemType}`,
    );
  }
  return lines.join('\n');
}
```

```typescript
// formatMaintenanceList fix — packages/cli/src/commands/maintenance.ts
function formatMaintenanceList(data: MaintenanceEntryListResponse): string {
  if (data.items.length === 0) {
    return 'No entries found';
  }
  const lines: string[] = [];
  lines.push(`Found ${data.total} entries`);
  for (const item of data.items) {
    const maintainer = item.maintainer?.handle ?? 'unassigned';
    const reviewBy = item.reviewBy ?? 'none';
    lines.push(`${item.id}  [${maintainer}]  [${reviewBy}]  ${item.shortcut.slice(0, 50)}`);
  }
  return lines.join('\n');
}
```

```typescript
// printResult fix — packages/cli/src/lib/output.ts
export function printResult<T>(value: T, options: JsonFlag, formatter: (input: T) => string): void {
  if (options.json) {
    console.log(JSON.stringify(value));
    return;
  }
  console.log(formatter(value));
}
```

```typescript
// formatTrapNode fix — packages/cli/src/lib/markdown-formatter.ts
function formatTrapNode(trap: PlanTrapNode, maxLen: number): string {
  const severityLabel = trap.severity === 'hard' ? '[HARD]' : '[SOFT]';
  const evidence = truncateText(escapeMarkdown(trap.evidence), maxLen);
  const lines = [
    `**${severityLabel} ${escapeMarkdown(trap.label)}**`,
    `> ${evidence}`,
    `- Source: \`${trap.sourceId}\``,
  ];
  return lines.join('\n');
}
```

```typescript
// formatSkillMatch fix — packages/cli/src/commands/skill.ts
import { stripNewlines } from '@trapmap/cli/lib/sanitize.js';

function formatSkillMatch(match: { /* ... */ }): string {
  const lines = [
    `${match.artifactId}`,
    `Title: ${stripNewlines(match.title)}`,
    `Slug: ${match.slug}`,
    `Labels: ${match.labels.join(', ')}`,
    `Scope: ${match.scope} (level ${match.requiredLevel})`,
    `Source: ${match.sourceKind}`,
    `Score: ${match.score.toFixed(2)}`,
    `Reason: ${stripNewlines(match.reason)}`,
  ];
  return lines.join('\n');
}
```

```typescript
// formatManualResultResponse fix — packages/cli/src/commands/skill.ts
function formatManualResultResponse(response: ManualResultResponse): string {
  const lines = [
    `Candidate ID: ${stripNewlines(response.candidateId)}`,
    `Decision: ${response.decision}`,
    `Reviewed At: ${response.reviewedAt}`,
    `Next State: ${response.nextState}`,
    '',
    'To fetch this job again:',
    `  trapmap skill duplicate-job fetch ${stripNewlines(response.candidateId)}`,
  ];
  return lines.join('\n');
}
```

```typescript
// formatFeedbackResult fix — packages/cli/src/commands/feedback.ts
import { stripAnsi } from '@trapmap/cli/lib/sanitize.js';

function formatFeedbackResult(response: FeedbackResponse): string {
  const lines = [
    `Feedback submitted: ${stripAnsi(response.feedback.id)}`,
    `Entry: ${stripAnsi(response.feedback.entryId)} (${stripAnsi(response.feedback.entryType)})`,
    `Problem: ${stripAnsi(response.feedback.problemType)}`,
    `Status: ${stripAnsi(response.feedback.status)}`,
  ];
  return lines.join('\n');
}
```

```typescript
// formatApplyResolutionResponse fix — packages/cli/src/commands/skill.ts
function formatApplyResolutionResponse(response: ApplyResolutionResponse): string {
  const lines = [
    `Candidate: ${response.candidateId}`,
    `✅ Resolution applied successfully`,
    `Status: ${response.status}`,
    `Decision: ${response.outcome.decision}`,
  ];
  // ...
}
```

```typescript
// formatSkillHistoryResponse fix — packages/cli/src/commands/skill.ts
const revisions = response.revisions.map((r) => {
  const submitter = r.submittedBy.handle ?? r.submittedBy.id;
  return `${r.revision}. ${r.submittedAt} by ${submitter} [${r.lifecycleState}]${r.summary ? ` - ${r.summary}` : ''}`;
});
```

```typescript
// formatExportJson fix — packages/cli/src/lib/skill-artifact-export.ts
export function formatExportJson(response: ArtifactExportResponse): string {
  return JSON.stringify(response, (_key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return Number.isNaN(value) ? 'NaN' : (value > 0 ? 'Infinity' : '-Infinity');
    }
    return value;
  }, 2);
}
```

- [ ] **Step 4.1: Create `sanitize.ts` and its tests**

```typescript
// packages/cli/src/lib/sanitize.test.ts
import { describe, expect, it } from 'vitest';
import { stripAnsi, stripNewlines, sanitizeForDisplay } from './sanitize.js';

describe('stripNewlines', () => {
  it('replaces newlines with spaces', () => {
    expect(stripNewlines('hello\nworld')).toBe('hello world');
    expect(stripNewlines('a\r\nb')).toBe('a b');
  });
  it('handles multiple consecutive newlines', () => {
    expect(stripNewlines('a\n\n\nb')).toBe('a b');
  });
});

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });
  it('handles strings without ANSI codes', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });
});

describe('sanitizeForDisplay', () => {
  it('strips both newlines and ANSI', () => {
    expect(sanitizeForDisplay('\x1b[31mhello\nworld\x1b[0m')).toBe('hello world');
  });
});
```

Run: `pnpm test -- --run packages/cli/src/lib/sanitize.test.ts`
Expected: PASS (new file, no dependencies to break)

- [ ] **Step 4.2: Write failing tests for formatting and injection bugs**

Add tests to existing test files as specified in "Test / eval updates required" above.

Run: `pnpm test -- --run packages/cli/src/lib/output.test.ts packages/cli/src/lib/markdown-formatter.test.ts packages/cli/src/commands/skill.test.ts packages/cli/src/commands/feedback.test.ts`
Expected: FAIL — new tests assert corrected behavior.

- [ ] **Step 4.3: Implement all formatting and injection fixes**

Apply all code changes shown in the "Necessary example structure or code" section above.

- [ ] **Step 4.4: Fix remaining low-severity items**

Apply fixes for:
- `renderCodex` — optimize JSON key order for token efficiency
- `buildCommandResultView` — coerce `transition` to boolean with `Boolean()`
- `registerOutputProfileCommands` — filter spread to known properties only
- `readFileContent` — align encoding behavior with description (text → UTF-8 string, binary → base64)

- [ ] **Step 4.5: Run full test suite and eval, commit**

Run: `pnpm test`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm check`
Expected: PASS

Run: `pnpm eval:smoke`
Expected: PASS

```bash
git add packages/cli/src/ docs/guides/CODE_GUIDE.md docs/operations/TESTING.md
git commit -m "fix(cli): correct formatting, add input sanitization, fix low-severity bugs (Phase 4)"
```

---

## Self-Review Checklist

- [ ] Every confirmed bug from the scan report maps to at least one step in this plan
- [ ] Each phase has:
  - [ ] completion criteria
  - [ ] documentation updates
  - [ ] test / eval updates
  - [ ] example structure or code
- [ ] No phase depends on hand-waving about "clean up later"
- [ ] The default implementation direction is conservative: fix bugs with minimal changes, reuse existing patterns
- [ ] Shared utilities (`sanitize.ts`) are created before they are consumed
- [ ] Permission model changes are consistent across `types.ts`, individual command files, and `index.ts` wiring

---

## Bug-to-Phase Mapping

| # | Bug | Phase | Step |
|---|-----|-------|------|
| 1 | `validateOutputPath` absolute path traversal | 1 | 1.2 |
| 2 | `requireSessionToken` non-string token | 1 | 1.2 |
| 3 | `resolveRenderer` TypeError on unknown tool | 1 | 1.2 |
| 4 | `summarizeRetrievalV1` null array element crash | 1 | 1.2 |
| 5 | `isInteractiveEnvironment` no stdin crash | 1 | 1.2 |
| 6 | `getConfigPath` no homedir crash | 1 | 1.2 |
| 7 | `registerSkillCommands` missing allowReview | 2 | 2.2 |
| 8 | `registerOperationsCommands` wrong permission flags | 2 | 2.2 |
| 9 | `registerFeedbackCommands` entry-type unvalidated | 2 | 2.2 |
| 10 | `registerDeactivateCommand` reason length | 2 | 2.2 |
| 11 | `registerEditCommand` float for integer | 2 | 2.2 |
| 12 | `registerReviewCommands` permission cleanup | 2 | 2.2 |
| 13 | `registerTeamCommands` permission cleanup | 2 | 2.2 |
| 14 | `loadCliState` falsy check | 3 | 3.2 |
| 15 | `formatBatchResult` (feedback-admin) falsy | 3 | 3.2 |
| 16 | `formatMaintenanceBatch` falsy | 3 | 3.2 |
| 17 | `formatBatchResult` (decay) falsy | 3 | 3.2 |
| 18 | `formatDuplicateJobBundle` falsy | 3 | 3.2 |
| 19 | `promptSelect` falsy | 3 | 3.2 |
| 20 | `formatRoutingTrace` empty array | 3 | 3.2 |
| 21 | `formatLoadContext` plan check | 3 | 3.2 |
| 22 | `summarizeGraphPlan` first element check | 3 | 3.2 |
| 23 | `buildCodexObject` failRender coercion | 3 | 3.2 |
| 24 | `scanSkillDirectory` case sensitivity | 3 | 3.2 |
| 25 | `buildSingleSkillMdBundle` scope default | 3 | 3.2 |
| 26 | `validateBundleFilePath` segment check | 3 | 3.2 |
| 27 | `decodeFileContent` base64 padding | 3 | 3.2 |
| 28 | `truncateText` maxLength < 3 | 3 | 3.2 |
| 29 | `resolveTextInput` stdin detection | 3 | 3.2 |
| 30 | `formatDecayList` nullish semantics | 3 | 3.2 |
| 31 | `formatFeedbackList` double newline | 4 | 4.3 |
| 32 | `formatMaintenanceList` double newline | 4 | 4.3 |
| 33 | `printResult` JSON format | 4 | 4.3 |
| 34 | `formatTrapNode` spec compliance | 4 | 4.3 |
| 35 | `formatApplyResolutionResponse` line order | 4 | 4.3 |
| 36 | `formatSkillHistoryResponse` spacing | 4 | 4.3 |
| 37 | `push_1` numbering | 4 | 4.3 |
| 38 | `formatSkillMatch` newline injection | 4 | 4.3 |
| 39 | `formatManualResultResponse` newline injection | 4 | 4.3 |
| 40 | `formatFeedbackResult` ANSI stripping | 4 | 4.3 |
| 41 | `registerReviewCommands` permission flag | 4 | 4.3 |
| 42 | `registerTeamCommands` permission flag | 4 | 4.3 |
| 43 | `renderCodex` token efficiency | 4 | 4.4 |
| 44 | `buildCommandResultView` transition | 4 | 4.4 |
| 45 | `registerOutputProfileCommands` spread | 4 | 4.4 |
| 46 | `readFileContent` encoding | 4 | 4.4 |
| 47 | `formatExportJson` Infinity/NaN | 4 | 4.3 |

## Repeated Pattern Summary

| Pattern | Count | Fix Strategy |
|---------|-------|-------------|
| Falsy check (`if(x)`) → existence (`if(x!=null)`) | 8 | Global search + replace per location |
| Double newline (`header\n` + `join('\n')`) | 2 | Remove trailing `\n` from header push |
| Missing input sanitization (newline/ANSI) | 3 | Shared `sanitize.ts` utility |
| Permission flag miswiring | 6 | New `OperationsCommandOptions` fields + `index.ts` wiring |
| Array null element unhandled | 2 | `.find(x => x != null)` pattern |
| Path validation incomplete | 3 | `resolve` + `startsWith` + segment split |
