# Skill Capsule vs Bare Skill 识别准确率评测计划（扩写版）

> 状态：待实现
> 依赖：现有 agent-planning eval 框架（contracts / runner / report）
> 预计变更文件：~15 个新增 + ~8 个修改

---

## 1 背景与目标

### 1.1 问题陈述

当前 agent-planning eval 用 `contextSetKind` 区分两种上下文注入方式：

| contextSetKind | 注入内容 | 现状 |
|---|---|---|
| `skill-set` | skill 的 `kind: 'skill'` 条目（title + summary + body） | ✅ 已有 14 smoke / 24 core case |
| `plan-graph-set` | `kind: 'plan-node'` 条目（结构化计划节点） | ✅ 已有 paired variant |

本计划新增第三种对照维度：**capsule-match-set**，测试"先用 keyword 命中 skill capsule，再把命中 capsule 内容注入提示词"对识别准确率的提升。

### 1.2 核心假设

1. capsule 匹配结果为 fixture 预标注的 keyword 匹配金标，不做运行时真实检索
2. "复用计划图提取内容"指复用现有 plan-node 文本组织形式来构造 capsule 输入，不新增图提取算法
3. dry-run 模式下 actor 输出仍由 `goldenPath` 回放生成；live LLM 调用留作后续增量

### 1.3 预期产出

- 同一 `taskId` 下三种 `contextSetKind`（`skill-set` / `plan-graph-set` / `capsule-match-set`）的成对对比
- 报表层自动计算 capsule-match 带来的 absoluteLift / relativeLift
- CI 可复现的固定 fixture 数据集，不依赖外部服务

---

## 2 数据模型扩展（contracts 层）

### 2.1 扩展 contextSetKind 枚举

**文件**：`packages/contracts/src/domain/evals/agent-planning.ts`

当前定义（约第 20 行）：
```ts
const agentPlanningContextSetKindSchema = z.enum(['skill-set', 'plan-graph-set']);
```

扩展为：
```ts
const agentPlanningContextSetKindSchema = z.enum([
  'skill-set',
  'plan-graph-set',
  'skill-summary-set',    // 新增：直接注入 profile summary
  'capsule-match-set',    // 新增：注入 keyword 命中的 capsule 卡片
]);
```

### 2.2 新增 case 层字段

在 `agentPlanningEvalCaseSchema` 中追加：

```ts
// 技能识别专用字段（可选，向后兼容）
matchStrategy: z.enum(['keyword-capsule', 'direct-summary']).optional(),
expectedSkillIds: z.array(z.string()).optional(),           // 期望被识别的 skill id
expectedDistractorSkillIds: z.array(z.string()).optional(), // 期望不被选中的干扰 skill id
sourceQualityMix: z.enum(['repo-only', 'mixed-repo-oss', 'oss-only']).optional(),
```

**验证规则**（Zod refine）：
- 当 `contextSetKind` 为 `skill-summary-set` 或 `capsule-match-set` 时，`matchStrategy` 必填
- 当 `matchStrategy` 存在时，`expectedSkillIds` 必须非空

### 2.3 新增 scenario context entry 类型

在 `agentPlanningContextEntrySchema` 中扩展 `kind` 枚举：

```ts
kind: z.enum(['skill', 'plan-node', 'trap', 'note', 'capsule-card', 'skill-profile'])
```

新增 `capsule-card` 和 `skill-profile` 两种 kind：

- **`capsule-card`**：代表一条 capsule 命中结果，`body` 中包含结构化卡片文本（skillId、capsuleId、title、situation、problem、goal、content、labels）
- **`skill-profile`**：代表 skill 的 profile summary 视图，`body` 中包含 title + summary + keywords + labels

### 2.4 扩展 report 层

在 `agentPlanningGroupSummarySchema` 中追加：

```ts
capsuleMatchAvg: z.number().optional(),        // capsule-match-set 平均分
skillSummaryAvg: z.number().optional(),        // skill-summary-set 平均分
absoluteLift: z.number().optional(),           // capsuleMatchAvg - skillSummaryAvg
relativeLift: z.number().optional(),           // absoluteLift / skillSummaryAvg
```

在 `agentPlanningSliceSummarySchema` 中扩展 slice 维度：

当前 slice 维度：`taskType | taskComplexity | contextSetKind | interferenceLevel`

新增 slice 维度：
- `matchStrategy` — 按 `keyword-capsule` vs `direct-summary` 聚合
- `sourceQualityMix` — 按 `repo-only` / `mixed-repo-oss` / `oss-only` 聚合

---

## 3 Context Renderer 扩展

### 3.1 当前渲染逻辑摘要

**文件**：`evals/agent-planning/lib/context-renderer.ts`（62 行）

`renderScenarioContext()` 根据 `contextSetKind` 过滤 context entries：
- `plan-graph-set` → 只保留 `plan-node` / `note`
- 其他（当前只有 `skill-set`）→ 只保留 `skill` / `note`

干扰项按 `interferenceLevel` 截断：none=0, low=1, medium=2, high=全部。

### 3.2 扩展方案

在 `renderScenarioContext()` 的 if/else 分支中新增两个 case：

```ts
if (caseDefinition.contextSetKind === 'plan-graph-set') {
  required = scenario.context.required.filter(e =>
    e.kind === 'plan-node' || e.kind === 'note'
  );
} else if (caseDefinition.contextSetKind === 'capsule-match-set') {
  // 只保留 capsule-card 和 note 类型的条目
  required = scenario.context.required.filter(e =>
    e.kind === 'capsule-card' || e.kind === 'note'
  );
} else if (caseDefinition.contextSetKind === 'skill-summary-set') {
  // 只保留 skill-profile 和 note 类型的条目
  required = scenario.context.required.filter(e =>
    e.kind === 'skill-profile' || e.kind === 'note'
  );
} else {
  // skill-set（向后兼容）
  required = scenario.context.required.filter(e =>
    e.kind === 'skill' || e.kind === 'note'
  );
}
```

### 3.3 渲染格式

**capsule-card 渲染格式**：
```
- [capsule] {title} (keyword match: {keyword})
  Skill: {skillId}
  Situation: {situation}
  Problem: {problem}
  Goal: {goal}
  Content: {content}
  Labels: {labels.join(', ')}
```

**skill-profile 渲染格式**：
```
- [skill-profile] {title}
  Summary: {summary}
  Keywords: {keywords.join(', ')}
  Labels: {labels.join(', ')}
```

### 3.4 干扰项处理

干扰项仍为 `trap` / `skill` / `plan-node` 类型，按 interferenceLevel 截断逻辑不变。

但干扰项的"形态"随 contextSetKind 变化（体现在 scenario 定义中，非 renderer 硬编码）：
- `skill-summary-set` 的干扰项以 summary 形式出现（`kind: 'skill-profile'`）
- `capsule-match-set` 的干扰项以未命中或低相关 capsule 卡片形式出现（`kind: 'capsule-card'`，body 中带低相关标记）

---

## 4 Fixture 管线

### 4.1 Fixture 目录结构

新增目录：

```
evals/fixtures/skills/
  oss/                              # 开源 skill 精简样本
    ci-monitoring-lite/
      SKILL.md                      # 精简后的开源 skill
      meta.json                     # { id, title, summary, keywords, labels }
    log-analysis-patterns/
      SKILL.md
      meta.json
  repo/                             # 自建 skill（指向现有 packages/skills/ 的 fixture 映射）
    workflow-with-trapmap.json       # { id, title, summary, keywords, labels, capsuleIds }
    trapmap-cli-usage-guide.json     # 同上
  capsule-keywords/                 # 预标注的 keyword match 金标
    <taskId>.json                   # { taskId, capsuleMatches: [{ skillId, capsuleId, keyword, score }] }
```

### 4.2 自建 Skill 来源

直接复用：
- `packages/skills/workflow-with-trapmap/SKILL.md` — 核心 TrapMap 工作流技能
- `packages/skills/trapmap-cli-usage-guide/SKILL.md` — CLI 使用指南技能
- `evals/fixtures/traps/skill-format/` 下的 6 个 SKILL.md 文件（docker-deploy、react-hooks、api-pagination、ci-pipeline、typescript-strict、database-migration）
- `evals/ingestion/fixtures/` 下的 4 个 skill fixture

从以上来源中挑选 ≥2 个作为自建 skill 测试样本。

### 4.3 开源 Skill 来源

从 `data/downloaded-skills/` 人工挑选 ≥2 个代表性样本，精简后固化到 `evals/fixtures/skills/oss/`。

**精简标准**：
- 去除原始 repo 专有路径引用
- 保留 title、summary、核心 content（≤2000 字符）
- 补充 keywords 和 labels
- 确保至少 1 个"摘要质量高、capsule 边界清晰"
- 确保至少 1 个"摘要质量一般、capsule 更能提供辨识线索"

### 4.4 Capsule Fixture 构造

**文件**：`evals/agent-planning/lib/capsule-fixture-builder.ts`（新增）

职责：
1. 从 skill fixture 读取 profile summary、capsules、plan-like 文本
2. 为每个 scenario 生成两套 context entries：
   - `skill-summary-set` 使用 profile summary 视图（`kind: 'skill-profile'`）
   - `capsule-match-set` 使用 capsule 命中视图（`kind: 'capsule-card'`）
3. 为每个 scenario 指定干扰强度和干扰 skill

**复用计划图提取内容的默认实现**：
- 不新增图提取执行链路
- 直接复用现有 plan-like text / plan-node 组织模式
- capsule 内容按"步骤线索 / 问题 / 目标"进入完整模板
- 若仓库中已有 graph extraction fixture 可映射到 plan-node 文本，优先复用

```ts
interface CapsuleFixtureBuilderInput {
  scenarioId: string;
  targetSkillId: string;
  targetCapsuleIds: string[];        // 期望命中的 capsule
  distractorSkillIds: string[];      // 干扰 skill
  interferenceLevel: 'none' | 'low' | 'medium' | 'high';
  sourceQualityMix: 'repo-only' | 'mixed-repo-oss' | 'oss-only';
}

interface CapsuleFixtureBuilderOutput {
  summarySetEntries: AgentPlanningContextEntry[];    // skill-profile kind
  capsuleMatchEntries: AgentPlanningContextEntry[];  // capsule-card kind
  distractorEntries: AgentPlanningContextEntry[];     // 干扰项（两种形态各一套）
  capsuleKeywordGold: CapsuleKeywordMatch[];         // keyword 匹配金标
}
```

---

## 5 Scenario 与 Dataset 设计

### 5.1 命名规范

- scenario 文件：`skill-identification-smoke-scenarios.ts` / `skill-identification-core-scenarios.ts`
- dataset 文件：`skill-identification-smoke.ts` / `skill-identification-core.ts`
- 不混入现有 `agent-planning-smoke.ts` / `agent-planning-core.ts`

### 5.2 Smoke Tier（≥2 个任务组）

#### 任务组 1：CLI 工作流识别

| 字段 | 值 |
|---|---|
| taskId | `task-identify-cli-workflow` |
| taskType | `selection` |
| taskComplexity | `simple` |
| 目标 skill | `trapmap-cli-usage-guide`（自建） |
| 干扰 skill | `docker-deploy`（自建）、`ci-monitoring-lite`（开源） |
| 干扰级别 | `low` |
| 场景描述 | 用户问"如何用 TrapMap CLI 检查 decay"，agent 需识别出 CLI 使用指南技能 |

成对 variant：
- `task-identify-cli-workflow-skill-summary`（`contextSetKind: 'skill-summary-set'`）
- `task-identify-cli-workflow-capsule-match`（`contextSetKind: 'capsule-match-set'`）

共享 `taskId`，沿用现有 group diff 报表。

#### 任务组 2：治理/流程任务识别

| 字段 | 值 |
|---|---|
| taskId | `task-identify-governance-workflow` |
| taskType | `selection` |
| taskComplexity | `simple` |
| 目标 skill | `workflow-with-trapmap`（自建） |
| 干扰 skill | `log-analysis-patterns`（开源）、`database-migration`（自建） |
| 干扰级别 | `medium` |
| 场景描述 | 用户问"trap 生命周期管理的完整流程"，agent 需识别出核心工作流技能 |

成对 variant：
- `task-identify-governance-workflow-skill-summary`
- `task-identify-governance-workflow-capsule-match`

### 5.3 Core Tier（≥4 个任务组）

#### 任务组 1：自建 skill 明显优于摘要

| 字段 | 值 |
|---|---|
| taskId | `task-capsule-lift-repo-skill` |
| taskType | `selection` |
| taskComplexity | `medium` |
| 目标 skill | `workflow-with-trapmap`（自建） |
| 干扰 skill | 2-3 个语义相近的自建 skill |
| 干扰级别 | `medium` |
| 预期现象 | capsule-match-set 得分 > skill-summary-set，因为 capsule 的 situation/problem 字段提供了更精确的匹配线索 |

#### 任务组 2：开源 skill 摘要噪声较大，capsule 更稳

| 字段 | 值 |
|---|---|
| taskId | `task-capsule-lift-oss-noisy` |
| taskType | `selection` |
| taskComplexity | `medium` |
| 目标 skill | `log-analysis-patterns`（开源） |
| 干扰 skill | 2-3 个开源 skill（摘要措辞相似但领域不同） |
| 干扰级别 | `high` |
| 预期现象 | 开源 skill 摘要质量参差不齐，capsule 的结构化字段帮助 agent 区分噪声 |

#### 任务组 3：多 skill 干扰下的误选抑制

| 字段 | 值 |
|---|---|
| taskId | `task-distractor-rejection-multi` |
| taskType | `selection` |
| taskComplexity | `complex` |
| 目标 skill | `ci-pipeline`（自建） |
| 干扰 skill | 4-5 个，含 2 个高度语义相似的干扰（如 `docker-deploy`、`typescript-strict`） |
| 干扰级别 | `high` |
| 预期现象 | capsule-match-set 的 distractor rejection 得率显著高于 skill-summary-set |

#### 任务组 4：混合自建/开源 skill 时的准确率提升

| 字段 | 值 |
|---|---|
| taskId | `task-mixed-source-accuracy` |
| taskType | `composite` |
| taskComplexity | `complex` |
| 目标 skill | 混合（1 自建 + 1 开源） |
| 干扰 skill | 混合干扰（2 自建 + 2 开源） |
| 干扰级别 | `medium` |
| sourceQualityMix | `mixed-repo-oss` |
| 预期现象 | 无论目标是自建还是开源，capsule-match-set 在混合场景下表现更稳定 |

### 5.4 每个 Scenario 的必要字段

每个 scenario 都包含：

```ts
{
  scenarioId: string;
  taskId: string;
  variantIds: string[];                  // skill-summary 和 capsule-match 两个 variant
  taskPrompt: string;                    // 目标 task prompt
  promptTemplateId: string;
  actor: { mode: 'dry-run', provider: 'fallback' };
  context: {
    required: AgentPlanningContextEntry[];  // 目标 skill 的两种形态
    optional: AgentPlanningContextEntry[];  // 可选上下文（note 等）
    interference: AgentPlanningContextEntry[];  // 干扰 skill
  };
  metadata: Record<string, string>;      // repository, owner 等
}
```

### 5.5 每个 Case 的必要字段

```ts
{
  schemaVersion: 1,
  taskId: string,
  variantId: string,                     // 包含 -skill-summary- 或 -capsule-match- 后缀
  variantGroupId: string,                // 'skill-summary-set' | 'capsule-match-set'
  tier: 'smoke' | 'core',
  taskType: 'selection' | 'composite',
  taskComplexity: 'simple' | 'medium' | 'complex',
  contextSetKind: 'skill-summary-set' | 'capsule-match-set',
  interferenceLevel: 'none' | 'low' | 'medium' | 'high',
  matchStrategy: 'keyword-capsule' | 'direct-summary',
  expectedSkillIds: string[],
  expectedDistractorSkillIds: string[],
  sourceQualityMix: 'repo-only' | 'mixed-repo-oss' | 'oss-only',
  interferenceSources: [...],
  goldenPath: { requiredSteps, keyActions, allowedAlternativeActions, forbiddenActions, stepWeights },
  judgeRubric: {
    dimensions: [
      { id: 'skill_selection_correctness', label: '技能选择正确性', weight: 0.35, guidance: '...' },
      { id: 'distractor_rejection', label: '干扰项抑制', weight: 0.25, guidance: '...' },
      { id: 'capsule_signal_usage', label: 'capsule 信号利用', weight: 0.15, guidance: '...' },
      { id: 'path_correctness', label: '计划路径正确性', weight: 0.15, guidance: '...' },
      { id: 'final_answer', label: '最终答案质量', weight: 0.10, guidance: '...' },
    ]
  },
  expectedOutcome: { finalAnswer: string, successCriteria: string[] },
  tags: ['skill-identification', tier],
}
```

---

## 6 Judge 与 Scoring 扩展

### 6.1 新增 Judge 维度

在 `judgeRubric.dimensions` 中新增三个维度（与现有 path-correctness、final-answer 共存）：

| dimensionId | label | 默认 weight | 评分逻辑 |
|---|---|---|---|
| `skill_selection_correctness` | 技能选择正确性 | 0.35 | 检查 actor 输出中是否引用了 `expectedSkillIds` 中的所有 skill；全部命中=1.0，部分命中=0.5，未命中=0 |
| `distractor_rejection` | 干扰项抑制 | 0.25 | 检查 actor 输出中是否引用了 `expectedDistractorSkillIds` 中的 skill；未引用=1.0，引用1个=0.5，引用多个=0 |
| `capsule_signal_usage` | capsule 信号利用 | 0.15 | 检查 actor 输出中是否使用了 capsule 的关键字段内容（situation/problem/goal）；使用≥2个=1.0，1个=0.5，未使用=0 |

现有维度权重调整：
- `path_correctness`：从原有权重调整为 0.15
- `final_answer`：从原有权重调整为 0.10

权重之和 = 0.35 + 0.25 + 0.15 + 0.15 + 0.10 = 1.00 ✅

### 6.2 scoring.ts 扩展

**文件**：`evals/agent-planning/lib/scoring.ts`

在 `evaluateDeterministicPrecheck()` 中新增检查项：

```ts
interface SkillIdentificationPrecheck {
  // 现有字段
  passed: boolean;
  missingRequiredSteps: string[];
  missingKeyActions: string[];
  forbiddenActionHits: string[];
  emptyOutput: boolean;
  parseFailed: boolean;
  // 新增字段
  expectedSkillHitCount: number;        // 命中的 expectedSkillIds 数量
  distractorHitCount: number;           // 命中的 distractorSkillIds 数量
  capsuleSignalCount: number;           // 使用的 capsule 信号数量
}
```

### 6.3 judge-runner.ts 扩展

**文件**：`evals/agent-planning/lib/judge-runner.ts`

在 `runJudge()` 中新增三个维度的评分逻辑：

```ts
// skill_selection_correctness
const expectedHits = caseDefinition.expectedSkillIds?.filter(id =>
  normalizedPlan.some(step => step.includes(id.toLowerCase()))
) ?? [];
const selectionScore = expectedHits.length === (caseDefinition.expectedSkillIds?.length ?? 0) ? 1.0
  : expectedHits.length > 0 ? 0.5
  : 0;

// distractor_rejection
const distractorHits = caseDefinition.expectedDistractorSkillIds?.filter(id =>
  normalizedPlan.some(step => step.includes(id.toLowerCase()))
) ?? [];
const rejectionScore = distractorHits.length === 0 ? 1.0
  : distractorHits.length === 1 ? 0.5
  : 0;

// capsule_signal_usage（仅 capsule-match-set 适用）
const capsuleKeywords = extractCapsuleSignals(caseDefinition);
const signalHits = capsuleKeywords.filter(kw =>
  normalizedPlan.some(step => step.includes(kw.toLowerCase()))
);
const capsuleScore = signalHits.length >= 2 ? 1.0
  : signalHits.length === 1 ? 0.5
  : 0;
```

### 6.4 通过标准

- 确定性预检全部通过（与现有逻辑一致）
- `totalScore >= 0.7`（延续现有阈值）
- 新增的三个维度的权重已通过 judgeRubric 配置，无需额外硬编码阈值

### 6.5 report.ts 扩展

**文件**：`evals/agent-planning/lib/report.ts`

在 `buildAgentPlanningReport()` 中：

**Group 计算扩展**：
```ts
// 在现有 skillSetAvg / planGraphSetAvg 计算逻辑旁新增
const capsuleMatchResults = groupCases.filter(r => r.contextSetKind === 'capsule-match-set');
const skillSummaryResults = groupCases.filter(r => r.contextSetKind === 'skill-summary-set');

const capsuleMatchAvg = average(capsuleMatchResults.map(r => r.judge.totalScore));
const skillSummaryAvg = average(skillSummaryResults.map(r => r.judge.totalScore));
const absoluteLift = capsuleMatchAvg - skillSummaryAvg;
const relativeLift = skillSummaryAvg > 0 ? absoluteLift / skillSummaryAvg : 0;
```

**Slice 扩展**：
```ts
const SLICE_DIMENSIONS = [
  'taskType', 'taskComplexity', 'contextSetKind', 'interferenceLevel',
  'matchStrategy', 'sourceQualityMix',  // 新增
] as const;
```

**Format 扩展**（`format.ts`）：
```
=== Skill Identification Summary ===
Capsule Match Avg: 0.85
Skill Summary Avg: 0.72
Absolute Lift:    +0.13
Relative Lift:    +18.1%
```

---

## 7 Runner 与 CI 接入

### 7.1 新增文件清单

| 文件 | 职责 |
|---|---|
| `evals/fixtures/skills/oss/ci-monitoring-lite/SKILL.md` | 开源 skill fixture |
| `evals/fixtures/skills/oss/ci-monitoring-lite/meta.json` | 元数据 |
| `evals/fixtures/skills/oss/log-analysis-patterns/SKILL.md` | 开源 skill fixture |
| `evals/fixtures/skills/oss/log-analysis-patterns/meta.json` | 元数据 |
| `evals/fixtures/skills/repo/workflow-with-trapmap.json` | 自建 skill profile fixture |
| `evals/fixtures/skills/repo/trapmap-cli-usage-guide.json` | 自建 skill profile fixture |
| `evals/fixtures/skills/capsule-keywords/<taskId>.json` | keyword 匹配金标（按 taskId 组织） |
| `evals/agent-planning/lib/capsule-fixture-builder.ts` | fixture 构造层 |
| `evals/agent-planning/datasets/smoke/skill-identification-smoke.ts` | smoke case 集 |
| `evals/agent-planning/datasets/core/skill-identification-core.ts` | core case 集 |
| `evals/agent-planning/scenarios/smoke/skill-identification-smoke-scenarios.ts` | smoke scenario 集 |
| `evals/agent-planning/scenarios/core/skill-identification-core-scenarios.ts` | core scenario 集 |

### 7.2 修改文件清单

| 文件 | 变更 |
|---|---|
| `packages/contracts/src/domain/evals/agent-planning.ts` | 扩展 contextSetKind、新增 case/report 字段 |
| `evals/agent-planning/lib/context-renderer.ts` | 新增 capsule-match-set / skill-summary-set 渲染分支 |
| `evals/agent-planning/lib/scoring.ts` | 新增 skill identification precheck 逻辑 |
| `evals/agent-planning/lib/judge-runner.ts` | 新增 3 个 judge 维度评分 |
| `evals/agent-planning/lib/report.ts` | 新增 group/slice 聚合字段 |
| `evals/agent-planning/lib/format.ts` | 新增 skill identification 摘要输出 |
| `evals/agent-planning/run.ts` | 加载新 dataset/scenario 文件 |
| `evals/agent-planning/runner.test.ts` | 新增 schema / renderer / scoring 测试 |

### 7.3 数据集加载

在 `evals/agent-planning/run.ts` 的 `loadCases()` 中，新增对 `skill-identification-*` 文件的加载：

```ts
// 现有加载逻辑旁新增
if (tier === 'smoke') {
  const sidSmoke = require('./datasets/smoke/skill-identification-smoke');
  cases.push(...sidSmoke.skillIdentificationSmokeCases);
}
if (tier === 'core') {
  const sidCore = require('./datasets/core/skill-identification-core');
  cases.push(...sidCore.skillIdentificationCoreCases);
}
```

scenario 加载同理，在 `loadScenario()` 中新增对 `skill-identification-*` scenario map 的查找。

### 7.4 CI 接入策略

| 层级 | 接入方式 | 触发条件 |
|---|---|---|
| smoke | 纳入现有 `eval:smoke` | 每次 PR |
| core | 纳入现有 `eval:core` | schedule / workflow_dispatch |
| 扩展样本 | 不接入 CI | 人工从 `data/downloaded-skills` 挑样 |

**不依赖外部服务**：所有 capsule keyword 匹配结果为 fixture 预标注金标，不调用真实检索 API。

**可选扩展脚本**：提供 `evals/scripts/generate-skill-identification-candidates.ts`，从 `data/downloaded-skills` 生成候选摘要供人工挑样，但不作为 CI 必需步骤。

---

## 8 文档同步

### 8.1 必须更新

| 文件 | 新增内容 |
|---|---|
| `evals/agent-planning/README.md` | skill-identification 评测说明、fixture 来源、运行方式 |
| `evals/README.md` | 新增 skill-identification 条目到评测矩阵 |

### 8.2 条件更新

| 文件 | 触发条件 |
|---|---|
| `docs/operations/TESTING.md` | 统一评测入口或测试规范发生变化时 |
| `AGENTS.md` | 新增 eval 变更的路由规则时 |

---

## 9 Test Plan

### 9.1 Contracts Schema 测试

在 `packages/contracts/src/domain/evals/` 下新增或扩展测试文件：

```
✅ 新 contextSetKind 值（skill-summary-set、capsule-match-set）可通过 Zod 解析
✅ 新 case 字段（matchStrategy、expectedSkillIds、expectedDistractorSkillIds、sourceQualityMix）通过校验
✅ contextSetKind 为 skill-summary-set 时 matchStrategy 缺失 → Zod 报错
✅ contextSetKind 为 capsule-match-set 时 expectedSkillIds 为空 → Zod 报错
✅ 非法 matchStrategy 值 → Zod 报错
✅ 新 context entry kind（capsule-card、skill-profile）通过校验
✅ report 新字段（capsuleMatchAvg、skillSummaryAvg、absoluteLift、relativeLift）通过校验
```

### 9.2 Context Renderer 单测

```
✅ contextSetKind=skill-summary-set → 只渲染 skill-profile 和 note 条目
✅ contextSetKind=capsule-match-set → 只渲染 capsule-card 和 note 条目
✅ capsule-card 条目渲染格式包含 skillId、situation、problem、goal、content、labels
✅ skill-profile 条目渲染格式包含 title、summary、keywords、labels
✅ 干扰项按 interferenceLevel 正确截断（none=0, low=1, medium=2, high=全部）
✅ 向后兼容：contextSetKind=skill-set 仍只渲染 skill 和 note 条目
```

### 9.3 Scoring / Judge 单测

```
✅ expectedSkillIds 全部命中 → skill_selection_correctness = 1.0
✅ expectedSkillIds 部分命中 → skill_selection_correctness = 0.5
✅ expectedSkillIds 未命中 → skill_selection_correctness = 0
✅ expectedDistractorSkillIds 未引用 → distractor_rejection = 1.0
✅ expectedDistractorSkillIds 引用 1 个 → distractor_rejection = 0.5
✅ capsule 关键字段使用 ≥2 → capsule_signal_usage = 1.0
✅ capsule 关键字段使用 1 个 → capsule_signal_usage = 0.5
✅ totalScore 加权计算正确（权重之和 = 1.0）
```

### 9.4 Report 单测

```
✅ 同一 taskId 下同时包含 skill-summary-set 和 capsule-match-set variant 时，group 计算 capsuleMatchAvg / skillSummaryAvg / absoluteLift / relativeLift
✅ 只有单一 contextSetKind 时，lift 字段为 undefined
✅ slice 包含 matchStrategy 和 sourceQualityMix 维度
✅ slice 中 caseCount / avgScore / passRate 计算正确
```

### 9.5 Runner 集成测试

```
✅ smoke dataset 加载包含 skill-identification case
✅ 同一 taskId 下 skill-summary-set 和 capsule-match-set variant 共享同一 scenario
✅ dry-run 模式下完整运行返回正确 report 结构
✅ 现有 smoke case 不受影响（向后兼容）
```

### 9.6 手动验证命令

```bash
# 单测
pnpm test:file -- evals/agent-planning/runner.test.ts

# dry-run smoke
pnpm exec tsx --tsconfig tsconfig.base.json evals/agent-planning/run.ts --tier smoke --dry-run

# 统一入口（如已接入）
pnpm eval:smoke
```

---

## 10 实现顺序建议

### Phase 1：Contracts 层（预计 1 个 PR）

1. 扩展 `contextSetKindSchema`
2. 新增 case 层字段（matchStrategy、expectedSkillIds 等）
3. 新增 context entry kind（capsule-card、skill-profile）
4. 扩展 report schema
5. 补齐 schema 测试

### Phase 2：Fixture 准备（预计 1 个 PR）

1. 创建 `evals/fixtures/skills/` 目录结构
2. 固化自建 skill fixture
3. 固化开源 skill fixture
4. 构造 capsule keyword 金标
5. 实现 `capsule-fixture-builder.ts`

### Phase 3：Renderer + Scoring + Judge（预计 1 个 PR）

1. 扩展 `context-renderer.ts`
2. 扩展 `scoring.ts`
3. 扩展 `judge-runner.ts`
4. 补齐 renderer / scoring / judge 单测

### Phase 4：Dataset + Scenario + Report（预计 1 个 PR）

1. 编写 smoke scenario + case
2. 编写 core scenario + case
3. 扩展 `report.ts` 和 `format.ts`
4. 更新 `run.ts` 加载逻辑
5. 补齐 report / runner 集成测试

### Phase 5：文档 + CI（预计 1 个 PR）

1. 更新 `evals/agent-planning/README.md`
2. 更新 `evals/README.md`
3. 条件更新 `docs/operations/TESTING.md`
4. 验证 `eval:smoke` 通过

---

## 11 风险与缓解

| 风险 | 缓解 |
|---|---|
| 开源 skill fixture 选择不当导致评测失真 | 选择标准明确（§4.3），人工审核后才合入 |
| 新 judge 维度权重不合理 | 初始权重为经验值，实现后根据 dry-run 结果微调 |
| Capsule 信号提取逻辑过于简单 | dry-run 阶段使用精确字符串匹配；live 模式可升级为模糊匹配 |
| 现有 smoke 测试因 schema 变更失败 | 新字段全部 optional + 独立文件，不修改现有 case |
| CI 时间增长 | smoke tier 仅新增 4 个 case（2 任务组 × 2 variant），增量可控 |
