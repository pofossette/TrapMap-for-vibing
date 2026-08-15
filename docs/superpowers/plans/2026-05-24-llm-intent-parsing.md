# LLM Intent Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace regex-only seed intent parsing in retrieval with an LLM-first parser plus deterministic fallback, cache, semantic-query support, observability fields, and matching test/eval/doc coverage.

**Architecture:** Keep the existing `parseSeedIntent()` as the deterministic baseline and add a new async `parseSeedIntentWithLLM()` wrapper that performs cache lookup, optional LLM extraction, schema validation, deterministic token/hint supplementation, and regex fallback. Wire the new parser into the v2 orchestrator, skill lookup, and graph plan compiler without changing external request contracts, then surface the new metadata only through server-local traces and eval normalization.

**Tech Stack:** TypeScript, Fastify, Vitest, Zod, existing `ChatProvider`, retrieval orchestration modules, retrieval eval runner.

---

## 文档信息

- 创建日期：2026-05-24
- 关联设计：`docs/superpowers/specs/2026-05-24-llm-intent-parsing-design.md`
- 输出文件：`plan.md`（项目根目录）
- 范围：`packages/server/src/lib/retrieval/**`、相关测试、`evals/retrieval/**`、检索/图计划文档
- 不在本阶段做的事：
  - 不改外部 API 请求体
  - 不做新的策略路由分支
  - 不把 `category` 接入打分逻辑
  - 不引入 Redis 或持久化缓存

## 阶段完成约束

**一个阶段完成，必须同时满足以下条件：**

- [ ] 本阶段所有 checkbox 已完成
- [ ] 本阶段要求的最小测试和类型检查已通过
- [ ] 本阶段要求更新的文档已同步
- [ ] 已进行一次提交，且提交信息能说明该阶段完成内容

**提交节奏要求：每完成一个阶段，提交一次。不要把多个阶段攒到最后一起提交。**

建议提交格式：

```bash
git add <本阶段涉及文件>
git commit --no-verify -m "feat(retrieval): <phase-summary>"
```

## 总体文件分解

### 主要代码文件

- `packages/server/src/lib/retrieval/types.ts`
  - 扩展 `ParsedIntent` 与 `IntentCategory`
- `packages/server/src/lib/retrieval/capsules/intent.ts`
  - 保留 `parseSeedIntent()`
  - 新增 `parseSeedIntentWithLLM()`
  - 新增 prompt/response parsing/retry/fallback 逻辑
- `packages/server/src/lib/retrieval/capsules/intent-cache.ts`
  - 新增缓存接口与默认内存实现
- `packages/server/src/lib/retrieval/capsules/index.ts`
  - 导出新 parser 与 cache
- `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
  - v2 改走 LLM parser
- `packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
  - 注入 `services.ai.chat`
  - 改走 LLM parser
- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
  - 注入 `services.ai.chat`
  - 改走 LLM parser
- `packages/server/src/lib/retrieval/capsules/channels/semantic.ts`
  - 优先使用 `intent.semanticQuery`

### 主要测试文件

- `packages/server/src/lib/retrieval/capsules/intent.test.ts`
- `packages/server/src/lib/retrieval/capsules/intent-cache.test.ts`
- `packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts`
- `packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts`
- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts`
- 其他所有手写 `ParsedIntent` fixture 的测试

### 主要文档文件

- `docs/architecture/components/RETRIEVAL.md`
- `docs/architecture/GRAPH_RETRIEVAL.md`
- `docs/reference/GLOSSARY.md`
- `docs/operations/TESTING.md`
- `evals/retrieval/README.md`
- `docs/superpowers/specs/2026-05-24-llm-intent-parsing-design.md`
  - 若实现与设计发生偏离，必须回写设计说明或备注差异

## Phase 0：实现前校准

**目标：** 先把约束、受影响文件和提交节奏写死，避免做到一半才发现签名或文档面不一致。

**涉及文件：**

- 修改：`plan.md`
- 阅读：`docs/superpowers/specs/2026-05-24-llm-intent-parsing-design.md`
- 阅读：`packages/server/src/lib/retrieval/{types.ts,capsules/intent.ts,orchestration/orchestrator.ts}`
- 阅读：`packages/server/src/lib/retrieval/capsules/{skill-lookup.ts,channels/semantic.ts}`
- 阅读：`packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`

- [x] **Step 0.1：确认本次实现边界**

验收要求：

- 明确保留现有 `parseSeedIntent()` 作为纯同步 deterministic baseline
- 明确新增的是包装式 `parseSeedIntentWithLLM()`，而不是直接重写原函数
- 明确 `category`/`semanticQuery`/`parseMethod` 只作为 server-local 扩展

示例结构：

```ts
export function parseSeedIntent(seed: string): ParsedIntent {
  // existing deterministic parser remains intact
}

export async function parseSeedIntentWithLLM(
  seed: string,
  chat: ChatProvider,
  options?: { cache?: IntentCacheStore },
): Promise<ParsedIntent> {
  // llm-first wrapper + fallback
}
```

注意事项：

- 不要把原同步函数偷偷改成 async；这会扩大改动面
- 不要让 fallback 依赖外部服务
- 不要在这一阶段动 scoring 权重

对应文档更新：

- `plan.md`：记录边界与阶段划分

- [x] **Step 0.2：确认每阶段提交一次的执行方式**

验收要求：

- 计划里每个阶段都出现单独的“提交检查”
- 每个阶段都给出建议提交信息

示例结构：

```md
### 本阶段提交
- [ ] 已执行 `git add ...`
- [ ] 已执行 `git commit --no-verify -m "feat(retrieval): ..."`
```

注意事项：

- 提交点必须放在每个阶段末尾，不能只在文末写一次

对应文档更新：

- `plan.md`

### Phase 0 完成检查

- [x] 计划边界已确认
- [x] 提交节奏已明确写入计划

### 本阶段提交

- [ ] 提交信息建议：`docs: add llm intent parsing execution plan`

### Phase 0 边界确认结果（2026-05-24）

经阅读源码确认：

- `parseSeedIntent()` 在 `capsules/intent.ts:287` 是纯同步函数，返回不含 `category`/`semanticQuery`/`parseMethod` 的 `ParsedIntent`
- `ParsedIntent` 在 `types.ts:181-198` 目前只有 8 个字段（seed, normalized, situation, problem, goal, errorText, tokens, stackPathHints），扩展时需保持向后兼容
- `orchestrator.ts:355` 在 v2 的 `intent` step 中 `Promise.resolve(parseSeedIntent(parsed.seed))` 为同步包装，改为 async 调用不会破坏 pipeline
- `skill-lookup.ts:109` 和 `plan-compiler.ts:65` 都在 async 函数中同步调用 `parseSeedIntent()`，改为 `await parseSeedIntentWithLLM()` 接入成本低
- `semantic.ts:100,181` 目前用 `intent.seed || intent.normalized`，需改为 `intent.semanticQuery || intent.seed || intent.normalized`
- 所有调用方都通过 `SkillShareerServices` 可访问 `services.ai.chat`

---

## Phase 1：扩展类型与缓存骨架

**目标：** 先把类型系统和缓存模块补齐，让后续实现有稳定落点。

**涉及文件：**

- 修改：`packages/server/src/lib/retrieval/types.ts`
- 新增：`packages/server/src/lib/retrieval/capsules/intent-cache.ts`
- 修改：`packages/server/src/lib/retrieval/capsules/index.ts`
- 修改：相关 `ParsedIntent` fixture 测试文件

- [ ] **Step 1.1：为 `ParsedIntent` 增加扩展字段**

验收要求：

- `ParsedIntent` 增加 `category`、`semanticQuery`、`parseMethod`
- 新增 `IntentCategory` 联合类型
- 现有调用方在类型层面都能编译通过

示例代码：

```ts
export type IntentCategory =
  | 'debugging'
  | 'configuration'
  | 'deployment'
  | 'performance'
  | 'integration'
  | 'security'
  | 'data'
  | 'testing'
  | 'general';

export interface ParsedIntent {
  seed: string;
  normalized: string;
  situation: string | null;
  problem: string | null;
  goal: string | null;
  errorText: string | null;
  tokens: NormalizedToken[];
  stackPathHints: StackPathHint[];
  category: IntentCategory | null;
  semanticQuery: string | null;
  parseMethod: 'regex' | 'llm';
}
```

注意事项：

- `parseMethod` 不要做成可选字段，否则后续 trace/测试会到处判空
- `semanticQuery` 限定为 `string | null`，不要引入数组或复杂结构
- 类型扩展后，所有手写 `ParsedIntent` fixture 都必须补字段

对应文档更新：

- `docs/reference/GLOSSARY.md`
- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 1.2：新增 intent cache 接口与默认实现**

验收要求：

- 提供 `IntentCacheStore` 接口
- 提供 `InMemoryIntentCache`
- 覆盖 TTL、容量上限、清空能力

示例代码：

```ts
export interface IntentCacheStore {
  get(key: string): ParsedIntent | null;
  set(key: string, intent: ParsedIntent): void;
  clear(): void;
}

export class InMemoryIntentCache implements IntentCacheStore {
  private store = new Map<string, { intent: ParsedIntent; createdAt: number }>();

  constructor(private readonly options: { maxSize?: number; ttlMs?: number } = {}) {}
}
```

注意事项：

- 只缓存 LLM 结果，不缓存 regex fallback 结果
- eviction 必须是稳定且可测试的行为
- key 必须统一为 `seed.toLowerCase().trim()`

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 1.3：同步更新所有 `ParsedIntent` 测试 fixture**

验收要求：

- 所有 `ParsedIntent` 手写对象都补齐三个新字段
- `pnpm typecheck` 不再报 “missing property”

示例结构：

```ts
const intent: ParsedIntent = {
  seed: 'docker deploy fails',
  normalized: 'docker deploy fails',
  situation: null,
  problem: 'deploy fails',
  goal: null,
  errorText: null,
  tokens: [],
  stackPathHints: [],
  category: null,
  semanticQuery: null,
  parseMethod: 'regex',
};
```

注意事项：

- 这一步不能漏掉 `packages/server/src/__tests__/lib/retrieval/*`
- `makeIntent()` 工厂函数优先统一补默认值，避免每个测试手填

对应文档更新：

- 无新增文档内容，但本阶段完成记录要写入 `plan.md`

### 本阶段最小验证

```bash
pnpm typecheck
pnpm test -- --run packages/server/src/lib/retrieval/capsules/intent.test.ts
```

### Phase 1 完成验收

- [x] `ParsedIntent` 扩展字段已落地
- [x] `IntentCacheStore` / `InMemoryIntentCache` 已创建
- [x] 所有 `ParsedIntent` fixture 已同步
- [x] 最小验证通过

### 本阶段提交

- [ ] 提交信息建议：`feat(retrieval): add llm intent types and cache primitives`

---

## Phase 2：实现 LLM parser 主体与 fallback

**目标：** 在不破坏旧 parser 的前提下，实现可缓存、可重试、可降级的 `parseSeedIntentWithLLM()`。

**涉及文件：**

- 修改：`packages/server/src/lib/retrieval/capsules/intent.ts`
- 修改：`packages/server/src/lib/retrieval/capsules/index.ts`
- 修改：`packages/server/src/lib/retrieval/capsules/intent.test.ts`
- 新增：`packages/server/src/lib/retrieval/capsules/intent-cache.test.ts`

- [ ] **Step 2.1：保持旧 parser 返回扩展后的 regex 结果**

验收要求：

- `parseSeedIntent()` 继续是纯同步函数
- 它返回的对象已经补上：
  - `category: null`
  - `semanticQuery: null`
  - `parseMethod: 'regex'`

示例代码：

```ts
return {
  seed,
  normalized,
  situation,
  problem,
  goal,
  errorText,
  tokens,
  stackPathHints,
  category: null,
  semanticQuery: null,
  parseMethod: 'regex',
};
```

注意事项：

- 这里不要加入任何 chat/cache 逻辑
- 空 seed 路径也必须返回完整字段

对应文档更新：

- `docs/reference/GLOSSARY.md`

- [ ] **Step 2.2：补 LLM response schema、prompt builder、response parser**

验收要求：

- 在 `intent.ts` 内或同模块中定义 zod schema
- 使用现有 `stripCodeFences()`，不要重复造轮子
- response parse 失败时返回 `null`，由外层决定重试或 fallback

示例代码：

```ts
const intentExtractionSchema = z.object({
  situation: z.string().nullable(),
  problem: z.string().nullable(),
  goal: z.string().nullable(),
  errorText: z.string().nullable(),
  category: z.enum(INTENT_CATEGORY_VALUES).nullable(),
  semanticQuery: z.string().max(200).nullable(),
});

function parseIntentExtractionResponse(raw: string) {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed = JSON.parse(cleaned);
    const result = intentExtractionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
```

注意事项：

- `semanticQuery` 上限必须在 schema 层约束
- 不要接受额外自由格式文本
- prompt 要求只返回 JSON，避免后面 parser 容错成本继续上涨

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 2.3：实现 `parseSeedIntentWithLLM()` 主流程**

验收要求：

- 支持 cache lookup
- `chat.isConfigured === false` 时直接 regex fallback
- LLM 成功时保留 deterministic `tokens` 和 `stackPathHints`
- 任一异常时返回 regex fallback

示例代码：

```ts
export async function parseSeedIntentWithLLM(
  seed: string,
  chat: ChatProvider,
  options?: { cache?: IntentCacheStore },
): Promise<ParsedIntent> {
  const normalizedSeed = seed.toLowerCase().trim();
  const cached = options?.cache?.get(normalizedSeed);
  if (cached) return cached;

  if (!chat.isConfigured) {
    return parseSeedIntent(seed);
  }

  const fallback = parseSeedIntent(seed);
  const extraction = await invokeIntentExtraction(chat, seed);
  if (!extraction) return fallback;

  const result: ParsedIntent = {
    seed,
    normalized: normalizedSeed,
    situation: extraction.situation,
    problem: extraction.problem,
    goal: extraction.goal,
    errorText: extraction.errorText,
    tokens: seed.split(/\s+/).filter(Boolean).map(normalizeToken),
    stackPathHints: extractStackPathHints(normalizedSeed),
    category: extraction.category,
    semanticQuery: extraction.semanticQuery,
    parseMethod: 'llm',
  };

  options?.cache?.set(normalizedSeed, result);
  return result;
}
```

注意事项：

- `normalized` 必须跟缓存 key 一致
- 成功路径不要直接复用 fallback 对象后再 mutate
- cache 命中对象必须已经是完整 `ParsedIntent`

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 2.4：实现重试与指数退避**

验收要求：

- 总共 3 次尝试
- backoff 为 100ms / 400ms
- parse 失败和 invoke 抛错都进入重试逻辑

示例代码：

```ts
const maxRetries = 2;
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    const raw = await chat.invoke(systemPrompt, seed);
    const parsed = parseIntentExtractionResponse(raw);
    if (parsed) return parsed;
  } catch {}

  if (attempt < maxRetries) {
    await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt * 2)));
  }
}
return null;
```

注意事项：

- 不要只对 `invoke()` 抛错重试，schema 失败也需要重试
- 退避逻辑要与 `llm-dedup.ts` / `contextual-enrichment.ts` 风格一致

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 2.5：为 parser 和 cache 补单测**

验收要求：

- `intent.test.ts` 覆盖：
  - LLM happy path
  - fenced JSON
  - parse failure retry
  - invalid category retry/fallback
  - unconfigured chat -> regex fallback
  - deterministic tokens/hints 仍存在
- `intent-cache.test.ts` 覆盖：
  - hit
  - ttl expiry
  - max size eviction
  - clear

示例测试结构：

```ts
it('falls back to regex when chat is not configured', async () => {
  const chat: ChatProvider = {
    provider: 'test',
    isConfigured: false,
    invoke: vi.fn(),
  };

  const result = await parseSeedIntentWithLLM('docker deploy fails', chat);
  expect(result.parseMethod).toBe('regex');
  expect(result.category).toBeNull();
  expect(chat.invoke).not.toHaveBeenCalled();
});
```

注意事项：

- cache test 不要依赖真实时间等待太久，优先用 mock 时间
- parser test 里要断言 `parseMethod`

对应文档更新：

- `docs/operations/TESTING.md`

### 本阶段最小验证

```bash
pnpm test -- --run packages/server/src/lib/retrieval/capsules/intent.test.ts
pnpm test -- --run packages/server/src/lib/retrieval/capsules/intent-cache.test.ts
pnpm typecheck
```

### Phase 2 完成验收

- [x] `parseSeedIntentWithLLM()` 已实现
- [x] fallback / retry / cache 已实现
- [x] parser 与 cache 单测通过

### 本阶段提交

- [x] 提交信息建议：`feat(retrieval): add llm-backed intent parser with fallback`

---

## Phase 3：接入 v2 orchestrator 与 semantic channel

**目标：** 先接入最核心的 v2 检索链路，并让 semantic 通道消费 `semanticQuery`。

**涉及文件：**

- 修改：`packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- 修改：`packages/server/src/lib/retrieval/capsules/channels/semantic.ts`
- 修改：`packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts`
- 修改：`packages/server/src/__tests__/lib/retrieval/capsule-semantic-channel.test.ts`

- [ ] **Step 3.1：在 orchestrator 中创建模块级 intent cache**

验收要求：

- `orchestrator.ts` 内存在可复用的 `InMemoryIntentCache`
- 每次请求不会重复 new 一个 cache

示例代码：

```ts
const intentCache = new InMemoryIntentCache();
```

注意事项：

- 模块级 cache 可以接受进程内生命周期；本阶段不要引入复杂注入
- 不要把 cache 挂在 request scope

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 3.2：将 v2 intent step 改为 LLM parser**

验收要求：

- `searchKnowledgeV2()` 的 `intent` step 改为 async parser
- 使用 `services.ai.chat`
- trace、组装、治理逻辑保持不变

示例代码：

```ts
const intent = await timedStep(
  'intent',
  () => parseSeedIntentWithLLM(parsed.seed, services.ai.chat, { cache: intentCache }),
  steps,
);
```

注意事项：

- 不要把 routing selector 变成依赖 `intent.category`；设计明确说本阶段不做
- 不要改 v2 route 的请求/响应 schema

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 3.3：semantic channel 优先使用 `semanticQuery`**

验收要求：

- memory path 和 PG path 都优先读取 `intent.semanticQuery`
- 当 `semanticQuery` 为空时回退到 `seed` / `normalized`

示例代码：

```ts
const queryText = intent.semanticQuery || intent.seed || intent.normalized;
```

注意事项：

- 两条路径必须保持一致，不要只改 memory 或只改 PG
- 空白字符串要当作不可用处理

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 3.4：补 v2 orchestrator 与 semantic channel 测试**

验收要求：

- orchestrator test 能覆盖：
  - `services.ai.chat.isConfigured = false`
  - LLM path 返回 `parseMethod: 'llm'`
  - routing trace 仍可落日志
- semantic channel test 能覆盖：
  - 存在 `semanticQuery` 时优先使用它
  - 缺失时回退 `seed`

示例测试结构：

```ts
expect(generateEmbedding).toHaveBeenCalledWith(
  'fastify ECONNREFUSED kubernetes deployment networking',
);
```

注意事项：

- 若当前 test 是 mock `parseSeedIntent`，这里要改 mock/export，支持新函数
- 不要只断言函数被调用，要断言具体 query text

对应文档更新：

- `docs/operations/TESTING.md`

### 本阶段最小验证

```bash
pnpm test -- --run packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts
pnpm test -- --run packages/server/src/__tests__/lib/retrieval/capsule-semantic-channel.test.ts
pnpm typecheck
```

### Phase 3 完成验收

- [x] v2 orchestrator 已接 LLM parser
- [x] semantic channel 已优先使用 `semanticQuery`
- [x] 相关测试通过

### 本阶段提交

- [x] 提交信息建议：`feat(retrieval): wire llm intent parsing into v2 search`

---

## Phase 4：接入 skill lookup 与 graph plan compiler

**目标：** 让两个复用 intent 的 helper 与主检索保持一致能力，不再停留在旧 regex-only 路径。

**涉及文件：**

- 修改：`packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
- 修改：`packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
- 修改：`packages/server/src/routes/retrieval.ts`（仅当签名变更需要）
- 修改：`packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts`
- 修改：`packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts`
- 修改：`packages/server/src/lib/retrieval/graph-plan/graph-plan-search.test.ts`（若受影响）

- [ ] **Step 4.1：为 skill lookup 注入 chat + cache**

验收要求：

- `searchSkillsByContent()` 内改为调用 `parseSeedIntentWithLLM()`
- 直接使用 `services.ai.chat`
- cache 采用模块级或文件级共享实例

示例代码：

```ts
const intent = await parseSeedIntentWithLLM(parsed.text, services.ai.chat, {
  cache: intentCache,
});
```

注意事项：

- 当前 `searchSkillsByContent()` 已有 `services`，优先用现有 `services.ai.chat`，不要改成从 route 额外传参
- 保持返回契约不变

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 4.2：为 trap-first plan compiler 注入 chat + cache**

验收要求：

- `compileTrapFirstPlan()` 内改用 async parser
- 其余 graph expansion / budget / edge assembling 逻辑不变

示例代码：

```ts
const intent = await parseSeedIntentWithLLM(query.seed, services.ai.chat, {
  cache: intentCache,
});
```

注意事项：

- `compileTrapFirstPlan()` 已经是 async；这里只改变内部一步，不要扩散到 route 契约
- graph path 仍然主要依赖 `tokens` 与 `stackPathHints`，因此 deterministic supplement 不能丢

对应文档更新：

- `docs/architecture/GRAPH_RETRIEVAL.md`
- `docs/architecture/components/RETRIEVAL.md`

- [ ] **Step 4.3：补 skill lookup / plan compiler 测试**

验收要求：

- skill lookup test 覆盖：
  - chat 未配置时仍可检索
  - LLM path 不影响 governance 过滤
- plan compiler test 覆盖：
  - LLM path 不影响 trap/skill 识别
  - fallback 到 regex 时仍可编译计划

示例测试结构：

```ts
expect(result.matches[0]?.artifactId).toBe('artifact-1');
expect(result.plan?.recommendedSkills.length ?? result.recommendedSkills.length).toBeGreaterThan(0);
```

注意事项：

- 不要只测 “函数没抛错”，要测核心行为没回归
- 若 mock service 没有 `ai.chat`，这里要补齐最小实现

对应文档更新：

- `docs/operations/TESTING.md`

### 本阶段最小验证

```bash
pnpm test -- --run packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts
pnpm test -- --run packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts
pnpm test -- --run packages/server/src/lib/retrieval/graph-plan/graph-plan-search.test.ts
pnpm typecheck
```

### Phase 4 完成验收

- [x] skill lookup 已接 LLM parser
- [x] plan compiler 已接 LLM parser
- [x] governance / graph-plan 行为回归测试通过

### 本阶段提交

- [x] 提交信息建议：`feat(retrieval): share llm intent parsing across lookup and graph plan`

---

## Phase 5：扩展 trace、测试矩阵与 eval 兼容层

**目标：** 把新增字段带到可观测层，并确保 eval 工具链不会因为响应/trace 变化而失真。

**涉及文件：**

- 修改：`packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- 修改：`packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts`
- 修改：`packages/server/src/routes/retrieval.test.ts`
- 修改：`evals/retrieval/lib/normalize.ts`
- 修改：`evals/retrieval/lib/normalize.test.ts`
- 修改：`evals/retrieval/lib/report.ts`（若报告需要展示）
- 修改：`evals/retrieval/README.md`

- [ ] **Step 5.1：把 `parseMethod` / `category` 写入 routing trace metadata**

验收要求：

- v2 RAG log metadata 中可见新字段
- 不破坏现有 `routingTrace` 必填结构

示例结构：

```ts
metadata: {
  filters: parsed.filters,
  maxResults: parsed.maxResults,
  routingTrace: {
    ...toRoutingTrace(routingDecision),
    parseMethod: intent.parseMethod,
    intentCategory: intent.category,
  },
}
```

注意事项：

- 优先写到 log metadata，不要急着改 contracts 层公共 schema
- 字段命名保持稳定，避免 eval 归一化层再做多套兼容

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`
- `docs/operations/TESTING.md`

- [ ] **Step 5.2：同步 eval normalize / report 层**

验收要求：

- `evals/retrieval/lib/normalize.ts` 在保留旧字段的同时兼容新 trace 字段
- 若报告展示 trace，则新字段不会导致解析失败

示例代码：

```ts
routingTrace: {
  selectedMode: routingTrace.selectedMode,
  routingReason: routingTrace.routingReason,
  fallbackApplied: routingTrace.fallbackApplied,
  channelsUsed: routingTrace.channelsUsed,
  parseMethod: routingTrace.parseMethod,
  intentCategory: routingTrace.intentCategory,
},
```

注意事项：

- 只有在上游真的产出字段时才读取；避免旧 fixture 全部失效
- 如果不准备在 report 中展示，也至少要保证 normalize 不丢字段

对应文档更新：

- `evals/retrieval/README.md`
- `docs/operations/TESTING.md`

- [ ] **Step 5.3：补 route / eval normalize 测试**

验收要求：

- `routes/retrieval.test.ts` 断言 v2 响应链路仍可用
- `normalize.test.ts` 覆盖：
  - `parseMethod: 'llm'`
  - `intentCategory: 'deployment'`
  - 缺省时仍兼容旧响应

示例测试结构：

```ts
expect(result.routingTrace?.parseMethod).toBe('llm');
expect(result.routingTrace?.intentCategory).toBe('deployment');
```

注意事项：

- 这里要区分“路由响应体”与“RAG log metadata”；如果不把新字段暴露到 HTTP 响应，不要误改 route schema
- route test 更应关注“不破坏返回契约”

对应文档更新：

- `docs/operations/TESTING.md`

- [ ] **Step 5.4：新增 retrieval eval 对照要求**

验收要求：

- 至少有一条说明：比较 `semanticQuery` 开启前后效果
- smoke/core 的运行说明已写入文档

示例执行命令：

```bash
pnpm eval:retrieval:smoke
pnpm eval:retrieval:core
```

注意事项：

- 本阶段不一定要新增整套数据集，但必须明确如何做 baseline 对比
- 若没有 feature flag，就至少记录“当前实现 vs 修改前基线”的手工比较方式

对应文档更新：

- `evals/retrieval/README.md`
- `docs/operations/TESTING.md`

### 本阶段最小验证

```bash
pnpm test -- --run packages/server/src/routes/retrieval.test.ts
pnpm test -- --run evals/retrieval/lib/normalize.test.ts
pnpm typecheck
pnpm eval:retrieval:smoke
```

### Phase 5 完成验收

- [x] trace metadata 已包含 `parseMethod` / `intentCategory`
- [x] eval normalize/report 已兼容
- [x] route 与 eval 测试通过
- [x] smoke eval 已运行

### 本阶段提交

- [x] 提交信息建议：`feat(retrieval): add llm intent trace and eval compatibility`

---

## Phase 6：文档收尾、全量验证与差异回写

**目标：** 把实现结果、验证方式、设计偏差全部补齐，形成可交付状态。

**涉及文件：**

- 修改：`docs/architecture/components/RETRIEVAL.md`
- 修改：`docs/architecture/GRAPH_RETRIEVAL.md`
- 修改：`docs/reference/GLOSSARY.md`
- 修改：`docs/operations/TESTING.md`
- 修改：`evals/retrieval/README.md`
- 修改：`docs/superpowers/specs/2026-05-24-llm-intent-parsing-design.md`（若实现偏离设计）
- 修改：`plan.md`

- [ ] **Step 6.1：更新检索架构文档**

验收要求：

- `RETRIEVAL.md` 写清：
  - `parseSeedIntentWithLLM()` 入口
  - cache/fallback/retry 行为
  - semantic channel 使用 `semanticQuery`
- `GRAPH_RETRIEVAL.md` 写清：
  - `compileTrapFirstPlan()` 现在复用 LLM parser wrapper

示例文档结构：

```md
#### LLM Intent Parsing

- deterministic baseline: `parseSeedIntent()`
- async wrapper: `parseSeedIntentWithLLM()`
- fallback: any LLM failure -> regex
- cache: process-local `InMemoryIntentCache`
```

注意事项：

- 文档要描述“现状”，不要保留未来时
- 流程图里如果还写死 `parseSeedIntent()`，要更新为 wrapper 或注明 fallback 关系

对应文档更新：

- `docs/architecture/components/RETRIEVAL.md`
- `docs/architecture/GRAPH_RETRIEVAL.md`

- [ ] **Step 6.2：更新术语与测试文档**

验收要求：

- `GLOSSARY.md` 补充 `IntentCategory` / `semanticQuery` / `parseMethod`
- `TESTING.md` 补充 parser/cache 测试命令与 eval 检查要求

示例文档结构：

```md
| `packages/server/src/lib/retrieval/capsules/intent.ts` | Impl | `parseSeedIntent()` + `parseSeedIntentWithLLM()` |
```

注意事项：

- 不要只补架构文档，测试文档也要更新运行命令

对应文档更新：

- `docs/reference/GLOSSARY.md`
- `docs/operations/TESTING.md`

- [ ] **Step 6.3：若实现偏离设计，回写设计文档差异**

验收要求：

- 若实现没有采用设计文档里的某个字面方案，必须记录原因
- 例如：
  - 直接复用 `services.ai.chat`，而非额外注入 `chat` 参数
  - 直接复用 `stripCodeFences()`，而非手写 regex

示例结构：

```md
## Implementation Notes

- Reused `stripCodeFences()` from `lib/ai/parse.ts`
- Helper integrations consume `services.ai.chat` directly to match current service shape
```

注意事项：

- 这是为了防止设计和实现长期漂移
- 若完全一致，可写 “No material divergence as of 2026-05-24”

对应文档更新：

- `docs/superpowers/specs/2026-05-24-llm-intent-parsing-design.md`

- [ ] **Step 6.4：执行最终验证**

验收要求：

- 至少完成以下命令：

```bash
pnpm typecheck
pnpm test -- --run packages/server/src/lib/retrieval/capsules/intent.test.ts
pnpm test -- --run packages/server/src/lib/retrieval/orchestration/orchestrator.test.ts
pnpm test -- --run packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts
pnpm test -- --run packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts
pnpm test -- --run packages/server/src/routes/retrieval.test.ts
pnpm eval:retrieval:smoke
```

注意事项：

- 如果时间允许，再跑：

```bash
pnpm eval:retrieval:core
```

- 若任一验证失败，不得标记阶段完成

对应文档更新：

- `plan.md`：记录最终执行结果与剩余风险

### Phase 6 完成验收

- [x] 架构文档已更新
- [x] 术语与测试文档已更新
- [x] 设计偏差已回写或确认无偏差
- [x] 最终验证通过

### 本阶段提交

- [x] 提交信息建议：`docs(retrieval): finalize llm intent parsing rollout notes`

---

## 实施时的统一注意事项

- [ ] 不要修改任何外部请求 schema，仅做 server 内部增强
- [ ] 不要让 `category` 进入排序分数，当前阶段只做透传和观测
- [ ] 不要让 `semanticQuery` 为空字符串进入 embedding 查询
- [ ] 不要缓存 regex fallback 结果，避免掩盖临时 LLM 能力恢复
- [ ] 不要遗漏任何 `ParsedIntent` fixture
- [ ] 不要在 route test 中误把日志 metadata 当成 HTTP 响应字段
- [ ] 不要把多个阶段改动混成一次提交

## 推荐执行顺序

1. Phase 1：先稳住类型与缓存
2. Phase 2：实现 parser 主体
3. Phase 3：接 v2 主链路
4. Phase 4：补齐 lookup / graph plan
5. Phase 5：做 trace / eval 兼容
6. Phase 6：文档与最终验证

## 最终交付清单

- [ ] 根目录 `plan.md` 已完成
- [ ] 所有阶段都有复选框步骤
- [ ] 所有阶段都有验收要求
- [ ] 所有阶段都有示例结构或代码
- [ ] 所有阶段都有注意事项
- [ ] 所有阶段都有文档更新要求
- [ ] 所有阶段都明确“完成一个阶段提交一次”
