# Agent Eval Platform Event Model

> Phase 0 冻结文档。Phase 1 代码实现只能把这份文档当作唯一的事件设计输入，不再回看主计划细则里的阶段性草图。

**Status:** frozen boundary definition
**Truth source:** native TrapMap report schema remains the source of truth; the platform layer is a double-write mirror.

## 目的

这份文档冻结三件事：

1. TrapMap Eval Kernel 的职责边界
2. 平台无关的 Platform Model 事件形状
3. Platform Adapters 的接入边界

首轮只做事件模型冻结和双写镜像的设计，不让外部平台反向定义 TrapMap 的 report 语义。

## 三层结构

| Layer | Owns | Does not own |
|---|---|---|
| TrapMap Eval Kernel | case schema、runner、governance assertion、snapshot replay、baseline-aware CI、原生 JSON report | 外部平台数据模型、平台鉴权、平台持久化格式 |
| Platform Model | 平台无关的 run / case / score / assertion / trace 事件，以及统一 envelope | 终端输出、CI hard gate、平台 UI 约束 |
| Platform Adapters | 把 Platform Model 写入 Langfuse、MLflow 或本地 archive | 解释 TrapMap 语义、改变 kernel 的判定结果 |

Kernel 继续作为 native TrapMap truth source。Platform Model 只负责把 kernel 产物投射成统一事件。Platform Adapters 只做双写镜像，不接管主流程。

## 统一事件族

统一事件 family 必须只包含下面七个名字：

- `EvalRunStarted`
- `EvalRunFinished`
- `EvalCaseStarted`
- `EvalCaseFinished`
- `EvalScoreRecorded`
- `EvalAssertionRecorded`
- `EvalTraceStepRecorded`

命名不扩展、不别名、不拆分。后续所有平台写入都必须落在这七个事件内。

## 最小事件字段

每个事件 envelope 的最小字段必须只围绕下面这组字段展开：

- `suite`
- `tier`
- `runId`
- `caseId`
- `scenarioId`
- `timestamp`
- `tags`
- `payload`

约束说明：

- `suite` 标识 eval suite，例如 `agent-planning`、`retrieval`、`summary`
- `tier` 继承 TrapMap 既有 tier 语义
- `runId` 连接单次执行的全部事件
- `caseId` 连接单个 case 的全部事件
- `scenarioId` 连接场景级上下文
- `timestamp` 使用事件发生时刻
- `tags` 保存用于平台过滤、聚类、检索的稳定标签
- `payload` 承载事件类型专属内容

这组字段是平台模型的下限，不是对 kernel report 字段的重命名。kernel 仍然可以保留自己的 report 结构和内部字段。

run 级事件仍然要携带完整 envelope 字段；此时 `caseId` 与 `scenarioId` 取 `null`，不会被省略。

## Payload 冻结

`payload` 必须是严格对象，且按事件 family 冻结为不同的固定形状。实现方不得在同一事件 family 下自行新增顶层字段。

### `EvalRunStarted.payload`

必须包含：

- `reportMeta`
- `runScope`

`reportMeta` 是开始时刻的元信息快照，字段必须按 suite 固定，且不得包含结束时才能知道的 `durationMs`：

- `agent-planning`：`schemaVersion`、`runner`、`options`
- `retrieval`：`schemaVersion`、`options`、`baselinePath?`、`isBaselineWrite?`
- `summary`：`schemaVersion`、`llmProvider`、`options`

`runScope` 是执行范围快照，字段必须按 suite 固定：

- `agent-planning`：`tier`、`dryRun`、`provider`、`promptTemplateId`、`caseCount`、`scenarioIds`
- `retrieval`：`tier`、`dryRun`、`allowEmpty`、`endpoint`、`verbose`、`caseCount`、`scenarioIds`
- `summary`：`tier`、`dryRun`、`allowEmpty`、`endpoint`、`verbose`、`provider`、`caseCount`、`scenarioIds`

### `EvalRunFinished.payload`

必须包含：

- `reportMeta`
- `reportSummary`
- `reportCollections`

`reportMeta` 是收口时刻的完整元信息快照，字段必须按 suite 固定：

- `agent-planning`：`schemaVersion`、`timestamp`、`durationMs`、`runner`、`options`
- `retrieval`：`schemaVersion`、`timestamp`、`durationMs`、`options`、`baselinePath?`、`isBaselineWrite?`
- `summary`：`schemaVersion`、`timestamp`、`durationMs`、`llmProvider`、`options`

`reportSummary` 是来源报告的 summary block，字段必须按 suite 固定：

- `agent-planning`：`totalCases`、`passedCases`、`failedCases`、`passRate`、`avgScore`
- `retrieval`：`totalCases`、`passedCases`、`failedCases`、`passRate`、`passed`
- `summary`：`totalCases`、`passedCases`、`failedCases`、`passRate`、`passed`、`avgGroundedness`、`avgCoverage`、`forbiddenClaimHits`

`reportCollections` 是来源报告剩余顶层集合，字段必须按 suite 固定：

- `agent-planning`：`cases`、`groups`、`slices`
- `retrieval`：`cases`、`slices`、`cohorts?`、`modeComparisons?`、`routingDistribution?`、`failures`、`warnings`
- `summary`：`cases`、`failures`

### `EvalCaseStarted.payload`

必须包含一个 `case` 对象，且其字段必须与对应 suite 的 case schema 一致，不得裁剪：

- `agent-planning`：`schemaVersion`、`taskId`、`variantId`、`variantGroupId`、`tier`、`taskType`、`taskComplexity`、`contextSetKind`、`interferenceLevel`、`interferenceSources`、`promptTemplateId`、`scenarioId`、`goldenPath`、`judgeRubric`、`expectedOutcome`、`tags`、`matchStrategy?`、`expectedSkillIds?`、`expectedDistractorSkillIds?`、`sourceQualityMix?`
- `retrieval`：`schemaVersion`、`caseId`、`tier`、`endpoint`、`request`、`scenarioId`、`expected`、`tags`
- `summary`：`schemaVersion`、`caseId`、`tier`、`endpoint`、`request`、`scenarioId`、`expected`、`tags`

### `EvalCaseFinished.payload`

必须包含：

- `result`
- `execution`

`result` 是最终 case 结果快照，字段必须按 suite 固定：

- `agent-planning`：`taskId`、`variantId`、`variantGroupId`、`tier`、`taskType`、`taskComplexity`、`contextSetKind`、`interferenceLevel`、`passed`、`totalScore`、`pathScore`、`finalAnswerScore`、`actorOutput`、`normalizedPlan`、`deterministicPrecheck`、`judge`、`durationMs`、`matchStrategy?`、`sourceQualityMix?`
- `retrieval`：`caseId`、`endpoint`、`tier`、`passed`、`outcomeMatch`、`governancePassed`、`durationMs`、`hitAt1`、`hitAt5`、`hitAt10`、`mrr`、`ndcg`、`recallAt10`、`selectedMode?`、`routingReason?`、`fallbackApplied`
- `summary`：`caseId`、`endpoint`、`tier`、`passed`、`groundednessScore`、`coverageScore`、`claimsTotal`、`claimsSupported`、`requiredFactsCovered`、`requiredFactsMissing`、`forbiddenClaimsFound`、`durationMs`

`execution` 是 runner-local execution metadata 或 trace carrier，字段必须按 suite 固定：

- `agent-planning`：`actorOutput`、`normalizedPlan`
- `retrieval`：`adapterType`、`fallbackUsed`、`fallbackReason?`、`endpoint`、`durationMs`、`selectedMode?`、`routingReason?`、`fallbackApplied`
- `summary`：`summaryText?`、`contextTrace`、`rawResponse`

### `EvalScoreRecorded.payload`

必须包含：

- `scoreId`
- `score`
- `source`

`scoreId` 和 `source` 必须固定到 suite 级别的已知评分点，不得用泛化 metric 名字代替：

- `agent-planning`：
  - `totalScore` -> `source: case.totalScore`
  - `pathScore` -> `source: case.pathScore`
  - `finalAnswerScore` -> `source: case.finalAnswerScore`
  - `dimension:<dimensionId>` -> `source: case.judge.dimensionScores[*]`
- `retrieval`：
  - `hitAt1`、`hitAt5`、`hitAt10`、`mrr`、`ndcg`、`recallAt10` -> `source: case.metrics.*`
- `summary`：
  - `groundednessScore`、`coverageScore` -> `source: case.judgeResult.*`

可选字段只允许：

- `weight`
- `threshold`
- `rationale`

### `EvalAssertionRecorded.payload`

必须包含：

- `assertionId`
- `passed`
- `source`

`assertionId` 的取值必须可追溯到 suite 既有断言组：

- `agent-planning`：`precheck.required-steps`、`precheck.key-actions`、`precheck.forbidden-actions`、`precheck.empty-output`、`precheck.parse-failed`、`judge.matched-key-actions`、`judge.missing-key-actions`、`judge.forbidden-action-hits`
- `retrieval`：`outcome`、`governance`、`shape`、`graph-plan`
- `summary`：`summary-present`、`groundedness`、`coverage`、`forbidden-claims`

可选字段只允许：

- `expected`
- `actual`
- `reason`
- `severity`

### `EvalTraceStepRecorded.payload`

必须包含：

- `stepIndex`
- `kind`
- `text`
- `source`

`kind` 的取值必须按 suite 固定：

- `agent-planning`：`actor-output`、`normalized-plan-step`
- `retrieval`：`routing-trace`、`raw-response`、`graph-plan-structure`
- `summary`：`context-trace`、`generated-summary`、`raw-response`

可选字段只允许：

- `stepId`
- `parentStepId`
- `evidence`
- `metadata`

## 与 TrapMap report schema 的映射

Platform Model 不是新的 report schema。它是把现有 TrapMap report 重新组织成事件流，供平台适配器镜像。

### Run 级映射

- `EvalRunStarted` 对应 report 的 `meta` 起点，`payload.reportMeta` 直接承载 suite 的 `meta` 结构，`payload.runScope` 直接承载运行选项快照
- `EvalRunFinished` 对应 report 的 `meta` 收口，`payload.reportSummary` 直接承载 suite 的 `summary` 结构，`payload.reportCollections` 直接承载其余顶层集合

### Suite 级字段落点

#### `agent-planning`

| Report source | Event | Payload 落点 |
|---|---|---|
| `meta.schemaVersion` / `meta.runner` / `meta.options` | `EvalRunStarted` | `reportMeta` |
| `meta.schemaVersion` / `meta.timestamp` / `meta.durationMs` / `meta.runner` / `meta.options` | `EvalRunFinished` | `reportMeta` |
| `summary.totalCases` / `summary.passedCases` / `summary.failedCases` / `summary.passRate` / `summary.avgScore` | `EvalRunFinished` | `reportSummary` |
| `cases[*]` 的 case schema 字段 | `EvalCaseStarted` | `case` |
| `cases[*].passed` / `totalScore` / `pathScore` / `finalAnswerScore` / `actorOutput` / `normalizedPlan` / `deterministicPrecheck` / `judge` / `durationMs` | `EvalCaseFinished` | `result` |
| `cases[*].totalScore` / `pathScore` / `finalAnswerScore` / `judge.dimensionScores[*]` | `EvalScoreRecorded` | `scoreId` / `score` / `source` |
| `cases[*].deterministicPrecheck` / `cases[*].judge.matchedKeyActions` / `missingKeyActions` / `forbiddenActionHits` | `EvalAssertionRecorded` | `assertionId` / `passed` / `source` |
| `cases[*].actorOutput` / `cases[*].normalizedPlan` | `EvalTraceStepRecorded` | `text` / `kind` |
| `groups` | `EvalRunFinished` | `reportCollections.groups` |
| `slices` | `EvalRunFinished` | `reportCollections.slices` |

#### `retrieval`

| Report source | Event | Payload 落点 |
|---|---|---|
| `meta.schemaVersion` / `meta.options` / `meta.baselinePath?` / `meta.isBaselineWrite?` | `EvalRunStarted` | `reportMeta` |
| `meta.schemaVersion` / `meta.timestamp` / `meta.durationMs` / `meta.options` / `meta.baselinePath?` / `meta.isBaselineWrite?` | `EvalRunFinished` | `reportMeta` |
| `summary.totalCases` / `summary.passedCases` / `summary.failedCases` / `summary.passRate` / `summary.passed` | `EvalRunFinished` | `reportSummary` |
| `cases[*]` 的 case schema 字段 | `EvalCaseStarted` | `case` |
| `cases[*].passed` / `outcomeMatch` / `governancePassed` / `durationMs` / `hitAt1` / `hitAt5` / `hitAt10` / `mrr` / `ndcg` / `recallAt10` / `selectedMode` / `routingReason` / `fallbackApplied` | `EvalCaseFinished` | `result` |
| `cases[*].hitAt1` / `hitAt5` / `hitAt10` / `mrr` / `ndcg` / `recallAt10` | `EvalScoreRecorded` | `scoreId` / `score` / `source` |
| `cases[*].expected.outcome` / `expected.relevance` / `expected.governance` / `expected.shape` / `governance.failures[*]` / `graphPlanResult` | `EvalAssertionRecorded` | `assertionId` / `passed` / `source` |
| `execution.routingTrace` / `execution.adapterType` / `execution.fallbackUsed` / `execution.fallbackReason` / `execution.selectedMode` / `execution.routingReason` / `execution.fallbackApplied` | `EvalTraceStepRecorded` | `kind` / `text` / `metadata` |
| `summary` 之外的 `cases` / `slices` / `cohorts` / `modeComparisons` / `routingDistribution` / `failures` / `warnings` | `EvalRunFinished` | `reportCollections.*` |

#### `summary`

| Report source | Event | Payload 落点 |
|---|---|---|
| `meta.schemaVersion` / `meta.llmProvider` / `meta.options` | `EvalRunStarted` | `reportMeta` |
| `meta.schemaVersion` / `meta.timestamp` / `meta.durationMs` / `meta.llmProvider` / `meta.options` | `EvalRunFinished` | `reportMeta` |
| `summary.totalCases` / `summary.passedCases` / `summary.failedCases` / `summary.passRate` / `summary.passed` / `summary.avgGroundedness` / `summary.avgCoverage` / `summary.forbiddenClaimHits` | `EvalRunFinished` | `reportSummary` |
| `cases[*]` 的 case schema 字段 | `EvalCaseStarted` | `case` |
| `cases[*].passed` / `groundednessScore` / `coverageScore` / `claimsTotal` / `claimsSupported` / `requiredFactsCovered` / `requiredFactsMissing` / `forbiddenClaimsFound` / `durationMs` | `EvalCaseFinished` | `result` |
| `cases[*].judgeResult.groundednessScore` / `cases[*].judgeResult.coverageScore` | `EvalScoreRecorded` | `scoreId` / `score` / `source` |
| `cases[*].expected.requiredFacts` / `expected.forbiddenClaims` / `judgeResult` verdict arrays | `EvalAssertionRecorded` | `assertionId` / `passed` / `source` |
| `contextTrace[*]` / `summaryText` / `rawResponse` | `EvalTraceStepRecorded` | `kind` / `text` / `metadata` |
| `cases` / `failures` | `EvalRunFinished` | `reportCollections.cases` / `reportCollections.failures` |

### Case 级映射

- `EvalCaseStarted` 对应 report 中 case 记录的生命周期开始
- `EvalCaseFinished` 对应 report 中 case 记录的生命周期结束
- `EvalScoreRecorded` 对应 case 级分数写回，并驱动 report 的 summary 聚合
- `EvalAssertionRecorded` 对应 case 级断言结果、失败分类和 failure 记录
- `EvalTraceStepRecorded` 对应 case 级 trace / trajectory 细节，供平台 UI、debug 和 review 使用

### 对现有 report 形状的落点

- `agent-planning` 仍然以 `meta`、`summary`、`cases`、`groups`、`slices` 为最终输出
- `retrieval` 仍然以 `meta`、`summary`、`slices`、`cases`、`failures`、`warnings` 为最终输出
- `summary` 仍然以 `meta`、`summary`、`cases`、`failures` 为最终输出
- Platform Model 只提供归一化输入，不替换这些 suite-owned schema

### 双写顺序

1. Kernel 先生成原生 TrapMap report
2. Platform Model 旁路记录同一批事件
3. Platform Adapter 尝试写入外部平台
4. 任何平台失败都只降级为 warning，不反向污染原生 report

这保证了 native TrapMap truth source 仍然是主线，外部平台只是镜像层。

## 明确非目标

首轮平台集成不做下面三件事：

- `retrieval-live`
- CI hard gate takeover
- badcase export replacement

对应含义：

- 不把 `retrieval-live` 先迁入平台层
- 不让平台接管 CI 的最终放行逻辑
- 不用平台流程替代现有 badcase export 协议

## Phase 1 交接

Phase 1 代码实现只允许读取这份文档，不再从主计划细则里抽象新的事件字段或新的事件种类。

如果后续需要扩展事件族，必须先改这份文档，再进入代码实现。
