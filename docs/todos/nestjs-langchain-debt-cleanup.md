# NestJS / LangChain / Neo4j 技术债清理

> 来源：简历技术选型审查，确认 TrapMap 中三个外部依赖均未使用其核心特性，手搓实现存在可替换的脆弱点。

## 背景

| 技术 | 当前用途 | 是否使用核心特性 |
|---|---|---|
| **NestJS** | `host-local` 部署模式的应用层壳（Modules/Guards/Pipes/Filters） | ❌ 所有能力均可由 Fastify 原生 hook 替代 |
| **LangChain** | 仅 `@langchain/openai` 的 `ChatOpenAI` 和 `OpenAIEmbeddings` | ❌ 未使用 chain/agent/prompt template 等框架特性 |
| **Neo4j** | `GraphQueryBackend` 的分布式后端（被抽象层封装） | ✅ Cypher 查询用于图扩展，保留 |

## TODO

### P0 — 替换手搓 resilience 为 `cockatiel`

**问题**：`packages/server/src/lib/runtime/resilience.ts` 手搓了 retry + timeout + fail-open/fail-closed。`withTimeout` 用 `setTimeout` 包 Promise，**没有 `AbortController` 取消机制** — retry 时旧 Promise 仍挂起，造成连接泄漏。

**替换方案**：[cockatiel](https://github.com/connor4312/cockatiel)，纯 TypeScript，API 接近现有 `ResiliencePolicy`。

**迁移步骤**：

- [ ] 安装 `cockatiel`
- [ ] 在 `packages/server/src/lib/runtime/` 创建 `resilience-v2.ts`，基于 cockatiel 重写 `executeWithResilience`
- [ ] 保持现有 `ResiliencePolicy` / `ResilienceResult` 接口不变（适配层）
- [ ] 确保 `recordRuntimeExecution` / `recordRuntimeRetry` metrics 集成保留
- [ ] 迁移 `llm-extract.ts`、`llm-align.ts`、`capsule-recall-coordinator.ts` 等调用点
- [ ] 删除旧 `resilience.ts`

**风险**：低（cockatiel 无外部依赖，接口兼容）

---

### P1 — LLM 结构化输出替换为 `.withStructuredOutput()`

**问题**：`packages/server/src/lib/indexing/graph-lite/llm-extract.ts:113-121` 手搓了 `stripCodeFences` + `JSON.parse` + `zod.safeParse`。LLM 返回格式不稳定，`parseExtractionPlan` / `parseLlmExtraction` 都在手动处理边界情况。

**替换方案**：`@langchain/openai` 的 `.withStructuredOutput(zodSchema)`，在 API 层强制 JSON Schema 约束，不需要后处理。

**迁移步骤**：

- [ ] 确认目标 LLM provider（OpenAI / Anthropic）支持 structured output
- [ ] 在 `providers.ts` 的 `ChatProvider` 接口中新增 `invokeStructured<T>(schema, systemPrompt, userMessage)` 方法
- [ ] `OpenAICompatibleChat` 实现使用 `.withStructuredOutput(zodSchema)`
- [ ] `FallbackChat` 保留现有手动解析作为降级
- [ ] 迁移 `planExtraction` → `invokeStructured(extractionPlanSchema, ...)`
- [ ] 迁移 `extractSegmentEntities` → `invokeStructured(extractionSchema, ...)`
- [ ] 迁移 `callLlmAlignment` → `invokeStructured(alignmentSchema, ...)`
- [ ] 删除 `stripCodeFences` / `parseExtractionPlan` / `parseLlmExtraction` 中的手动解析逻辑

**风险**：低（Zod schema 已有，structured output 是 OpenAI/Anthropic 原生能力）

---

### P2（可选） — 去掉 NestJS，改用 Fastify 原生

**问题**：`packages/host-local/src/nest/` 引入 NestJS 仅用于 DI + HTTP 中间件，未使用 NestJS 的任何独特能力。

**替换方案**：直接用 Fastify 的 `preHandler`（替代 Guards）、`onRequest`（替代 Middleware）、`setErrorHandler`（替代 Exception Filters）、工厂函数（替代 DI）。

**迁移步骤**：

- [ ] 创建 `packages/host-local/src/fastify/` 替代 `nest/`
- [ ] 将 NestJS Modules 拆解为 Fastify 插件（`fastify-plugin`）
- [ ] Guards → Fastify `preHandler` hooks
- [ ] Pipes（validation）→ Zod + Fastify schema 验证
- [ ] Exception Filters → Fastify `setErrorHandler`
- [ ] 保持 `createHostLocalServices` 工厂函数不变（已经是纯函数 DI）
- [ ] 移除 `@nestjs/*` 依赖

**风险**：中（需要调整启动流程，但业务逻辑不涉及 NestJS）

---

## 不替换项

| 项 | 原因 |
|---|---|
| **Prompt 模板系统**（`buildPrompt` + 多 provider 渲染器） | 比 LangChain 的 `ChatPromptTemplate` 更强：支持 6 种 provider 自动选择、XML/JSON/Markdown 三种格式、模板覆盖文件、cache control 分区 |
| **Neo4j GraphQueryBackend** | 图查询的生产级持久化后端，Cypher 查询用于一跳扩展和子图构建，无法用内存图替代 |
| **FailOpenGraphQueryBackend** | Neo4j 主 + graphology 备的降级策略，设计合理 |
| **AI Provider 抽象** | `ChatProvider` / `EmbeddingsProvider` 接口 + `FallbackEmbeddings` 降级，已有正确封装 |
