# Phase 96: Agent-Native CLI — `trapmap load`

## Summary

Phase 96 implements the `trapmap load` CLI command that encapsulates 检索→筛选→激活→格式化 into a single command optimized for agent consumption. Instead of requiring agents to run multiple CLI commands and manually parse JSON, `trapmap load` outputs a structured markdown context block with traps, skills, and routing metadata.

## Plans

### Plan 01: Markdown Formatter (Wave 1)
- **Objective**: Create `formatLoadContext` function in `packages/cli/src/lib/markdown-formatter.ts`
- **Key Deliverables**:
  - `formatLoadContext(response: GraphPlanSearchResponse): string` — main formatting function
  - `escapeMarkdown(text): string` — escape metacharacters in knowledge content
  - `truncateText(text, maxLength): string` — truncate long content with ellipsis
  - Unit tests covering: empty plan, traps only, skills only, escaping, truncation
- **Status**: Not started

### Plan 02: Load Command (Wave 1)
- **Objective**: Create `trapmap load` command in `packages/cli/src/commands/load.ts`
- **Key Deliverables**:
  - `registerLoadCommand(program, { allowSearch })` — command registration function
  - Calls `POST /v3/retrieval/search` (GraphRAG-lite endpoint)
  - Supports flags: `--scope`, `--label`, `--max-results`, `--skill-budget`, `--max-depth`, `--fallback`, `--stdin`, `--json`
  - Unit tests for registration, auth, API call, filters, JSON output
- **Status**: Not started

### Plan 03: Command Registration (Wave 2)
- **Objective**: Register load command in `packages/cli/src/index.ts`
- **Key Deliverables**:
  - Import `registerLoadCommand` from `./commands/load.js`
  - Register with `allowSearch: visibility.allowKnowledgeSearch`
  - Add 'load' to `api:list` output
  - Verify TypeScript compiles and tests pass
- **Status**: Not started

### Plan 04: SKILL.md Update (Wave 2)
- **Objective**: Update `.claude/skills/trapmap-knowledge-workflow/SKILL.md` and `references/retrieval.md`
- **Key Deliverables**:
  - SKILL.md Control Path updated to use `trapmap load` as primary entry
  - Retrieval reference added with complete usage documentation
  - Manual search commands preserved as alternative
- **Status**: Not started

### Plan 05: End-to-End Verification (Wave 3)
- **Objective**: Verify complete implementation with tests, type checking, and integration
- **Key Deliverables**:
  - All CLI tests pass
  - TypeScript compiles
  - Command visible in `--help`
  - Markdown output structure verified
  - Eval smoke tests pass (no regression)
- **Status**: Not started

## Wave Structure

```
Wave 1 (Parallel):
├── PLAN-01: markdown-formatter.ts + test
└── PLAN-02: load.ts + test

Wave 2 (Parallel, depends on Wave 1):
├── PLAN-03: index.ts registration
└── PLAN-04: SKILL.md update

Wave 3 (Sequential, depends on Wave 2):
└── PLAN-05: E2E verification
```

## Requirements Covered

All requirements from ROADMAP.md Phase 96:

1. ✅ 实现 `trapmap load` 命令 (PLAN-02)
2. ✅ 封装 检索→筛选→激活→格式化 为单条命令 (PLAN-02)
3. ✅ 输出 agent 可直接消费的 markdown context block (PLAN-01, PLAN-02)
4. ✅ 重写 SKILL.md 使用精简 workflow (PLAN-04)

## Technical Approach

### API Strategy
- **Primary endpoint**: `/v3/retrieval/search` (GraphRAG-lite)
- **Reason**: Server does heavy lifting, confidence routing built-in, returns trap-first plan or fallback automatically
- **Alternative**: Manual commands preserved for fine-grained control

### Output Format
- **Markdown context block** with `<!-- trapmap-load-context -->` markers
- **Sections**: Blocking Traps, Recommended Skills, Capsules (fallback), Routing
- **Escaping**: All knowledge content escaped to prevent markdown injection
- **Truncation**: Configurable limits for content length, max traps, max skills

### Auth & Permissions
- **Gate**: `visibility.allowKnowledgeSearch` controls registration
- **Runtime**: `requireSessionToken()` throws if unauthenticated
- **Error message**: "Not authenticated. Run `trapmap login` first."

## Files Created/Modified

### New Files
1. `packages/cli/src/lib/markdown-formatter.ts` — formatting functions
2. `packages/cli/src/lib/markdown-formatter.test.ts` — formatter tests
3. `packages/cli/src/commands/load.ts` — command implementation
4. `packages/cli/src/commands/load.test.ts` — command tests

### Modified Files
1. `packages/cli/src/index.ts` — command registration
2. `.claude/skills/trapmap-knowledge-workflow/SKILL.md` — workflow update
3. `.claude/skills/trapmap-knowledge-workflow/references/retrieval.md` — usage docs

## Success Criteria

1. ✅ `trapmap load` command exists and shows in `--help`
2. ✅ Command calls `/v3/retrieval/search` with proper parameters
3. ✅ Outputs markdown context block with traps, skills, and routing
4. ✅ Supports all options: --scope, --label, --skill-budget, --max-depth, --fallback, --stdin, --json
5. ✅ SKILL.md uses `trapmap load` as primary workflow entry
6. ✅ All tests pass (unit + integration + eval smoke)
7. ✅ TypeScript compiles without errors
8. ✅ No security regressions (auth guards, escaping, truncation)

## Verification Commands

```bash
# Run all CLI tests
pnpm --filter @trapmap/cli test

# Type check
pnpm --filter @trapmap/cli typecheck

# Show help
pnpm --filter @trapmap/cli dev -- load --help

# Test with JSON output
pnpm --filter @trapmap/cli dev -- load "test seed" --json

# Test with markdown output
pnpm --filter @trapmap/cli dev -- load "test seed"

# Run eval smoke tests
pnpm eval:smoke
```

## Execution Order

Execute plans sequentially within each wave:

**Wave 1** (can run in parallel):
```bash
/gsd-execute-phase 96 --plan 01
/gsd-execute-phase 96 --plan 02
```

**Wave 2** (depends on Wave 1):
```bash
/gsd-execute-phase 96 --plan 03
/gsd-execute-phase 96 --plan 04
```

**Wave 3** (depends on Wave 2):
```bash
/gsd-execute-phase 96 --plan 05
```

## Notes

- **No activation integration**: Plan intentionally omits `--activate-references` for Phase 96 scope. Activation can be added in future phase if needed.
- **Content truncation**: Defaults to 2000 chars max, configurable via `--max-content-length` option (not exposed in CLI yet, but available in formatter API).
- **Fallback handling**: Command renders capsule fallbacks, but entry fallback rendering is placeholder ("not implemented yet"). Can be enhanced later.
- **Manual commands preserved**: Existing `search` and `skill search-by-content` commands still available for fine-grained control.

## Next Phase

Phase 97: Agent-Native CLI — `trapmap init` (independent of Phase 96)
