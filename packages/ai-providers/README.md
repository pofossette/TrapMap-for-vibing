
# @trapmap/ai-providers

TrapMap 的 AI 基础设施层，负责 AI 供应商连接、多供应商提示词模板系统、提示词缓存和 LLM 响应解析。

## 职责

| 职责 | 说明 |
|---|---|
| 供应商工厂 | 创建和管理 Chat 和 Embeddings 供应商实例（OpenAI、Ollama、Google GenAI 等） |
| 环境配置 | 从环境变量解析 AI 供应商配置，支持自动检测和显式指定 |
| 提示词模板 | 多供应商提示词模板系统（XML/JSON 格式），支持模板覆盖和插槽合并 |
| 提示词缓存 | LRU section cache + API cache control，支持 Anthropic 等供应商的 prompt caching |
| 动态注入 | 运行时占位符替换（`${WORKING_DIR}`、`${DATE}`、`${GIT_STATUS}` 等） |
| 响应解析 | LLM JSON 响应清洗、Zod schema 验证和自动重试 |
| 领域提示词 | 边界提取、知识精炼、声明验证、图谱提取、标签对齐等任务的专用提示词构建器 |

## 不包含的内容

- 不负责 HTTP 服务器或路由
- 不包含具体的业务逻辑（知识摄取、治理审查等）
- 不包含数据库或消息队列连接

## 入口

- `src/index.ts` — 供应商工厂和配置导出
- `src/prompts.ts` — 提示词构建系统导出
- `src/ai-parse.ts` — LLM 响应解析工具导出
- `src/prompts-knowledge.ts` — 知识相关提示词构建器导出

## 子路径导出

```typescript
// 供应商工厂和配置
import { loadAiProviderConfig, createAiProviders } from '@trapmap/ai-providers';

// 提示词构建系统
import { buildPrompt, buildPromptWithCacheControl } from '@trapmap/ai-providers/prompts.js';

// LLM 响应解析
import { stripCodeFences, parseJsonWithSchema, invokeWithParseRetry } from '@trapmap/ai-providers/ai-parse.js';

// 知识相关提示词
import { buildKnowledgeRefinementSystemPrompt, buildClaimVerificationSystemPrompt } from '@trapmap/ai-providers/prompts-knowledge.js';
```

## 支持的 AI 供应商

| 供应商 | 类型标识 | 默认聊天模型 | 默认嵌入模型 |
|---|---|---|---|
| OpenAI | `openai` | `gpt-4o-mini` | `text-embedding-3-small` |
| Ollama | `ollama` | `llama3` | `nomic-embed-text` |
| Google GenAI | `google-genai` | `gemini-2.0-flash` | `text-embedding-004` |
| OpenAI 兼容 | `openai-compatible` | (需配置) | (需配置) |
| Fallback | `fallback` | (无) | 确定性哈希嵌入 |

## 环境变量

### 主供应商配置

| 变量 | 说明 | 示例 |
|---|---|---|
| `AI_PROVIDER` | 显式指定供应商类型 | `openai`、`ollama`、`google-genai` |
| `AI_BASE_URL` | API 基础 URL | `https://api.openai.com/v1` |
| `AI_API_KEY` | API 密钥 | `sk-xxx` |
| `AI_CHAT_MODEL` | 聊天模型名称 | `gpt-4o-mini` |
| `AI_EMBEDDING_MODEL` | 嵌入模型名称 | `text-embedding-3-small` |
| `OPENAI_API_KEY` | OpenAI 专用密钥（优先于 `AI_API_KEY`） | `sk-xxx` |
| `GEMINI_API_KEY` | Google GenAI 专用密钥（优先于 `AI_API_KEY`） | `AIza...` |

### 独立嵌入供应商配置

| 变量 | 说明 |
|---|---|
| `EMBEDDING_PROVIDER` | 独立嵌入供应商类型 |
| `EMBEDDING_BASE_URL` | 嵌入 API 基础 URL |
| `EMBEDDING_API_KEY` | 嵌入 API 密钥 |
| `EMBEDDING_MODEL` | 嵌入模型名称 |

### 提示词模板配置

| 变量 | 说明 |
|---|---|
| `AI_PROMPT_PROVIDER` | 提示词模板供应商（`anthropic`、`openai`、`deepseek`、`kimi`、`gemini`、`default`） |
| `AI_PROMPT_TEMPLATE_FILE` | 自定义模板覆盖文件路径（JSON 格式） |

### 供应商自动检测优先级

1. `AI_PROVIDER` 显式指定
2. `OPENAI_API_KEY` 存在 → `openai`
3. `GEMINI_API_KEY` 存在 → `google-genai`
4. 都不存在 → `fallback`

## 使用示例

### 基本用法

```typescript
import { loadAiProviderConfig, createAiProviders } from '@trapmap/ai-providers';

// 加载配置（从环境变量）
const config = loadAiProviderConfig();

// 创建供应商实例
const providers = createAiProviders(config);

// 使用聊天供应商
if (providers.chat.isConfigured) {
  const response = await providers.chat.invoke('你是一个助手', '你好');
  console.log(response);
}

// 使用嵌入供应商
if (providers.embeddings.isConfigured) {
  const vector = await providers.embeddings.embed('hello world');
  console.log(vector.length); // 向量维度
}
```

### 提示词构建

```typescript
import { buildPrompt, buildPromptWithCacheControl } from '@trapmap/ai-providers/prompts.js';

// 构建简单提示词字符串
const prompt = buildPrompt('boundary-extraction', {
  role: 'a boundary extraction assistant',
  task: 'Extract structured boundary constraints...',
  corePrinciples: ['Prioritize actionable facts'],
  constraints: ['Return valid JSON'],
});

// 构建带缓存控制的提示词块（用于 Anthropic prompt caching）
const sections = buildPromptWithCacheControl('knowledge-refinement', {
  role: 'a knowledge refinement assistant',
  task: 'Produce concise summaries...',
});
```

### LLM 响应解析

```typescript
import { stripCodeFences, parseJsonWithSchema, invokeWithParseRetry } from '@trapmap/ai-providers/ai-parse.js';
import { z } from 'zod';

// 清洗 markdown code fences
const raw = '```json\n{"key": "value"}\n```';
const cleaned = stripCodeFences(raw); // '{"key": "value"}'

// 带 schema 验证的 JSON 解析
const schema = z.object({ key: z.string() });
const result = parseJsonWithSchema(cleaned, schema); // { key: "value" } | null

// 自动重试的 LLM 调用
const parsed = await invokeWithParseRetry({
  invoke: () => llm.invoke('Extract JSON...'),
  schema: z.object({ nodes: z.array(z.object({ label: z.string() })) }),
  maxRetries: 2,
  backoffMs: (attempt) => 100 * 2 ** (attempt * 2),
});
```

### 结构化生成

新管线应优先使用 provider-neutral 的 `generateStructured`；它统一 code fence 清洗、Zod 校验、bounded retry、raw output hash 和 redacted failure metadata：

```typescript
import { generateStructured } from '@trapmap/ai-providers';
import { z } from 'zod';

const result = await generateStructured({
  chat: providers.chat,
  system: 'Return only JSON.',
  prompt: 'Extract the control signal.',
  schema: z.object({ strategy: z.string().min(1) }).strict(),
  maxRetries: 2,
});

console.log(result.value, result.model, result.attempts, result.rawTextSha256);
```

`maxRetries` 默认为 `2`，允许范围是 `0..5`。重试耗尽时抛出 `StructuredGenerationError`，其 `lastFailureClass` 只暴露 `chat-unconfigured`、`invoke`、`json-parse` 或 `schema-validation`。

### 领域提示词构建器

```typescript
import {
  buildBoundaryExtractionSystemPrompt,
  buildBoundaryExtractionSystemPromptBlocks,
} from '@trapmap/ai-providers/prompts.js';

import {
  buildKnowledgeRefinementSystemPrompt,
  buildClaimVerificationSystemPrompt,
} from '@trapmap/ai-providers/prompts-knowledge.js';

// 边界提取提示词
const boundaryPrompt = buildBoundaryExtractionSystemPrompt();

// 带缓存控制的边界提取提示词块
const boundaryBlocks = buildBoundaryExtractionSystemPromptBlocks();

// 知识精炼提示词
const refinementPrompt = buildKnowledgeRefinementSystemPrompt({ maxSentences: 5 });

// 声明验证提示词
const verificationPrompt = buildClaimVerificationSystemPrompt({ strict: true });
```

## 提示词模板系统

### 模板格式

- **XML 格式**（anthropic、deepseek、gemini、default）：使用 `{{var}}`、`{{#if var}}...{{/if}}`、`{{#list var}}...{{/list}}` 语法
- **JSON 格式**（openai、kimi）：使用 `{{var}}`、`{{#list var}}...{{/list}}` 语法，支持 `_if_varName` 条件键

### 模板覆盖

通过 `AI_PROMPT_TEMPLATE_FILE` 环境变量指定 JSON 文件，按任务类型覆盖默认模板插槽：

```json
{
  "boundary-extraction": {
    "role": "自定义角色描述",
    "task": "自定义任务描述",
    "corePrinciples": ["自定义原则1", "自定义原则2"],
    "constraints": ["自定义约束"]
  },
  "knowledge-refinement": {
    "constraints": ["保持在 5 句话以内"]
  }
}
```

### 支持的任务类型

| 任务类型 | 说明 |
|---|---|
| `boundary-extraction` | 提取知识条目的边界约束 |
| `knowledge-refinement` | 精炼搜索结果为简洁摘要 |
| `claim-verification` | 验证摘要声明是否被上下文支持 |
| `graph-extraction` | 从文本提取知识图谱实体和关系 |
| `graph-extraction-planner` | 文本分段规划（用于长文本） |
| `label-alignment` | 标签对齐到规范目录 |

## 提示词缓存

### LRU Section Cache

- 单例 LRU 缓存，最大 1000 条目，默认 TTL 1 小时
- 使用 SHA-256 哈希检测内容变化
- 提供 `resetSectionCache()`、`clearAllSections()`、`getSectionCacheSize()` 管理接口

### API Cache Control

- 支持 Anthropic 的 `cache_control: { type: 'ephemeral', scope: 'global' }` 格式
- 静态部分（role、core_principles 等）标记为可缓存
- 动态部分（examples、当前环境等）不缓存
- 使用 `__CACHE_BOUNDARY__` 标记分隔静态和动态内容

### 缓存指标

```typescript
import { getCacheMetrics, resetCacheMetrics } from '@trapmap/ai-providers/ai-cache/metrics.js';

const metrics = getCacheMetrics();
console.log(`命中率: ${metrics.hitRate}`);
console.log(`总请求: ${metrics.totalRequests}`);
console.log(`缓存命中: ${metrics.cacheHits}`);
console.log(`缓存未命中: ${metrics.cacheMisses}`);
```

## 动态内容注入

### 预定义占位符

| 占位符 | 解析值 |
|---|---|
| `${WORKING_DIR}` | 当前工作目录 |
| `${DATE}` | 当前日期（YYYY-MM-DD） |
| `${GIT_STATUS}` | Git 状态输出 |
| `${SESSION_ID}` | 随机会话 ID |
| `${MCP_SERVERS}` | MCP 服务器状态（仅 knowledge-refinement 任务） |

### 条件内容

```typescript
import { getConditionalContent, getDefaultConditionalRules } from '@trapmap/ai-providers/ai-dynamic/index.js';

const rules = getDefaultConditionalRules();
const content = getConditionalContent(rules, {
  isPlanMode: true,
  modelType: 'deepseek-chat',
  taskType: 'boundary-extraction',
});
```

## 核心类型

```typescript
// 供应商配置
interface AiProviderConfig {
  readonly provider: AiProviderType;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly chatModel: string;
  readonly embeddingModel: string;
  readonly isConfigured: boolean;
  readonly promptTemplateFile: string | null;
  readonly embeddingProvider?: { ... };
}

// 供应商实例
interface AiProviders {
  embeddings: EmbeddingsProvider;
  chat: ChatProvider;
}

// 聊天供应商接口
interface ChatProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  invoke(systemPrompt: string, userMessage: string): Promise<string>;
  invokeWithBlocks?(blocks: AiPromptBlock[], userMessage: string): Promise<string>;
}

// 嵌入供应商接口
interface EmbeddingsProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  embed(text: string): Promise<number[]>;
}

// 提示词插槽
interface PromptSlots {
  role?: string;
  task?: string;
  corePrinciples?: string[];
  outputInstructions?: string[];
  constraints?: string[];
  examples?: string[];
  metadata?: { taskType: AiPromptTaskType; title: string; outputFormatHint?: string };
}

// 缓存段
interface CacheSection {
  readonly name: string;
  readonly content: string;
  readonly cacheScope: 'global' | 'org' | null;
}

// API 缓存控制块
interface PromptBlock {
  content: string;
  cache_control?: { type: 'ephemeral'; scope: 'global' | 'organization' };
}
```

## 目录结构

```
src/
├── index.ts                    # 主入口：供应商工厂和配置
├── providers.ts                # 供应商实现（OpenAI、Google GenAI、Fallback）
├── provider-config.ts          # 环境变量配置解析
├── types.ts                    # 核心类型定义
├── prompts.ts                  # 提示词系统入口（barrel re-export）
├── prompt-builder.ts           # 核心提示词构建逻辑
├── prompts-boundary.ts         # 边界提取提示词
├── prompts-knowledge.ts        # 知识精炼和声明验证提示词
├── prompts-graph.ts            # 图谱提取提示词
├── prompts-label.ts            # 标签对齐提示词
├── ai-parse.ts                 # LLM 响应解析工具
├── ai-providers/               # 提示词模板系统
│   ├── index.ts                # 供应商选择和模板加载
│   ├── types.ts                # 提示词系统类型
│   ├── defaults.ts             # 供应商配置注册表
│   ├── xml-renderer.ts         # XML 模板渲染器
│   ├── json-renderer.ts        # JSON 模板渲染器
│   └── templates/              # 模板文件
│       ├── anthropic.xml
│       ├── openai.json
│       ├── deepseek.xml
│       ├── kimi.json
│       ├── gemini.xml
│       └── default.xml
├── ai-cache/                   # 提示词缓存系统
│   ├── api-integration.ts      # API 缓存控制集成
│   ├── boundary-marker.ts      # 静态/动态边界标记
│   ├── section-cache.ts        # LRU section 缓存
│   └── metrics.ts              # 缓存命中/未命中指标
├── ai-dynamic/                 # 动态内容注入
│   ├── index.ts                # 动态注入入口
│   ├── injections.ts           # 占位符替换引擎
│   ├── context-resolver.ts     # 运行时上下文解析器
│   └── conditions.ts           # 条件内容规则
└── *.test.ts                   # 测试文件
```

## 测试

```bash
# 运行测试
pnpm --dir ../.. exec vitest run --project ai-providers

# 类型检查
pnpm typecheck

# 构建
pnpm build
```

## 依赖

| 依赖 | 用途 |
|---|---|
| `@langchain/core` | LangChain 核心类型（消息类型等） |
| `@langchain/openai` | OpenAI 兼容的聊天和嵌入实现 |

## 设计原则

1. **供应商无关** — 通过统一接口抽象不同 AI 供应商
2. **配置驱动** — 所有行为通过环境变量控制，零代码修改
3. **缓存友好** — 提示词系统原生支持 Anthropic 等供应商的 prompt caching
4. **类型安全** — 完整的 TypeScript 类型定义和 Zod schema 验证
5. **可测试** — 确定性 Fallback 实现，无需真实 API 即可测试
6. **模块化** — 子路径导出允许按需导入，减少打包体积
