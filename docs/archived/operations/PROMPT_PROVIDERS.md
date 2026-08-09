# 提示提供商配置指南

提示系统使用**基于提供商的模板架构**，为不同的 AI 模型系列渲染特定格式的提示（XML 或 JSON）。本指南涵盖提供商选择、模板自定义和环境变量配置。

## 架构概览

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PromptSlots │ ──> │ 提供商选择   │ ──> │ 模板覆盖     │ ──> │ 渲染器       │
│  （任务数据）│     │              │     │              │     │ （XML / JSON）│
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                     ↑                     ↑
                     │ modelId 或          │ AI_PROMPT_TEMPLATE_FILE
                     │ AI_PROMPT_PROVIDER  │ （JSON slot 覆盖）
```

管线流程：
1. **PromptSlots** 定义任务内容（role、task、constraints 等）
2. **提供商选择** 根据模型 ID 或环境变量选择最优格式
3. **模板覆盖** 从 JSON 文件合并 slot 级自定义
4. **渲染器** 生成最终提示字符串（XML 或 JSON）

## 支持的提供商

| 提供商      | 格式  | 推荐用于            | 性能说明                                   |
|-------------|-------|---------------------|--------------------------------------------|
| `anthropic` | XML   | Claude 模型         | 原生 XML 处理，针对缓存优化                |
| `openai`    | JSON  | GPT / o1 / o3       | JSON 结构化输出，函数调用                  |
| `deepseek`  | XML   | DeepSeek 模型       | 需要显式格式说明                           |
| `kimi`      | JSON  | Kimi / Moonshot     | 避免 XML；偏好 JSON 或纯文本               |
| `gemini`    | XML   | Gemini 模型         | XML 加 JSON 回退效率                       |
| `default`   | XML   | 任何其他模型        | 通用兼容                                   |

## 提供商选择

### 自动选择（按模型 ID）

提供 `modelId` 时，`selectProvider()` 会与已知模式匹配：

```typescript
import { selectProvider } from './lib/ai/providers/index.js';

const provider = selectProvider('claude-opus-4-6');
// => { name: 'anthropic', format: 'xml', ... }

const provider = selectProvider('gpt-4o');
// => { name: 'openai', format: 'json', ... }
```

**模式匹配规则：**

| 模型 ID 包含                | 选择的提供商    |
|-----------------------------|-----------------|
| `claude`                    | `anthropic`     |
| `gpt`、`o1`、`o3`、`chatgpt` | `openai`        |
| `deepseek`                  | `deepseek`      |
| `kimi`、`moonshot`          | `kimi`          |
| `gemini`                    | `gemini`        |
| （无匹配）                  | `default`       |

### 显式提供商（通过环境变量）

设置 `AI_PROMPT_PROVIDER` 可强制使用特定提供商，忽略模型 ID：

```bash
AI_PROMPT_PROVIDER=anthropic
```

有效值：`anthropic`、`openai`、`deepseek`、`kimi`、`gemini`、`default`。

### 解析优先级

`resolveProvider()` 使用以下回退链：

1. 显式 `provider` 参数（最高优先级）
2. `AI_PROMPT_PROVIDER` 环境变量
3. `'default'`（最低优先级）

## 提示 Slots

所有提供商共享相同的 `PromptSlots` 接口。Slots 是填入提供商模板的内容"变量"。

```typescript
interface PromptSlots {
  role?: string;              // 助手角色描述
  task?: string;              // 任务指令
  corePrinciples?: string[];  // 核心操作原则
  outputInstructions?: string[]; // 输出格式规范
  constraints?: string[];     // 行为约束
  examples?: string[];        // 使用示例
  metadata?: {
    taskType: AiPromptTaskType;
    title: string;
    outputFormatHint?: string;
  };
}
```

### 任务类型

系统支持五种任务类型：

| 任务类型                    | 说明                                     |
|-----------------------------|------------------------------------------|
| `boundary-extraction`       | 从文本中提取结构化边界约束               |
| `knowledge-refinement`      | 将搜索结果总结为简洁知识                 |
| `claim-verification`        | 根据提供的上下文验证声明                 |
| `graph-extraction`          | 从文本中提取图实体（节点 + 边）          |
| `graph-extraction-planner`  | 为并行实体提取分割输入文本               |

### 按任务类型的动态注入

提示构建根据任务类型注入运行时上下文：

| 任务类型                    | 基础注入                                  | MCP 状态 |
|-----------------------------|-------------------------------------------|----------|
| `boundary-extraction`       | WORKING_DIR、DATE、GIT_STATUS、SESSION_ID | 否       |
| `knowledge-refinement`      | WORKING_DIR、DATE、GIT_STATUS、SESSION_ID | **是**   |
| `claim-verification`        | WORKING_DIR、DATE、GIT_STATUS、SESSION_ID | 否       |
| `graph-extraction`          | WORKING_DIR、DATE、GIT_STATUS、SESSION_ID | 否       |
| `graph-extraction-planner`  | WORKING_DIR、DATE、GIT_STATUS、SESSION_ID | 否       |

只有 `knowledge-refinement` 任务会接收 MCP 服务器状态（`${MCP_SERVERS}`）。
MCP 状态以 JSON 数组形式返回，待与 MCP 服务器管理器集成。

## 模板格式

### XML 模板（anthropic、deepseek、gemini、default）

XML 模板使用 mustache 风格语法，包含三个指令：

```
{{var}}                   — 标量替换（XML 转义）
{{#if var}}...{{/if}}     — 条件块（slot 为 falsy 时移除）
{{#list var}}...{{/list}} — 数组迭代（每个元素替换 {{item}}）
```

示例模板（`anthropic.xml`）：

```xml
<system_instructions>
  <role>{{role}}</role>

  {{#if corePrinciples}}
  <core_principles>
    {{#list corePrinciples}}
    <item>{{item}}</item>
    {{/list}}
  </core_principles>
  {{/if}}

  <task>{{task}}</task>

  {{#if constraints}}
  <constraints>
    {{#list constraints}}
    <item>{{item}}</item>
    {{/list}}
  </constraints>
  {{/if}}
</system_instructions>
```

HTML 注释（`<!-- ... -->`）在渲染前被剥离。被移除块产生的空行会被折叠。

### JSON 模板（openai、kimi）

JSON 模板使用相同的占位符语法，附加元数据约定：

- `_template`、`_doc`、`_format` -- 文档键，从输出中剥离
- `_if_slotName` -- 当前一个键的 slot 为 falsy 时，移除相邻的数据键

示例模板（`openai.json`）：

```json
{
  "_template": "openai",
  "_format": "json",
  "role": "{{role}}",
  "task": "{{task}}",
  "_if_corePrinciples": true,
  "core_principles": [
    "{{#list corePrinciples}}",
    "{{item}}",
    "{{/list}}"
  ],
  "_if_constraints": true,
  "constraints": [
    "{{#list constraints}}",
    "{{item}}",
    "{{/list}}"
  ]
}
```

渲染后，元数据键和空数组从输出中移除。

## 自定义模板

### 通过 JSON 文件覆盖 Slot

使用 `AI_PROMPT_TEMPLATE_FILE` 按任务类型覆盖特定 slot 值，无需修改模板文件。

覆盖文件格式：

```json
{
  "boundary-extraction": {
    "role": "自定义边界提取助手",
    "constraints": ["所有字段均为可选。", "仅返回有效 JSON。"]
  },
  "knowledge-refinement": {
    "corePrinciples": ["优先考虑可操作的事实。"]
  }
}
```

可覆盖字段：`role`、`task`、`corePrinciples`、`outputInstructions`、`constraints`、`examples`。均为可选 -- 仅指定的字段会覆盖默认值。

**Slot 值解析顺序**：

1. 通过 `buildPrompt()` 编程传入的 slots
2. 模板覆盖文件（`AI_PROMPT_TEMPLATE_FILE`）
3. 任务特定的内置默认值

### 自定义模板文件

要使用完全自定义的模板，请将模板文件（XML 或 JSON）放在 `packages/server（Wave-10 已删除）/src/lib/ai/providers/templates/` 中，并在 `defaults.ts` 中注册。

## API 参考

### `buildPrompt(taskType, slots, modelId?): string`

构建完整的系统提示字符串。这是大多数用例的主要 API。

```typescript
import { buildPrompt } from './lib/ai/prompts.js';

// 从模型 ID 自动选择提供商
const prompt = buildPrompt('boundary-extraction', mySlots, 'claude-opus-4-6');

// 使用环境变量中的提供商
const prompt = buildPrompt('knowledge-refinement', mySlots);
```

### `buildPromptWithCacheControl(taskType, slots, modelId?): CacheSection[]`

构建分解为 `CacheSection[]` 的提示，用于细粒度缓存控制。详见 [PROMPT_CACHING.md](./PROMPT_CACHING.md)。

### 向后兼容的构建器

这些函数使用内置 slot 定义和默认提供商：

```typescript
import {
  buildBoundaryExtractionSystemPrompt,
  buildKnowledgeRefinementSystemPrompt,
  buildClaimVerificationSystemPrompt,
} from './lib/ai/prompts.js';

const boundaryPrompt = buildBoundaryExtractionSystemPrompt();
const refinementPrompt = buildKnowledgeRefinementSystemPrompt({ maxSentences: 5 });
const verificationPrompt = buildClaimVerificationSystemPrompt({ strict: false });
```

### 提供商工具

```typescript
import {
  selectProvider,      // 按模型 ID 选择
  resolveProvider,     // 按名称 / 环境变量选择
  loadProviderTemplate,// 加载原始模板字符串
  getProviderConfig,   // 获取完整的 ProviderConfig 对象
  listProviders,       // 列出所有提供商名称
  isAiPromptProvider,  // 类型守卫
} from './lib/ai/providers/index.js';
```

## 环境变量

| 变量                        | 说明                                       | 默认值                               |
|-----------------------------|--------------------------------------------|--------------------------------------|
| `AI_PROMPT_PROVIDER`        | 强制指定提供商名称                         | `'default'`（从模型自动检测）        |
| `AI_PROMPT_TEMPLATE_FILE`   | JSON slot 覆盖文件路径                     | `docs/reference/system-prompt-slots.default.json` |

**注意：** 空字符串环境变量视为未设置：
- `AI_PROMPT_TEMPLATE_FILE=""` → 回退到默认文件
- `AI_PROMPT_PROVIDER=""` → 回退到 `'default'`

### AI 提供商 API 密钥优先级

对于 AI 提供商配置（由 `loadAiProviderConfig()` 使用），提供商特定密钥优先于通用 `AI_API_KEY`：

1. `OPENAI_API_KEY` / `GEMINI_API_KEY` -- 提供商特定（最高优先级）
2. `AI_API_KEY` -- 通用回退
3. 提供商默认值 -- 内置默认值（最低优先级）

示例：如果同时设置了 `OPENAI_API_KEY=sk-old` 和 `AI_API_KEY=sk-new`，则使用 `sk-old`，因为提供商特定密钥优先。
