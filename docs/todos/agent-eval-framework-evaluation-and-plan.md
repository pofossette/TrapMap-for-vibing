# Agent Eval Framework Evaluation And Integration Plan

> 状态：active draft
> 更新日期：2026-07-03
> 结论类型：方向评估 + 接入计划，不是采购决策

## 目标

基于 TrapMap 当前 eval 内核与外部成熟框架的官方能力边界，判断：

1. 是否值得把现有 eval 系统切换到成熟库或平台
2. 哪一类框架适合“外挂式增强”而不是“替换内核”
3. 第一轮 PoC 应该接哪一个、接到什么深度、如何验收

## 当前 TrapMap Eval 内核的真实边界

以下能力已经是 TrapMap 的真相源，不应因为接入外部平台而退化：

- 统一入口与 tier 体系：[`evals/README.md`](../../evals/README.md)
- retrieval 离线评测：[`evals/retrieval/README.md`](../../evals/retrieval/README.md)
- retrieval live snapshot replay：[`evals/retrieval-live/README.md`](../../evals/retrieval-live/README.md)
- summary judge / fallback judge：[`evals/summary/README.md`](../../evals/summary/README.md)
- agent-planning deterministic dry-run：[`evals/agent-planning/README.md`](../../evals/agent-planning/README.md)
- baseline-aware CI：`pnpm eval:ci`
- badcase export -> eval draft：[`evals/README.md`](../../evals/README.md)

### 不可退化项

| 能力 | 当前状态 | 为什么不能丢 |
|---|---|---|
| governance assertion | 已具备 | 相关性与权限/策略断言分离，是 TrapMap 的产品语义 |
| endpoint-specific contract | 已具备 | `/v1`、`/v2`、`/v3`、skill lookup 响应面不一致 |
| offline isolated eval | 已具备 | CI 和本地快速回归依赖它 |
| live snapshot replay | 已具备 | 可控恢复真实派生状态，是高价值回归资产 |
| baseline compare | 已具备 | 已有回归门，不应为 UI 换掉 |
| badcase -> eval draft | 已具备 | 真实失败样本回流已成闭环 |

结论：TrapMap 不是“缺少 eval”，而是“缺少更成熟的平台层能力”。

## 外部成熟框架能补什么

对照官方文档，外部框架更强的基本都集中在平台层，而不是领域内核：

- trace / span / trajectory 可视化
- dataset 管理与实验对比
- annotation、feedback、human review
- online eval、生产流量回放、observability
- 更标准化的 experiment report 与团队协作界面

这意味着合理目标不是“迁移 eval 逻辑”，而是“把 TrapMap 的 case / report / trace 镜像到外部平台”。

## 官方证据摘录

以下结论只使用候选框架官方站点、官方文档或官方仓库。

### 平台型候选

#### LangSmith

- 官方 evaluation 文档明确覆盖 online evaluators、experiments、annotation queues、dataset transformations、comparative experiments。
- 这说明 LangSmith 在 agent trace、人工 review、实验对比上成熟度高。
- 但官方资料体现的是 hosted-first 产品形态，没有看到与 Langfuse / MLflow 同等级的 self-host 叙事。

来源：
- https://docs.smith.langchain.com/evaluation

#### Braintrust

- 官方 docs 首页明确包含 `evals`、`experiments`、`datasets`、`playground`、`proxy` 等一级能力。
- 这说明它更偏“评测运营平台”，适合统一在线评分、实验管理与 prompt/proxy 观测。
- 但从官方入口看，自托管不是其第一叙事，适合作 hosted 对照组，不适合作为 TrapMap 内核替代。

来源：
- https://www.braintrust.dev/docs

#### Langfuse

- 官方 evaluation 概览明确覆盖 LLM-as-a-Judge、human annotation、agent graph evaluation、production tests。
- 官方 self-host 页面明确提供 `docker compose`、Kubernetes、Helm、CDK 等部署方式。
- 这意味着它同时覆盖平台层能力与 self-host 诉求，和 TrapMap 当前“保留内核、外挂平台”的方向最匹配。

来源：
- https://langfuse.com/docs/evaluation/overview
- https://langfuse.com/self-hosting

#### MLflow GenAI

- 官方 MLflow 3 文档把 tracing、prompt management、evaluation、quality observability 放在同一条 GenAI 工作流里。
- 官方 GenAI evaluation 文档明确支持 judges、scorers、dataset-based evaluation、search-able runs。
- 这使 MLflow 适合“平台自控优先”的团队，尤其是希望把 eval、trace、experiment 统一到一套自托管基础设施的场景。

来源：
- https://mlflow.org/docs/latest/genai/index.html
- https://mlflow.org/docs/latest/genai/eval-monitor/

#### Phoenix

- 官方 Phoenix 仓库强调 open-source、AI observability、tracing、evaluations。
- Phoenix 官方定位更像诊断和 observability 平台，而不是完整的评测运营系统。
- 它更适合补 agent 中间路径诊断，不适合单独接管 TrapMap 的 eval 生命周期。

来源：
- https://github.com/Arize-ai/phoenix

### 库型候选

#### DeepEval

- 官方仓库强调 `unit testing LLM applications`、`evaluate LLM outputs`、pytest 风格、LLM judges、red teaming。
- 这表明它更像“本地可编程评测库”，适合补 metric 和 test ergonomics，不适合接管 dataset / trace / replay / CI baseline 平台层。

来源：
- https://github.com/confident-ai/deepeval

#### Ragas

- 官方仓库强调 RAG evaluation、agent evaluation、synthetic test generation、production monitoring。
- 这说明它在 retrieval / summary 质量指标上成熟，但它依然主要是指标与评测库，不是 TrapMap 所缺的完整平台层。

来源：
- https://github.com/explodinggradients/ragas

#### OpenAI Evals

- 官方仓库提供 benchmark / regression framework，但明显围绕 OpenAI 生态和 benchmark workflow。
- 对 TrapMap 这种跨 provider、带治理断言、带 live snapshot replay 的系统来说，适合局部借鉴 evaluator 设计，不适合作为整体演进方向。

来源：
- https://github.com/openai/evals

## 方案形态评估

### 方案 A：全量替换为单一外部框架

不推荐。

原因：

- 无法证明外部框架能原生表达 TrapMap 的 governance forbidden-hit 断言
- 无法证明外部框架能无损承接 retrieval-live snapshot replay
- 会把 endpoint-specific case schema、badcase export、baseline compare 一起搬迁，风险高且收益不成比例

### 方案 B：保留 TrapMap 内核，外挂 trace / dataset / annotation / experiment 平台

推荐。

原因：

- 与当前系统边界最兼容
- 可先镜像 `agent-planning` / `summary`，不碰 retrieval-live
- 失败可回滚，且不影响 `pnpm eval` / `pnpm eval:ci`

### 方案 C：引入库型框架补局部指标或 judge

可做，但优先级低于方案 B。

原因：

- DeepEval / Ragas 更适合补 metric，不解决 TrapMap 当前最缺的协作和可视化层
- 若没有 trace / annotation / experiment 闭环，单纯替换 judge 库收益有限

## 候选选择结论

### 主推荐

`Langfuse`

理由：

- 官方能力覆盖 eval、annotation、agent graph、production tests
- 官方自托管路径明确
- 适合作为“外挂式平台层”，而不是迫使 TrapMap 改写内核

### 第二候选

`MLflow`

理由：

- 更偏平台自控
- 如果团队已有 MLflow / experiment 基础设施，会更容易组织长期演进
- 但 agent-path UX 直觉上不如 Langfuse / LangSmith 明确，需要更重的实施与建模

### Hosted 对照组

`LangSmith`

理由：

- 官方 evaluation / annotation / comparative experiment 能力成熟
- 最适合作为“如果允许 hosted，平台体验到底能好多少”的对照样本
- 但不适合作为 TrapMap 默认主线

### 专项诊断补充

`Phoenix`

理由：

- 若 PoC 暴露出最大的痛点是 trajectory 诊断而不是 dataset 管理，可以补一个专项 observability 对照

## 不推荐的首轮方向

- 不要先接 `retrieval-live`
- 不要先改 `packages/contracts/src/domain/evals/`
- 不要先尝试把 `pnpm eval` 直接改造成外部 SDK 原生入口
- 不要先以“统一 UI”为理由重写已有 case schema

## 首轮 PoC 选择

### PoC-1：Langfuse 镜像 `agent-planning`

目标：

- 把 `agent-planning` 的一次 run 同步成外部 trace + score + dataset record
- 验证中间路径诊断和人工 review 是否真的提升问题定位效率

为什么先做它：

- 当前 `agent-planning` 仍偏 deterministic dry-run
- 语义负担比 retrieval-live 小
- 最容易看出外部 trace 平台的增益

验收条件：

- 不改现有 `agent-planning` case schema
- 不改现有 CLI 契约
- 可以从同一 run 产出 TrapMap 原生 report 与 Langfuse trace
- 至少能表达 case-level score、group-level metadata、step-level event

### PoC-2：Langfuse 或 MLflow 镜像 `summary`

目标：

- 验证 judge 结果、groundedness / coverage / forbiddenClaims 是否能映射到外部 score model
- 验证 annotation 与人工复核流程是否优于当前 JSON report

验收条件：

- 不替换 fallback judge
- 不引入 provider hard dependency
- 能保留 case ID、tier、endpoint、scenario ID、judge provider 等关键信息

### Hosted 对照 PoC：LangSmith 镜像 `agent-planning`

目的不是上生产，而是回答一个问题：

“Hosted-first 平台在 trace UX、annotation、comparative experiments 上，相比自托管候选到底领先多少？”

如果优势只是 UI 更顺滑，但无法降低 TrapMap 的维护成本，则终止 hosted 方向。

## 接入架构建议

建议采用“双写镜像”而不是“入口替换”：

1. TrapMap runner 继续生成原生 report
2. 新增可选 adapter，把 case/run/report 事件投影到外部平台
3. adapter 失败不能影响原生 eval exit code
4. CI 默认仍以 TrapMap 原生 report 为门禁

### 推荐接入层次

| 层次 | 是否接入外部平台 | 备注 |
|---|---|---|
| case schema | 否 | 继续以 `@trapmap/contracts` 为准 |
| runner orchestration | 否 | `scripts/run-eval.ts` 继续是真相入口 |
| report export adapter | 是 | 第一阶段主战场 |
| trace / annotation / experiment UI | 是 | 外部平台核心价值 |
| CI hard gate | 暂不 | 等 PoC 证明稳定后再看 |

## 决策门槛

### 继续保持“仅自建内核”

满足任一条件即停止外部接入扩张：

- 外部平台不能表达 TrapMap 关键治理断言
- 外部平台接入明显侵入现有 case schema 或 runner
- 外部平台只改善图表，不改善 triage / annotation / experiment 工作流

### 升级为“正式外挂平台”

只有全部满足才继续：

- 原生 eval CLI、case schema、CI gate 无破坏
- 外部平台能稳定接收 case/run/score 映射
- 工程师确认排障效率有可感知提升
- 文档化后的接入成本低于未来 6-12 个月继续纯自建平台层的成本

## 实施计划

### Phase 0：冻结比较基线

输出：

- 一份能力矩阵：哪些能力是 TrapMap 内核，哪些能力允许外挂
- 一份 scorecard：平台型候选与库型候选的同口径比较

交付：

- 本文档
- [`agent-eval-framework-scorecard.md`](./agent-eval-framework-scorecard.md)

### Phase 1：定义外部平台映射协议

工作项：

- 为 eval run 明确最小映射字段：`suite`、`tier`、`caseId`、`scenarioId`、`endpoint`、`status`、`scores`、`tags`
- 为 step / judge / assertion 事件定义可选 trace payload
- 设计 adapter 为“可插拔、可关闭、失败不阻塞”

退出条件：

- 有一份明确的 adapter payload 草图
- 不需要修改 `@trapmap/contracts` 的公开 case schema

### Phase 2：实现 Langfuse PoC

范围：

- 仅 `agent-planning`
- 仅本地与手动 smoke
- 不上 CI hard gate

记录指标：

- 接入工作量
- trace 可读性
- score 映射摩擦
- annotation 流程是否明显优于原生 JSON report

### Phase 3：实现第二候选 PoC

优先顺序：

1. `MLflow`，如果团队偏自托管平台
2. `LangSmith`，如果需要 hosted UX 对照

目标：

- 用同一套 `agent-planning` 或 `summary` case 做对照
- 比较 UI 价值、接入侵入性、长期维护成本

### Phase 4：做 go / no-go 决策

只回答三个问题：

1. 外部平台是否降低调试成本？
2. 外部平台是否改善 annotation / experiment 协作？
3. 外部平台是否能在不侵入内核的前提下长期维护？

若三者中少于两项成立，停止接入。

## 推荐结论

一句话结论：

**TrapMap 现在不该切换掉自建 eval 内核；应该优先做 `Langfuse` 外挂式 PoC，并用 `MLflow` 或 `LangSmith` 做一轮对照。**

更具体地说：

- 内核保留：case schema、runner、governance、snapshot replay、CI baseline
- 平台外挂：trace、annotation、dataset projection、experiment 对比
- 首轮切入：`agent-planning`
- 第二轮验证：`summary`
- 暂缓触碰：`retrieval-live`

## 证据链接

- LangSmith Evaluation: https://docs.smith.langchain.com/evaluation
- Braintrust Docs: https://www.braintrust.dev/docs
- Langfuse Evaluation Overview: https://langfuse.com/docs/evaluation/overview
- Langfuse Self-Hosting: https://langfuse.com/self-hosting
- MLflow GenAI: https://mlflow.org/docs/latest/genai/index.html
- MLflow GenAI Evaluation: https://mlflow.org/docs/latest/genai/eval-monitor/
- Phoenix GitHub: https://github.com/Arize-ai/phoenix
- DeepEval GitHub: https://github.com/confident-ai/deepeval
- Ragas GitHub: https://github.com/explodinggradients/ragas
- OpenAI Evals GitHub: https://github.com/openai/evals
