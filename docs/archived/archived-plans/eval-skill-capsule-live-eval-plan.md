# Skill Capsule vs Bare Skill — Live Eval 改造计划

> 状态：待实现
> 依赖：现有 skill-identification eval 脚手架 + LLM API 接入
> 目标：将 dry-run fixture 回放改为真实检索 + LLM 推理，获得可信的 capsule 提升数据

---

## 1 问题诊断：当前 eval 为什么测不出真实提升

```
当前流程（dry-run）：
  硬编码 context ──→ prompt 模板 ──→ golden path 回放 ──→ 字符串匹配打分
       ↑                                        ↑
    无检索                                   无 LLM

问题：capsule 和 summary 注入的是同一个人写的 fixture，
      actor 直接回放 goldenPath，输出完全相同，
      评分差异仅来自 capsule_signal_usage 维度的硬编码逻辑。
      整条链路没有"LLM 看到不同 context 后做出不同决策"这个环节。
```

### 需要替换的两个核心环节

| 环节 | 当前（placeholder） | 目标（真实） |
|---|---|---|
| **检索** | fixture 硬编码注入 | 从 skill store 真实检索，按 strategy 返回不同格式 |
| **推理** | golden path 回放 | 调用 Claude API，让 LLM 自主选择 skill |

---

## 2 目标架构

```
taskPrompt
    │
    ├─ strategy: keyword-capsule
    │     └─ capsule retriever ──→ [capsule-card, capsule-card, ...]
    │
    ├─ strategy: direct-summary
    │     └─ summary retriever ──→ [skill-profile, skill-profile, ...]
    │
    └─→ prompt template（注入检索结果 + 干扰项）
            │
            └─→ Claude API（live LLM）
                    │
                    └─→ normalize → judge → report
```

### 核心变化

1. **新增 `Retriever` 接口**：抽象检索行为，两种 strategy 各一个实现
2. **新增 `SkillStore`**：从 fixture 文件加载 skill/capsule 数据，供 retriever 查询
3. **新增 `LLMActor`**：替换 dry-run actor，调用 Claude API
4. **改造 `executeCase`**：根据 case 的 `matchStrategy` 选择 retriever，再调 LLM actor
5. **保留 dry-run 路径**：作为 CI 快速冒烟，live 模式用于真实评测

---

## 3 分阶段实现

### Phase 1：SkillStore（预计 1 个 PR）

**新增文件**：`evals/agent-planning/lib/skill-store.ts`

职责：
- 从 `evals/fixtures/skills/` 加载所有 skill（repo + oss）
- 提供统一查询接口：按 id 查、按 keyword 查、按 label 查

```ts
interface SkillRecord {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  labels: string[];
  source: 'repo' | 'oss';
  capsuleIds?: string[];
  body?: string;            // SKILL.md 原文
}

interface SkillStore {
  getById(id: string): SkillRecord | undefined;
  searchByKeyword(query: string, limit: number): SkillRecord[];
  searchBySummary(query: string, limit: number): SkillRecord[];
  listAll(): SkillRecord[];
}
```

**数据来源**：
- `evals/fixtures/skills/repo/*.json` → 直接解析
- `evals/fixtures/skills/oss/*/meta.json` + `SKILL.md` → 解析 meta + 读取 body
- `evals/fixtures/traps/skill-format/*/SKILL.md` → 复用为干扰项来源
- `packages/skills/*/SKILL.md` → 主力自建 skill 来源

### Phase 2：Retriever 接口与实现（预计 1 个 PR）

**新增文件**：`evals/agent-planning/lib/retriever.ts`

```ts
interface RetrievalResult {
  entries: AgentPlanningContextEntry[];   // 注入 prompt 的 context 条目
  scores: { id: string; score: number }[];  // 命中分数（用于报告）
}

interface Retriever {
  retrieve(query: string, options: { limit: number }): Promise<RetrievalResult>;
}
```

**两种实现**：

#### 3a. KeywordCapsuleRetriever

模拟 capsule 检索流程：
1. 从 taskPrompt 提取关键词（简单分词 + 去停用词）
2. 用关键词匹配 capsule 的 keyword 字段
3. 返回命中 capsule 的结构化卡片文本（`kind: 'capsule-card'`）

```ts
class KeywordCapsuleRetriever implements Retriever {
  constructor(private store: SkillStore) {}

  async retrieve(query: string, { limit }: { limit: number }): Promise<RetrievalResult> {
    const keywords = extractKeywords(query);  // 简单分词
    const all = this.store.listAll();
    const scored = all.map(skill => ({
      skill,
      score: keywords.filter(kw => skill.keywords.includes(kw)).length / keywords.length,
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    return {
      entries: scored.map(({ skill, score }) => toCapsuleCard(skill, score)),
      scores: scored.map(({ skill, score }) => ({ id: skill.id, score })),
    };
  }
}
```

#### 3b. DirectSummaryRetriever

模拟直接摘要匹配：
1. 用 taskPrompt 文本与 skill summary 做简单相似度（词重叠）
2. 返回 skill 的摘要视图（`kind: 'skill-profile'`）

```ts
class DirectSummaryRetriever implements Retriever {
  constructor(private store: SkillStore) {}

  async retrieve(query: string, { limit }: { limit: number }): Promise<RetrievalResult> {
    const queryTokens = tokenize(query);
    const all = this.store.listAll();
    const scored = all.map(skill => ({
      skill,
      score: jaccard(queryTokens, tokenize(skill.summary)),
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    return {
      entries: scored.map(({ skill }) => toSkillProfile(skill)),
      scores: scored.map(({ skill, score }) => ({ id: skill.id, score })),
    };
  }
}
```

**设计决策**：
- Phase 2 使用简单的关键词/词重叠匹配，不引入 embedding 或 pgvector
- 这已经比当前的"完全硬编码"进了一大步——检索结果由 taskPrompt 动态决定
- 后续可替换为真实向量检索，Retriever 接口不变

### Phase 3：LLM Actor（预计 1 个 PR）

**新增文件**：`evals/agent-planning/lib/llm-actor.ts`

```ts
interface LLMActorOptions {
  provider: 'anthropic' | 'openai';
  model: string;
  maxTokens: number;
  temperature: number;
}

interface LLMActorResult {
  actorOutput: string;
  tokenUsage: { input: number; output: number };
  latencyMs: number;
}
```

**实现要点**：

1. 读取环境变量获取 API key（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`）
2. 构造 system prompt + user prompt（复用现有 `prompt-loader.ts`）
3. 调用 Claude API，获取原始输出
4. 返回 `{ actorOutput, tokenUsage, latencyMs }`

**system prompt 设计**：

```
你是一个技能选择智能体。给定用户任务和一组候选技能，
你需要：
1. 分析用户需求
2. 从候选技能中选择最匹配的
3. 制定执行计划

输出格式：
1. <步骤>
2. <步骤>
...
Selected skill: <skill-id>
Final answer: <一句话总结>
```

**关键约束**：
- temperature = 0（确定性，可复现）
- max_tokens = 1024（避免输出过长）
- 超时 = 30s
- 失败重试 1 次

### Phase 4：改造 executeCase 流程（预计 1 个 PR）

**修改文件**：`evals/agent-planning/run.ts`

核心变化：

```ts
async function executeCase(caseDefinition, scenario, options) {
  let context: string;

  if (options.dryRun) {
    // 保留现有路径：使用 scenario 中硬编码的 context
    context = renderScenarioContext(caseDefinition, scenario);
  } else {
    // Live 路径：根据 matchStrategy 选择 retriever
    const retriever = caseDefinition.matchStrategy === 'keyword-capsule'
      ? new KeywordCapsuleRetriever(skillStore)
      : new DirectSummaryRetriever(skillStore);

    const retrieval = await retriever.retrieve(scenario.taskPrompt, { limit: 5 });
    const interference = buildInterferenceEntries(caseDefinition.interferenceLevel);
    context = renderRetrievedContext(retrieval.entries, interference);
  }

  const prompt = renderPromptTemplate(template, { taskPrompt: scenario.taskPrompt, context });

  const actorResult = options.dryRun
    ? await runActor(caseDefinition, scenario, { dryRun: true, provider: 'fallback', prompt })
    : await runLLMActor(prompt, llmOptions);

  // 后续 normalize → precheck → judge 不变
  ...
}
```

**新增 CLI 参数**：

```bash
# 现有 dry-run（CI 冒烟）
pnpm exec tsx evals/agent-planning/run.ts --tier smoke --dry-run

# 新增 live 模式（真实评测）
pnpm exec tsx evals/agent-planning/run.ts --tier smoke --live \
  --provider anthropic \
  --model claude-sonnet-4-20250514 \
  --runs-per-case 3    # 每个 case 跑 3 次取平均，消除随机性
```

### Phase 5：Report 扩展——真实检索指标（预计 1 个 PR）

**修改文件**：`evals/agent-planning/lib/report.ts`

在 group summary 中新增：

```ts
interface RetrievalMetrics {
  capsuleRetrievalPrecision: number;   // 检索结果中命中目标 skill 的比例
  capsuleRetrievalRecall: number;      // 目标 skill 是否在检索结果中
  summaryRetrievalPrecision: number;
  summaryRetrievalRecall: number;
}
```

在 slice 中新增 `retrievalStrategy` 维度，对比：
- keyword-capsule 检索的 LLM 选择准确率
- direct-summary 检索的 LLM 选择准确率

在 format 输出中新增：

```
=== Retrieval Effectiveness ===
Keyword-Capsule Retrieval:
  Precision: 0.67  Recall: 1.00
Direct-Summary Retrieval:
  Precision: 0.50  Recall: 1.00

=== LLM Selection Accuracy (live) ===
With capsule context:    0.85 (7/8 correct)
With summary context:    0.70 (5.6/8 correct)
Absolute Lift:           +0.15
Relative Lift:           +21.4%
```

### Phase 6：CI 分层接入（预计 1 个 PR）

| 层级 | 模式 | 触发条件 | 成本 |
|---|---|---|---|
| smoke | dry-run | 每次 PR | ~0 |
| smoke-live | live + sonnet | schedule (daily) | ~$0.50/run |
| core-live | live + sonnet × 3 runs | workflow_dispatch | ~$5/run |

**成本控制**：
- `--max-cases N`：限制运行 case 数量
- `--filter-task-id`：只跑指定 task
- `--runs-per-case`：控制重复次数
- dry-run 永远保留，作为 schema 和框架正确性的快速验证

---

## 4 预期数据形态

改造完成后，live eval 的报告应该呈现这种数据：

```
═══════════════════════════════════════════════════════
  Skill Identification Live Eval (smoke-live)
  8 cases × 3 runs/case = 24 LLM calls
═══════════════════════════════════════════════════════

=== Context Strategy Comparison ===
                         capsule-match    skill-summary    lift
skill_selection:         0.88             0.75             +17%
distractor_rejection:    0.92             0.80             +15%
capsule_signal_usage:    0.75             N/A              N/A
path_correctness:        0.70             0.68             +3%
final_answer:            0.85             0.80             +6%
total:                   0.84             0.76             +10.5%

=== Interference Resilience ===
                     capsule-match    skill-summary
low interference:    0.90             0.82
high interference:   0.78             0.65             ← capsule 的核心优势区间

=== Retrieval Quality ===
keyword-capsule precision@5:  0.40
direct-summary precision@5:   0.30
```

**核心假设**：
- capsule 的结构化字段（situation/problem/goal）在高干扰场景下提供更精确的匹配线索
- 开源 skill 摘要质量参差不齐，capsule 的结构化模板能弥补摘要噪声
- 预期 capsule-match-set 在 high interference 下 lift 最显著（+15~20%）

---

## 5 实现顺序与依赖

```
Phase 1: SkillStore        ← 独立，无外部依赖
Phase 2: Retriever         ← 依赖 Phase 1
Phase 3: LLM Actor         ← 独立，需要 API key
Phase 4: 改造 executeCase  ← 依赖 Phase 2 + 3
Phase 5: Report 扩展       ← 依赖 Phase 4
Phase 6: CI 接入           ← 依赖 Phase 5
```

Phase 1 + 2 + 3 可并行开发。Phase 4 是集成点。Phase 5 + 6 是收尾。

**预计总变更**：~8 个新增文件 + ~5 个修改文件，与现有脚手架改动量相当。

---

## 6 风险与降级

| 风险 | 降级策略 |
|---|---|
| LLM 输出格式不稳定，judge 匹配失败 | 放宽 finalAnswer 匹配为模糊匹配；增加 output parser 容错 |
| 检索结果为空（keyword 没命中） | fallback 到随机选取 top-K；在 report 中标记 retrieval miss |
| API 成本超预算 | dry-run 覆盖 schema 正确性，live 只跑 smoke tier |
| 不同 provider 的分数不可比 | 按 provider 分组 slice，不跨 provider 对比 |
| LLM 输出过长截断 | max_tokens 硬限制 + 截断后仍尝试 normalize |
