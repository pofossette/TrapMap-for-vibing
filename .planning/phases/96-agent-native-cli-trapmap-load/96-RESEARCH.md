# Phase 96 RESEARCH: Agent-Native CLI — `trapmap load`

## Executive Summary

`trapmap load` 封装 检索→筛选→激活→格式化 为单条 CLI 命令，输出 agent 可直接消费的 markdown context block。核心设计决策：使用 `/v3/retrieval/search` (GraphRAG-lite) 作为主入口，该端点在置信度高时返回 trap-first plan，否则返回 capsule/entry fallback。

---

## 1. Current Agent Workflow (Baseline)

Agent 当前需执行多步 CLI 操作：

```
1. Auth preflight:     trapmap session --json
2. Skill search:       trapmap skill search-by-content "<seed>" --max-results 5 --json
3. Trap search:        trapmap search "<risk seed>" --scope project --v2 --max-results 5 --json
4. Manual compilation: Agent parses JSON, compiles trap-first plan
5. Optional activate:  trapmap activate --artifact <id> --paths <paths> --output ./activated
```

**痛点**：
- 5 次独立 CLI 调用
- Agent 需解析 JSON 并做决策
- 无标准化输出格式
- 激活路径需手动推理

---

## 2. Available API Endpoints

| Endpoint | Purpose | Response Shape | Best For |
|----------|---------|----------------|----------|
| `/v3/retrieval/search` | GraphRAG-lite wrapper | `GraphPlanSearchResponse` (plan or fallback) | **PRIMARY** - trap-first plan + confidence routing |
| `/v2/retrieval/search` | Capsule-native retrieval | `RetrievalV2ResponseWithHints` | Fallback / capsule-focused |
| `/v1/retrieval/search` | Legacy entry retrieval | `RetrievalResponse` | Backward compatibility |
| `/v3/retrieval/plan` | Trap-first plan compilation | `TrapFirstPlan` | Direct plan request |
| `/v1/retrieval/skills/search-by-content` | Skill lookup | `SkillLookupResponse` | Artifact-first lookup |
| `/v1/operations/artifacts/activate` | Selective activation | `ActivationResponse` | File materialization |

**推荐主入口**: `/v3/retrieval/search` (lines 152-212 in `packages/server/src/routes/retrieval.ts`)
- 自动路由：置信度高 → trap-first plan，低 → fallback
- 返回 `routingTrace` 便于调试
- 已集成 usage analytics

---

## 3. Key Contracts & Schemas

### Primary Response Schema (`packages/contracts/src/domain/retrieval.ts`)

```typescript
// GraphRAG-lite wrapper response (lines 537-546)
graphPlanSearchResponseSchema = z.object({
  routingTrace: graphPlanRoutingTraceSchema,  // Confidence & routing metadata
  plan: trapFirstPlanSchema.nullable(),       // Trap-first plan (when high confidence)
  fallback: graphPlanFallbackSchema.nullable(), // Capsule or entry fallback
})
```

### Trap-First Plan Structure (`packages/contracts/src/domain/plans.ts`)

```typescript
trapFirstPlanSchema = z.object({
  blockingTraps: z.array(planTrapNodeSchema),   // Blockers/warnings
  recommendedSkills: z.array(planSkillNodeSchema), // Recommended skills with activationRefs
  edges: z.array(planEdgeSchema),               // Typed edges (risk-blocks, mitigates, etc.)
  citations: z.array(planCitationSchema),       // Supporting evidence
  graph: graphPlanSchema,                       // Unified graph view
})

planSkillNodeSchema includes:
  - situation, problem, goal (capsule content)
  - activationRefs: { references, assets, scripts } // Metadata-only activation hints
```

### Capsule Match Schema (v2 retrieval)

```typescript
capsuleMatchSchema = z.object({
  capsuleId, artifactId, revision,
  content, situation, problem, goal,  // Distilled capsule
  labels, scope, requiredLevel,       // Governance
  score, reason,                      // Ranking
})
```

---

## 4. CLI Command Patterns

### Command Registration Pattern (`packages/cli/src/index.ts`)

```typescript
// 1. Import register function
import { registerLoadCommand } from './commands/load.js';

// 2. Call with permission options
registerLoadCommand(program, {
  allowSearch: visibility.allowKnowledgeSearch,
  allowExport: visibility.allowKnowledgeExport,
});
```

### Command Implementation Pattern (`packages/cli/src/commands/retrieval.ts`)

```typescript
export function registerRetrievalCommands(program: Command, options: RetrievalCommandOptions): void {
  if (!options.allowSearch) return;

  program
    .command('search')
    .description('Search knowledge base using semantic retrieval')
    .argument('[seed]', 'Search seed text or query')
    .option('--label <label>', 'Filter by label', collectValues, [])
    .option('--scope <scope>', 'Filter by scope (global or project)')
    .option('--max-results <n>', 'Maximum number of results', '10')
    .option('--json', 'Output JSON')
    .action(async (seed, flags) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<RetrievalResponse>(state, {
        method: 'POST',
        path: '/v1/retrieval/search',
        body: { seed, ... },
      });

      const parsed = retrievalResponseSchema.parse(response.data);
      printResult(parsed, flags, formatRetrievalResponse);
    });
}
```

### Utility Functions

- `loadCliState()` - Load CLI config (server URL, session token)
- `requireSessionToken(state)` - Throw if not authenticated
- `apiRequest<T>(state, options)` - HTTP request with auth header
- `printResult(value, options, formatter)` - Output JSON or formatted text
- `resolveTextInput(options, fieldName)` - Resolve from arg/stdin/file

---

## 5. Proposed `trapmap load` Design

### Command Signature

```bash
trapmap load <seed> [options]

Options:
  --scope <scope>              Filter by scope (global or project)
  --label <label>              Filter by label (repeatable)
  --max-results <n>            Max capsules/skills (default: 10)
  --skill-budget <n>           Max skills in plan (default: 3)
  --activate-references        Fetch top reference files for top skills
  --output <path>              Output directory for activated files
  --json                       Output raw JSON instead of markdown
  --stdin                      Read seed from stdin
```

### Implementation Flow

```
1. Parse args, load CLI state, require auth
2. Build GraphRAG-lite query:
   {
     seed,
     filters: { labels, scopes },
     skillBudget,
     fallbackMode: 'auto'
   }
3. Call POST /v3/retrieval/search
4. If plan exists:
   - Format traps as warnings
   - Format skills as recommendations with capsule content
   - Include activation hints
5. If fallback:
   - Format capsule/entry results
6. If --activate-references and top skills have reference hints:
   - Call POST /v1/operations/artifacts/activate for top N artifacts
   - Include file paths in markdown
7. Output markdown context block (or JSON if --json)
```

### Output Format (Markdown Context Block)

```markdown
<!-- trapmap-load-context -->
## TrapMap Context

### Blocking Traps
1. **[HARD] <trap label>** (scope: project, score: 0.85)
   > <trap evidence>
   - Source: `<sourceId>`

### Recommended Skills
1. **<skill label>** (score: 0.92)
   - Situation: <situation>
   - Problem: <problem>
   - Goal: <goal>
   - References: `references/guide.md`, `references/setup.md`
   - Scripts: `scripts/helper.sh` (policy: needs-approval)
   - Source: `<artifactId>`

### Capsules (from fallback)
...

### Routing
- Mode: <selectedMode>
- Confidence: <confidenceScore> (<confidenceBucket>)
- Channels: <channelsUsed>

<!-- /trapmap-load-context -->
```

---

## 6. Technical Approach Options

### Option A: Single v3 Endpoint (Recommended)

- Call `/v3/retrieval/search` directly
- Parse `plan` or `fallback` based on routing trace
- Simpler, leverages server-side routing logic

**Pros**: Server does heavy lifting, confidence routing built-in
**Cons**: Dependent on v3 endpoint stability

### Option B: Hybrid Multi-Endpoint

- Call `/v1/retrieval/skills/search-by-content` for skill search
- Call `/v3/retrieval/plan` for trap-first plan
- Merge results client-side

**Pros**: More control, can tune each call
**Cons**: More network calls, client-side merging complexity

### Option C: v2 Capsule + Manual Activation

- Call `/v2/retrieval/search` for capsule results + hints
- Process activation hints directly

**Pros**: Always returns capsules (no fallback variance)
**Cons**: No trap-first plan structure, loses graph relationships

**Recommendation**: Option A — `/v3/retrieval/search` is purpose-built for agent consumption and already handles confidence routing.

---

## 7. Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `packages/cli/src/lib/markdown-formatter.ts` | Markdown context block formatter |
| `packages/cli/src/lib/markdown-formatter.test.ts` | Formatter tests |
| `packages/cli/src/commands/load.ts` | `trapmap load` command |
| `packages/cli/src/commands/load.test.ts` | Command tests |

### Modified Files

| File | Change |
|------|--------|
| `packages/cli/src/index.ts` | Register `registerLoadCommand` |
| `.claude/skills/trapmap-knowledge-workflow/SKILL.md` | Add `trapmap load` to Control Path |
| `.claude/skills/trapmap-knowledge-workflow/references/retrieval.md` | Document `trapmap load` usage |

---

## 8. Testing Strategy

### Unit Tests

1. **markdown-formatter.test.ts**
   - Format empty plan
   - Format plan with traps only
   - Format plan with skills only
   - Format plan with both
   - Format fallback capsule results
   - Handle long content truncation
   - Escape special markdown characters

2. **load.test.ts**
   - Auth required error
   - Seed from argument
   - Seed from stdin
   - Filter by scope/label
   - JSON output flag
   - Handle API errors
   - Handle empty results

### Integration Tests

- Requires running server with test fixtures
- Test end-to-end flow with known seeds
- Verify markdown output structure

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Not authenticated | Throw: `Not authenticated. Run 'trapmap login' first.` |
| Empty seed | Throw: `Seed text is required` |
| No results | Output: `<!-- trapmap-load-context -->\nNo matching knowledge found.\n<!-- /trapmap-load-context -->` |
| API error | Pass through `ApiError` message |
| Activation failure | Include warning in markdown, continue |
| Script blocked | Include policy warning in markdown |
| Large result set | Truncate capsules, include count note |
| Invalid scope/label | Server validates, passes error through |

---

## 10. Validation Architecture

### Grep/File Checks (CI-verifiable)

```bash
# Command registered
grep -q "registerLoadCommand" packages/cli/src/index.ts

# Formatter exported
grep -q "formatLoadContext" packages/cli/src/lib/markdown-formatter.ts

# Tests exist
test -f packages/cli/src/commands/load.test.ts
test -f packages/cli/src/lib/markdown-formatter.test.ts

# SKILL.md updated
grep -q "trapmap load" .claude/skills/trapmap-knowledge-workflow/SKILL.md
```

### Runtime Testing

- `trapmap load --help` shows usage
- `trapmap load "test seed" --json` returns valid JSON
- Auth error when not logged in
- Markdown output structure valid

### Integration Testing

- End-to-end with test server
- Verify trap-first plan formatting
- Verify fallback formatting
- Verify activation integration

---

## 11. Code Excerpts for Reference

### API Request Pattern (from `retrieval.ts`)

```typescript
const response = await apiRequest<GraphPlanSearchResponse>(state, {
  method: 'POST',
  path: '/v3/retrieval/search',
  body: {
    seed,
    filters: { labels: flags.label, scopes: flags.scope ? [flags.scope] : [] },
    skillBudget: Number(flags.skillBudget),
    fallbackMode: 'auto',
  },
});

const parsed = graphPlanSearchResponseSchema.parse(response.data);
```

### Activation Pattern (from `operations/activate.ts`)

```typescript
const response = await apiRequest<ActivationResponse>(state, {
  method: 'POST',
  path: '/v1/operations/artifacts/activate',
  body: {
    artifactId: flags.artifact,
    revision: flags.revision,
    selectedPaths,
  },
});
```

### Output Pattern (from `output.ts`)

```typescript
export function printResult<T>(value: T, options: JsonFlag, formatter: (input: T) => string): void {
  if (options.json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(formatter(value));
}
```

---

## 12. Dependencies

- **Phase 86** (Gitignore Cleanup) — codebase clean state ✅
- **Existing infrastructure**:
  - `apiRequest`, `requireSessionToken`, `loadCliState` from `lib/http.js` and `lib/config.js`
  - `printResult` from `lib/output.js`
  - `resolveTextInput`, `collectValues` from `lib/input.js`
- **Contracts**:
  - `graphPlanSearchQuerySchema`, `graphPlanSearchResponseSchema` from `@trapmap/contracts`
  - `trapFirstPlanSchema`, `capsuleMatchSchema`
  - `activationRequestSchema`, `activationResponseSchema`

---

## 13. Open Questions

1. **Activation threshold**: How many top skills to auto-activate? (Suggest: top 1-2)
2. **Content truncation**: Max length for capsule content in markdown? (Suggest: 2000 chars)
3. **Reference selection**: Auto-select all references or only `.md` files? (Suggest: only `.md` and `.json`)
4. **SKILL.md rewrite scope**: Full rewrite or additive section? (Suggest: additive, preserve existing structure)

---

## RESEARCH COMPLETE
