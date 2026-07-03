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

## 与 TrapMap report schema 的映射

Platform Model 不是新的 report schema。它是把现有 TrapMap report 重新组织成事件流，供平台适配器镜像。

### Run 级映射

- `EvalRunStarted` 对应 report 的 `meta` 起点，携带 suite、tier、runId、timestamp、tags 和执行选项快照
- `EvalRunFinished` 对应 report 的 `meta` 收口，携带 duration、汇总统计和最终状态

### Case 级映射

- `EvalCaseStarted` 对应 report 中 case 记录的生命周期开始
- `EvalCaseFinished` 对应 report 中 case 记录的生命周期结束
- `EvalScoreRecorded` 对应 case 级分数写回，并驱动 report 的 summary 聚合
- `EvalAssertionRecorded` 对应 case 级断言结果、失败分类和 failure 记录
- `EvalTraceStepRecorded` 对应 case 级 trace / trajectory 细节，供平台 UI、debug 和 review 使用

### 对现有 report 形状的落点

- `agent-planning` 这类 report 仍然以 `meta`、`summary`、`cases`、`groups`、`slices` 为最终输出
- `retrieval` 这类 report 仍然以 `meta`、`summary`、`slices`、`cases`、`failures`、`warnings` 为最终输出
- `summary` 这类 report 仍然以 `meta`、`summary`、`cases`、`failures` 为最终输出
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
