# Agent Eval Platform Long-Term Execution Plan

> 状态：active
> 更新日期：2026-07-06
> 类型：长期主线执行细则

## 当前进度（2026-07-05）

当前主线已完成 `Phase 1` / `Phase 2` closeout，并完成 `Phase 3` 的最小可用 `LangfuseAdapter` 首轮接入。`retrieval`、`summary`、`agent-planning` 现都已切到 suite-owned platform event builder。

本轮已完成：

- aggregate runner 与统一 CLI 已支持显式 `--platform langfuse`
- 新增 `evals/lib/platform/langfuse-config.ts`，只从 env 解析 Langfuse 显式配置
- 新增 `evals/lib/platform/langfuse-adapter.ts`，按现有 `EvalPlatformEvent` 做 mirror，不改 event schema
- `LangfuseAdapter` 已覆盖 run / case / score / assertion / trace 映射
- `evals/retrieval/lib/platform-events.ts` 与 `evals/summary/lib/platform-events.ts` 已落地；aggregate runner 现消费三条 suite-owned 事件流
- 缺配置、发布失败、网络/鉴权错误、close/shutdown flush 超时都保持 warning-only，不影响 eval 退出码
- `docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`、`evals/README.md`、`evals/summary/README.md`、`docs/guides/AGENT_EVAL_PLATFORM_INTEGRATION.md` 已回写
- native TrapMap report 继续是唯一 truth source；aggregate runner 不再维护 retrieval / summary / agent-planning 的内联 mirror 细节

本轮已验证：

- `rtk pnpm test:file -- evals/lib/platform/langfuse-config.test.ts`
- `rtk pnpm test:file -- evals/lib/platform/langfuse-adapter.test.ts`
- `rtk pnpm test:file -- scripts/__tests__/run-eval.test.ts`
- `rtk pnpm test:file -- evals/scripts/__tests__/eval-all.test.ts`
- `rtk pnpm eval -- smoke --dry-run --platform langfuse`
- `rtk pnpm eval -- core --dry-run --platform langfuse`
- `rtk pnpm eval:smoke`
- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`
- `rtk pnpm typecheck`

当前仍未完成：

- 真实 Langfuse 服务联通验证仍未做；截至 2026-07-06 22:29:56 CST，本次 shell 中重新执行 `rtk printenv LANGFUSE_BASE_URL LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY` 仍为空结果，且仓库内仍没有 checked-in Langfuse deployment/config 可作为 closeout 目标，因此当前只验证到缺配置 warning 路径
- `rtk pnpm eval -- core --dry-run --platform langfuse` 当前仍暴露既有 core dry-run 失败项：ingestion 1 个、agent-planning 3 个；该结果来自现有 suite 基线，不是本轮 `langfuse` 接入引入的新回归
- 第二平台适配器（`MLflow`）仍明确留在 deferred，不作为当前 active closeout 的完成条件

## 目标

在不替换 TrapMap eval 内核的前提下，建设一套长期易于维护和扩展的三层架构：

1. TrapMap Eval Kernel：继续承载 case schema、runner、governance、snapshot replay、CI gate
2. Platform Model：新增平台无关的 event / score / trace 模型
3. Platform Adapters：先接 `Langfuse`，再验证 `MLflow`，保留后续扩展空间

一句话原则：

**接受短期工作量，换未来的可替换性、可观测性和可维护性。**

## 非目标

- 不把外部平台变成首轮 CI hard gate
- 不在首轮改写 `@trapmap/contracts` 现有 case schema
- 不在首轮接入 `retrieval-live`
- 不用 `Ragas` / `DeepEval` 取代当前主流程

## 不可退化项

- governance assertion 仍以 TrapMap 原生断言为准
- endpoint-specific contract 不被统一成平台 shape
- offline isolated eval 保持可本地/CI 独立运行
- retrieval-live snapshot replay 不提前迁移
- baseline-aware CI 继续以 TrapMap 原生 report 为准
- badcase export 协议不变

## 全局文档更新要求

- [x] 任何新增 eval 平台接入规则，必须回写到 [`docs/operations/ENVIRONMENT.md`](../operations/ENVIRONMENT.md) 或新建对应 guide
- [x] 任何 eval 入口、tier、runner 行为变化，必须回写到 [`docs/operations/TESTING.md`](../operations/TESTING.md) 与相关 `evals/*/README.md`
- 任何共享 schema / 事件模型变更，必须先更新 `packages/contracts/src/domain/evals/`，再回写文档
- 若新增长期规则或目录落点约束，必须同步更新 [`docs/guides/DOCUMENTATION_GOVERNANCE.md`](../guides/DOCUMENTATION_GOVERNANCE.md) 或相关 reference

## 全局测试要求

- [x] 文档改动至少运行 `rtk pnpm check:docs-drift`
- [x] 文档改动至少运行 `rtk pnpm check:structure`
- [x] 涉及 eval runner、fixtures、judge、platform adapter 的改动，至少运行 `rtk pnpm eval:smoke`
- [x] 涉及 `packages/contracts`、跨包导入、共享类型变更，补跑受影响包测试与 `rtk pnpm typecheck`

## 执行阶段

### Phase 0: 冻结边界与事件模型

**目标**

把内核边界、平台边界、统一事件模型先写实，避免后续实现被具体平台反向绑架。

**文件落点**

- 新增：`docs/archived/agent-eval-platform-event-model.md`（已归档）
- 修改：`docs/todos/agent-eval-framework-evaluation-and-plan.md`
- 修改：`docs/archived/agent-eval-framework-scorecard.md`（已归档）

**Checklist**

- [x] 明确内核层、平台模型层、适配层的职责边界
- [x] 定义统一事件族：`EvalRunStarted`、`EvalRunFinished`、`EvalCaseStarted`、`EvalCaseFinished`、`EvalScoreRecorded`、`EvalAssertionRecorded`、`EvalTraceStepRecorded`
- [x] 明确每类事件的最小字段：`suite`、`tier`、`runId`、`caseId`、`scenarioId`、`timestamp`、`tags`、`payload`
- [x] 明确事件模型与现有 `report` schema 的映射关系
- [x] 记录哪些能力首轮不进入平台接入：`retrieval-live`、CI hard gate、badcase export 替换
- [x] 回写文档并完成守卫验证

**本阶段文档要求**

- [x] 新建 `agent-eval-platform-event-model.md`，作为 Phase 1 代码实现的唯一事件设计输入（已归档至 `docs/archived/`）

**本阶段验证**

- [x] `rtk pnpm check:docs-drift`
- [x] `rtk pnpm check:structure`

### Phase 1: 建立平台无关 schema 与 adapter interface

**目标**

先落统一类型和 adapter 接口，不接外部平台。

**建议文件**

- 新增：`packages/contracts/src/domain/evals/platform.ts`
- 新增：`packages/contracts/src/domain/evals/platform.test.ts`
- 新增：`evals/lib/platform/types.ts`
- 新增：`evals/lib/platform/adapter.ts`
- 新增：`evals/lib/platform/noop-adapter.ts`
- 新增：`evals/lib/platform/json-archive-adapter.ts`
- 修改：`packages/contracts/src/domain/evals/index.ts`
- 修改：`evals/scripts/eval-all.ts`
- 修改：`scripts/run-eval.ts`

**Checklist**

- [x] 定义平台无关 schema：run、event、score、trace step
- [x] 导出统一 `EvalPlatformAdapter` 接口
- [x] 实现默认 `noop` adapter
- [x] 实现本地 `json archive` adapter，先写入 `reports/`
- [x] 约束 adapter 失败只产出 warning，不影响 eval 退出码
- [x] 在不启用平台时，现有 eval 路径保持零行为变化

**本阶段文档要求**

- [x] 如新增事件模型公开说明，补写到 `docs/archived/agent-eval-platform-event-model.md`
- [x] 如 root command 或参数说明变化，回写 [`README.md`](../../README.md) 或相关 README

**本阶段测试要求**

- [x] `rtk pnpm --filter @trapmap/contracts test --run packages/contracts/src/domain/evals/platform.test.ts`
- [x] `rtk pnpm test:file -- evals/scripts/__tests__/eval-ci.test.ts`（2026-07-06 Stage 1A baseline：10 tests passed）
- [x] `rtk pnpm eval -- agent-planning --tier smoke --dry-run`（2026-07-06 Stage 1A baseline：33/33 passed，Avg score 0.97）
- [x] `rtk pnpm typecheck`（2026-07-06 Stage 1A baseline：TypeScript: No errors found）

### Phase 2: `agent-planning` 接入统一事件模型

**目标**

先让最适合做 PoC 的 suite 发出稳定事件，验证平台模型是否够用。

**建议文件**

- 修改：`evals/agent-planning/run.ts`
- 修改：`evals/agent-planning/lib/report.ts`
- 修改：`evals/agent-planning/lib/format.ts`
- 修改：`evals/agent-planning/lib/judge-runner.ts`
- 修改：`evals/agent-planning/lib/actor-runner.ts`

**Checklist**

- [x] 发送 run started / finished 事件
- [x] 发送 case started / finished 事件
- [x] 发送 deterministic precheck 结果
- [x] 发送 dimension score、final score、failure rationale
- [x] 发送 group / slice 元数据
- [x] 必要时记录 step 级 trace，避免过度设计
- [x] 保持终端输出和原生 JSON report 的对外契约不变

**当前实现说明**

- `agent-planning`、`retrieval`、`summary` 的平台事件构建都已下沉到 suite 侧，分别由各自的 `lib/platform-events.ts` 基于 native report truth source 生成事件
- `evals/scripts/eval-all.ts` 只负责 adapter 选择、运行编排、事件发布和 warning-only 失败处理，不再重建 suite 内部事件细节

**本阶段文档要求**

- [x] 若 `agent-planning` 运行入口、输出字段或判定标准变化，回写 [`evals/agent-planning/README.md`](../../evals/agent-planning/README.md)
- [x] 若统一入口行为变化，回写 [`evals/README.md`](../../evals/README.md) 与 [`docs/operations/TESTING.md`](../operations/TESTING.md)

**本阶段测试要求**

- [x] `rtk pnpm eval -- agent-planning --tier smoke --dry-run --json --json-path ./reports/agent-planning-smoke.json`
- [x] `rtk pnpm eval -- agent-planning --tier core --dry-run`
- [x] `rtk pnpm eval:smoke`

### Phase 3: 接入 `LangfuseAdapter`

**目标**

验证 self-host 平台能否在不侵入内核的前提下明显提升调试与 review 效率。

**建议文件**

- 新增：`evals/lib/platform/langfuse-adapter.ts`
- 新增：`evals/lib/platform/langfuse-config.ts`
- 新增：`evals/lib/platform/langfuse-adapter.test.ts`
- 新增：`docs/guides/AGENT_EVAL_PLATFORM_INTEGRATION.md`
- 修改：`evals/scripts/eval-all.ts`
- 修改：`scripts/run-eval.ts`
- 修改：`docs/operations/ENVIRONMENT.md`

**Checklist**

- [x] 通过显式配置启用 `LangfuseAdapter`
- [x] 映射 case-level score、tags、tier、trace step
- [x] 处理网络/鉴权/超时失败为 warning
- [x] 保持平台关闭时零行为变化
- [x] 为接入、调试、禁用写清操作指南

**当前实现说明**

- `scripts/run-eval.ts` 与 `evals/scripts/eval-all.ts` 已接受 `--platform langfuse`
- `langfuse` 只在 aggregate suite 且显式传入 `--platform langfuse` 时启用；不会自动探测
- 缺少 `LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY` 时，不会创建 adapter，只打印 warning
- 首轮 adapter 只承担 mirror 职责，不依赖 Langfuse 返回值驱动任何 TrapMap 内部逻辑
- retrieval / summary / agent-planning 三个 suite 的 platform events 现都由 suite owner 生成；当前剩余 closeout 只差真实 Langfuse 目标验证

**本阶段文档要求**

- [x] 在 [`docs/operations/ENVIRONMENT.md`](../operations/ENVIRONMENT.md) 中增加平台环境变量说明
- [x] 在 [`docs/guides/AGENT_EVAL_PLATFORM_INTEGRATION.md`](../guides/AGENT_EVAL_PLATFORM_INTEGRATION.md) 中记录启用方式、失败处理、回滚方式
- [x] 如统一入口增加平台参数，回写 [`evals/README.md`](../../evals/README.md)

**本阶段测试要求**

- [x] `rtk pnpm eval -- agent-planning --tier smoke --dry-run`
- [x] `rtk pnpm eval -- agent-planning --tier core --dry-run`
- [x] `rtk pnpm eval:smoke`
- [x] `rtk pnpm check:docs-drift`

**本阶段剩余 closeout**

- [ ] 用真实 Langfuse 服务做一次手动联通验证，并把结果回写到本节或对应 closeout 记录
- [ ] 当前阻塞说明：2026-07-06 22:29:56 CST 这次执行中重新执行 `rtk printenv LANGFUSE_BASE_URL LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY` 仍为空结果；仓库也没有 checked-in Langfuse deployment/config 可供对接。要关闭这项 active closeout，至少还需要二者之一：1) 提供可访问的 `LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY`；2) 在仓库中补入团队认可的 checked-in Langfuse deployment/config truth source。否则 live closeout 继续属于 environment-blocked，而不是代码未完成

### Phase 4: Deferred Follow-up - 第二平台可替换性验证

> 状态：deferred，不属于当前 active closeout 完成条件。

**目标**

把第二平台验证明确收敛为 deferred work，避免与当前 active closeout 混淆。

**建议文件**

- 新增：`evals/lib/platform/mlflow-adapter.ts`
- 新增：`evals/lib/platform/mlflow-config.ts`
- 新增：`evals/lib/platform/mlflow-adapter.test.ts`
- 修改：`docs/guides/AGENT_EVAL_PLATFORM_INTEGRATION.md`
- 修改：`docs/operations/ENVIRONMENT.md`

**Checklist**

- [ ] 实现 `MLflowAdapter`
- [ ] 保持 suite 代码不因平台切换而分叉
- [ ] 保持切换平台只改配置，不改 case schema 和 runner 协议
- [ ] 对比 `Langfuse` 与 `MLflow` 的长期维护成本和适配摩擦

**本阶段文档要求**

- [ ] 补充第二平台启用与切换说明
- [ ] 记录平台选择建议和保守回退路径

**本阶段测试要求**

- [ ] `rtk pnpm eval -- retrieval --tier smoke --dry-run`
- [ ] `rtk pnpm eval -- summary --tier smoke --provider fallback`
- [ ] `rtk pnpm eval:smoke`

## 进度门槛

### 进入下一阶段前必须满足

- [x] 当前阶段的文档更新已完成
- [x] 当前阶段的最小测试已完成
- [x] 未完成项已写回 checklist 或 debt register

### 停止扩张条件

- 如果 adapter 侵入 runner 过深，暂停新增平台
- 如果平台只改善图表、不改善 triage / review / experiment 效率，暂停新增平台
- 如果平台稳定性影响本地/CI，暂停扩大接入范围

## 历史起手动作（已完成）

- [x] 新建 `docs/archived/agent-eval-platform-event-model.md`（已完成并归档）
- [x] 为 `packages/contracts/src/domain/evals/` 新增 `platform.ts`
- [x] 为 `evals/lib/platform/` 新增 `types.ts`、`adapter.ts`、`noop-adapter.ts`、`json-archive-adapter.ts`
- [x] 只让 `agent-planning` 做第一轮 JSON 双写，不直接上外部平台
