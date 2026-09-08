# AI 提供商抽象层

> 真源：`packages/ai-providers/src/adapters/aisdk.ts`、`packages/ai-providers/src/providers.ts`、`packages/ai-providers/src/provider-config.ts`。状态：Active。

## 单一导入点

`packages/ai-providers/src/adapters/aisdk.ts:23-27` 是仓库内唯一导入 `ai` 与 `@ai-sdk/*` 的模块。你所有 LLM 调用（chat 文本、单条与批量 embedding、temperature 与结构化变体）都经它的 5 个 helper：`resolveChatModel`、`resolveEmbeddingModel`、`generateChatText`、`embedSingle`、`embedBatch`（同文件第 53-177 行）。

## 提供商分支

`resolveChatModel` 与 `resolveEmbeddingModel` 把 vendor-neutral 的 `AiProviderConfig` 映射到 AI SDK 模型（`adapters/aisdk.ts:53-134`）：

| `provider` | chat 实现 | embedding 实现 | 缺省模型（`provider-config.ts:29-56`） |
|---|---|---|---|
| `openai` | `createOpenAI`（官方地址免配 baseURL） | `openai.embedding` | `gpt-4o-mini` / `text-embedding-3-small` |
| `openai-compatible`、`ollama` | `createOpenAICompatible`（baseURL 必填） | `compatible.embeddingModel` | ollama 缺省 `llama3` / `nomic-embed-text` |
| `google-genai` | `createGoogleGenerativeAI` | `google.textEmbeddingModel` | `gemini-2.0-flash` / `text-embedding-004` |
| `fallback` | 抛错（提示配 `AI_PROVIDER` 或 `OPENAI_API_KEY`） | 384 维确定性向量 | 无 |

`AI_PROVIDER` 环境变量显式选择四者之一；`OPENAI_API_KEY` 存在时隐式选 `openai`，`GEMINI_API_KEY` 存在时隐式选 `google-genai`，否则落 `fallback`（`provider-config.ts:66-84`）。

## 消费类

`packages/ai-providers/src/providers.ts:18-183` 提供 `AiSdkEmbeddings`（`embed` / `embedMany`）、`AiSdkChat`（`invoke` / `invokeWithTemperature` / `invokeWithBlocks`）与工厂 `createAiProviders`。`OpenAICompatibleEmbeddings`、`GoogleGenAIEmbeddings`、`OpenAICompatibleChat` 是 staged migration 别名，全部委托给 AiSdk 主类。`FallbackEmbeddings` 经 `createDeterministicFallbackVector(text, 384)` 产出确定性向量；`FallbackChat` 直接抛错。`embeddingProvider` 分离覆写存在时，embedding 走独立配置而 chat 走主配置（同文件第 166-177 行）。

## 可观测边界

`packages/ai-providers/src/observability.ts` 只接收注入的 `LlmObservationSink`，不依赖 `langfuse` SDK；SDK 导入只发生在 `packages/host-local/src/nest/observability/langfuse-sink.ts`。你在领域包里不要直接打 LLM 观测。

## 常见用法

### 你无 key 启动验证回退

前置条件：不设 `AI_PROVIDER`、`OPENAI_API_KEY`、`GEMINI_API_KEY`；离线可跑。

```bash
pnpm run dev -- local-agent
```

选型落 `fallback`（`packages/ai-providers/src/provider-config.ts:66-84`）；回退语义见本页「提供商分支」节。

### 你读模型解析分支

前置条件：离线可跑。

```bash
sed -n '53,134p' packages/ai-providers/src/adapters/aisdk.ts
```

helper 行号见本页「单一导入点」节。

### 你切 Ollama 验证兼容路径

前置条件：本地 Ollama 可达并配好 baseURL。

```bash
AI_PROVIDER=ollama pnpm run dev -- local-agent
```

`ollama` 分支走 `createOpenAICompatible`，映射表见本页「提供商分支」节。
