# `@trapmap/ai-providers`

你用这个包连接 chat / embedding 供应商并构建领域提示词，它是仓库唯一的 AI SDK 接入面。

## 入口

| 子路径 | 来源 | 内容 |
| --- | --- | --- |
| `@trapmap/ai-providers` | `packages/ai-providers/src/index.ts` | 供应商工厂与配置 |
| `@trapmap/ai-providers/prompts.js` | `packages/ai-providers/src/prompts.ts` | 提示词构建系统 |
| `@trapmap/ai-providers/ai-parse.js` | `packages/ai-providers/src/ai-parse.ts` | LLM 响应解析 |
| `@trapmap/ai-providers/prompts-knowledge.js` | `packages/ai-providers/src/prompts-knowledge.ts` | 知识类提示词 |

`packages/ai-providers/src/adapters/aisdk.ts` 集中全部 `ai` / `@ai-sdk/*` 调用，上层只消费 vendor-neutral 的 `ChatProvider` / `EmbeddingsProvider` 接口。

```ts
import { loadAiProviderConfig, createAiProviders } from '@trapmap/ai-providers';
import { buildPrompt } from '@trapmap/ai-providers/prompts.js';
import { parseJsonWithSchema } from '@trapmap/ai-providers/ai-parse.js';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `ai` | 统一 LLM 调用入口 |
| `@ai-sdk/openai` / `@ai-sdk/google` / `@ai-sdk/openai-compatible` | 供应商适配 |
| `@trapmap/lib` | 纯函数工具 |
| `zod` | 响应 schema 校验与重试 |
| `build` / `typecheck` | `tsc -p tsconfig.json` 编译 / 校验 |
| `test` | vitest `ai-providers` 项目 |

供应商标识的完整取值见 `packages/ai-providers/src/provider-config.ts`（默认值见下表，`openai-compatible` 需自配；Ollama 默认值见该文件 `:37-41`）。

| 供应商 | 类型标识 | 默认聊天模型 | 默认嵌入模型 |
| --- | --- | --- | --- |
| OpenAI | `openai` | `gpt-4o-mini` | `text-embedding-3-small` |
| Ollama | `ollama` | `llama3` | `nomic-embed-text` |
| Google GenAI | `google-genai` | `gemini-2.0-flash` | `text-embedding-004` |
| OpenAI 兼容 | `openai-compatible` | （需配置） | （需配置） |
| Fallback | `fallback` | （无） | 确定性哈希嵌入 |

环境变量（与 `docs/reference/ENVIRONMENT.md` AI 一节对照，落点 `provider-config.ts`）：`AI_PROVIDER`、`AI_BASE_URL`、`AI_API_KEY`、`AI_CHAT_MODEL`、`AI_EMBEDDING_MODEL`、`OPENAI_API_KEY`、`GEMINI_API_KEY`、`EMBEDDING_PROVIDER`、`EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL`。缺 key 时走确定性 fallback 向量，不抛错。

## 常见用法

### 跑本包测试

```bash
pnpm --filter @trapmap/ai-providers test
pnpm --filter @trapmap/ai-providers typecheck
```

### 读供应商配置并建 provider

```ts
import { loadAiProviderConfig } from '@trapmap/ai-providers';

const config = loadAiProviderConfig();
```

你传环境变量进进程后再调它，变量清单见本文行为一节（全表）。缺 key 时走确定性 fallback 向量，不抛错。
