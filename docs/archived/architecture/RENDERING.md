# CLI 多工具渲染适配层

## 概述

TrapMap CLI 内置渲染适配层，根据运行环境（AI 工具 / 终端）自动选择输出格式。同一份检索结果可输出为 XML（Claude Code）、JSON（Codex）、Markdown（OpenCode）或纯文本（generic）。

> 源码：`packages/cli/src/lib/output-profile.ts`、`packages/cli/src/lib/output.ts`

---

## 工具配置文件（Tool Profile）

每个 Profile 定义三个维度：

| 字段 | 类型 | 说明 |
|------|------|------|
| `tool` | `OutputToolProfile` | 运行工具：`claude-code` / `codex` / `opencode` / `generic` |
| `verbosity` | `OutputVerbosity` | 详细程度：`compact` / `normal` / `detailed` |
| `graphPlanMode` | `OutputGraphPlanMode` | 图计划输出模式：`full` / `skill-list` / `summary` |

附加选项：
- `modelHint?: OutputModelHint` — 模型提示（影响输出风格）
- `includeRawHints: boolean` — 是否包含原始激活提示
- `renderMode?: 'json'` — 强制 JSON 输出（绕过 Profile 渲染）

---

## RenderKind 类型

```typescript
type RenderKind =
  | 'retrieval-v1'    // v1 条目级检索结果
  | 'retrieval-v2'    // v2 胶囊检索结果
  | 'graph-plan'      // v3 图计划检索结果
  | 'skill-lookup'    // 技能内容搜索结果
  | 'artifact-export' // 工件导出结果
  | 'command-result'  // 通用命令执行结果
  | 'generic';        // 兜底
```

---

## RenderEnvelope 结构

所有渲染器接收统一的 `RenderEnvelope`：

```typescript
interface RenderEnvelope<T = unknown> {
  kind: RenderKind;
  payload: T;                    // 原始 API 响应
  context: RenderEnvelopeContext;
}

interface RenderEnvelopeContext {
  commandName?: string;
  tool: OutputToolProfile;
  modelHint?: OutputModelHint;
  verbosity: OutputVerbosity;
  graphPlanMode: OutputGraphPlanMode;
  includeRawHints: boolean;
}
```

---

## Renderer Registry

注册表以 `Record<OutputToolProfile, Partial<Record<RenderKind, Renderer>>>` 形式组织。四种工具的渲染行为差异：

### `claude-code` — XML 输出

输出 `<trapmap_skill_pack>` 或 `<trapmap_command_result>` XML 结构。适合 Claude Code 解析，字段使用 XML 标签包裹，值经 `xmlEscape` 转义。

示例（graph-plan）：
```xml
<trapmap_skill_pack>
  <summary>2 recommended skill(s), 1 blocking trap(s)</summary>
  <selected_path>graph-plan</selected_path>
  <confidence>high</confidence>
  <recommended_skills>
    <skill>{"artifactId":"...","label":"..."}</skill>
  </recommended_skills>
  <blocking_traps>
    <trap>{"label":"...","severity":"high"}</trap>
  </blocking_traps>
  <next_steps>
    <step>1. Apply trap mitigation first</step>
  </next_steps>
</trapmap_skill_pack>
```

### `codex` — JSON 输出

输出结构化 JSON 对象。字段使用 snake_case（如 `query_summary`、`next_steps`、`activation_hints`）。graph-plan 在 `skill-list` 模式下省略 traps 和 activation_hints。

### `opencode` — Markdown 输出

输出人类可读的 Markdown。每个 RenderKind 有独立的格式化逻辑：
- `graph-plan`：`# Goal` → `## Recommended Skills` → `## Blocking Traps` → `## Suggested Execution Order`
- `retrieval-v1`：`# Goal` → `## Global Constraints` → `## Project Knowledge`
- `retrieval-v2`：`# Goal` → `## Capsules` → `## Profile Hints`
- `skill-lookup`：`# Goal` → `## Matches`
- `command-result`：`# Result` → `## Summary` → `## Artifacts` → `## Next Steps`

### `generic` — 纯文本输出

最简单的格式，每行一个字段。作为所有工具的兜底回退。

---

## --json 绕过机制

当用户传入 `--json` 标志或 Profile 的 `renderMode` 为 `'json'` 时，直接输出原始 JSON，完全绕过 Profile 渲染：

```typescript
if (options.json || state.outputProfile?.renderMode === 'json') {
  console.log(JSON.stringify(originalValue, null, 2));
  return;
}
```

---

## 回退策略

渲染链的回退顺序：

1. **Profile 渲染**：使用 `resolveRenderer(profile, kind)` 查找匹配的渲染器
2. **Generic 回退**：若 Profile 渲染器不存在，回退到 `registry.generic[kind]`
3. **Legacy 格式化**：若无 Profile 或渲染器抛出异常，使用命令级 `legacyFormatter` 输出纯文本
4. **JSON 兜底**：`--json` 始终可用，不受渲染器状态影响

```typescript
export function resolveRenderer(profile: OutputProfile, kind: RenderKind): Renderer {
  return (
    registry[profile.tool][kind] ??
    registry.generic[kind] ??
    registry.generic.generic
  ) as Renderer;
}
```

---

## 使用方式

CLI 命令通过两个入口函数使用渲染适配层：

- `printCommandResult()` — 通用命令结果（审核、编辑、导入等）
- `printAdaptiveResult()` — 检索类命令结果（自动识别 RenderKind）

两者均接受 `CliState`（含 OutputProfile）和 `JsonFlag`，在 Profile 渲染和 legacy 格式化之间自动切换。
