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

供应商标识的完整取值见 `packages/ai-providers/src/provider-config.ts`，Ollama 与 Anthropic 相关行径未经本轮核实，取用前你亲自确认，未知/待确认（2026-09-08）。
