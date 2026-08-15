# Agent 路径规划对比测评计划

## 1. 目标

为 TrapMap 新增一类独立 eval suite，用于比较“零散 skill 集合”与“计划图集合”在相同任务上的实现路径规划正确率，并输出平均提升率。

本计划首版只交付：

- 可扩展的测试脚手架
- 真实模型执行入口
- 基于 rubric 的 judge 评分链路
- 1-2 个 smoke 级示例 case
- 聚合报表与文档

本计划首版不交付：

- 大规模正式数据集
- 动态生成的计划图集合
- 强绑定某个参考仓库的完整 system prompt 文件

## 2. 关键约束

- 一个完整 case 的主标识必须是“具体任务”，不是 skill 集合名，也不是计划图名。
- 同一个任务可以挂多个变体；变体之间只改变集合类型、干扰强度、skill 数量、skill 复杂度、任务复杂度等控制变量。
- 干扰集合必须优先复用仓内已存在的第三方 skill 测试集合与已有测试数据，不新造一套脱离现有 fixture 语义的假数据。
- 计划图集合首版使用静态 fixture，但 contract 和 runner 必须预留后续切到动态计划图来源的扩展位。
- 执行模型与 judge 模型解耦配置；首版可以默认走同一 provider 家族，但接口不能写死成单一路径。
- 这条 eval 属于独立 suite，不复用 retrieval/summary case schema，也不把路径规划打分硬塞进现有 report 结构。

## 3. 数据建模规则

### 3.1 Case 与 Variant

- `taskId`：同一具体任务的稳定标识，作为完整 case 的主标识。
- `variantId`：同一任务下的具体变体标识。
- `variantGroupId`：同一任务的一组对比实验归组键，至少覆盖：
  - `skill-set`
  - `plan-graph-set`
  - `low-interference`
  - `high-interference`
- `taskType`：任务类型，如顺序执行型、排错型、筛选型、组合型。
- `taskComplexity`：任务复杂度分级，首版固定为离散枚举，避免自由文本。
- `contextSetKind`：`skill-set` 或 `plan-graph-set`。
- `interferenceLevel`：干扰强度分级，至少包含 `none`、`low`、`medium`、`high`。
- `interferenceSources`：该变体引入了哪些干扰文件、来自哪个仓内 fixture 池。

### 3.2 Golden Path 与评分

- 每个任务必须提供 `goldenPath`，内容包括：
  - 期望步骤序列
  - 关键动作
  - 可接受替代动作
  - 禁止动作
  - 每个评分项的权重
- 每个任务必须提供 `judgeRubric`，由项目内 mock 数据直接定义详细分值条目。
- 首版评分以 judge 为主，但必须保留 deterministic 预校验层：
  - 必填步骤/关键动作缺失
  - 禁止动作命中
  - 输出为空或无法解析

### 3.3 提升率口径

- 同一 `taskId` 下，必须能比较：
  - `skill-set` 对 `plan-graph-set`
  - 低干扰对高干扰
  - 简单集合对复杂集合
- 报表同时输出：
  - 平均总分
  - 平均路径分
  - 平均最终答案分
  - 绝对分差
  - 相对提升率
- 相对提升率固定为：
  - `lift = (planGraphAvg - skillSetAvg) / max(skillSetAvg, epsilon)`

## 4. 干扰数据来源与构造规则

### 4.1 干扰来源必须优先复用仓内现有数据

首版干扰文件与候选 skill 集合必须优先来自以下仓内来源：

- `evals/ingestion/fixtures/*/SKILL.md`
  - 用作最小第三方 skill fixture 池，适合构造低强度干扰和结构完整的外部 skill 输入。
- `evals/graph-extraction/fixtures-real.ts`
  - 用作真实 skill 图提取样本池，适合构造更接近真实描述风格的干扰 skill。
- `evals/graph-extraction/dedup-fixtures-real.ts`
  - 用作高相似度或近邻 skill 池，适合构造“容易误选”的强干扰变体。
- `evals/graph-extraction/conflict-fixtures-real.ts`
  - 用作语义相近但目标不同、或问题域接近但方法不同的冲突 skill 池。
- `evals/fixtures/traps/index.ts`
  - 用作任务约束、常见误区、阻塞条件或计划图中的 trap 节点素材池。
- `evals/retrieval/scenarios/` 与 `evals/summary/scenarios/`
  - 用作已有任务背景、语料、actor/场景建模的参考数据来源。

### 4.2 干扰强度定义

- `none`
  - 只注入完成任务必需的 skill 或计划图节点，不加额外无关项。
- `low`
  - 注入少量明显无关的第三方 skill，主要验证基本筛选能力。
- `medium`
  - 注入部分主题相近但任务不匹配的 skill，验证选择与排序能力。
- `high`
  - 注入高相似度、冲突型、近邻型 skill，验证计划图相对零散 skill 的抗干扰优势。

### 4.3 任务与干扰的绑定方式

- 同一 `taskId` 必须复用同一个任务描述、同一个 golden path、同一个 expected outcome。
- 同一 `taskId` 的不同变体只允许修改：
  - 注入 skill 集合
  - 注入计划图集合
  - 干扰强度
  - 干扰文件列表
  - 可选的 skill 数量/复杂度参数
- 不允许在高干扰变体里偷偷改任务目标或改评分 rubric。

## 5. 实现范围

### 5.1 Contracts

在 `packages/contracts/src/domain/evals/` 新增独立 contract：

- agent planning eval case schema
- agent planning eval scenario schema
- agent planning eval report schema

最少字段必须覆盖：

- `taskId`
- `variantId`
- `variantGroupId`
- `tier`
- `taskType`
- `taskComplexity`
- `contextSetKind`
- `interferenceLevel`
- `interferenceSources`
- `promptTemplateId`
- `goldenPath`
- `judgeRubric`
- `expectedOutcome`
- `tags`

### 5.2 Evals 目录

新增 `evals/agent-planning/`：

- `README.md`
- `run.ts`
- `smoke.ts`
- `core.ts`
- `datasets/`
- `scenarios/`
- `lib/`

`lib/` 至少拆成：

- `prompt-loader.ts`
- `context-renderer.ts`
- `actor-runner.ts`
- `judge-runner.ts`
- `normalizer.ts`
- `scoring.ts`
- `report.ts`
- `format.ts`

### 5.3 CLI 与聚合入口

新增 root scripts：

- `eval:agent-planning`
- `eval:agent-planning:smoke`
- `eval:agent-planning:core`
- `eval:agent-planning:dry-run`

并把该 suite 接入 `evals/scripts/eval-all.ts`，使其进入：

- `pnpm eval:smoke`
- `pnpm eval:core`

### 5.4 Prompt 与模型执行

- prompt loader 首版只要求支持仓内模板与外部文件路径，不要求现在绑定参考仓库的完整 prompt 文件。
- actor runner 负责真实模型执行。
- judge runner 读取：
  - 任务描述
  - 注入上下文
  - actor 回复
  - golden path
  - rubric 明细
- judge 输出必须是结构化结果，至少含：
  - 各评分项得分
  - 总分
  - 关键命中项
  - 关键缺失项
  - 禁止动作命中项
  - 简短判语

## 6. Smoke 数据要求

首版至少放 1-2 个 smoke 示例任务，并满足：

- 每个 smoke 任务都有 `taskId`
- 同一 `taskId` 至少有两个变体：
  - `skill-set` 变体
  - `plan-graph-set` 变体
- 至少有一个 `taskId` 再额外挂一个高干扰变体
- 干扰 skill 必须来自 `evals/ingestion/fixtures/*/SKILL.md` 或 `evals/graph-extraction/*real.ts`
- 如果任务需要 trap/阻塞关系，优先从 `evals/fixtures/traps/index.ts` 取素材，不新写脱离现有 trap 语义的文本

## 7. 报表要求

报告分为 case 级、group 级、slice 级三层：

- case 级：
  - actor 原始输出
  - judge 结构化评分
  - deterministic 预检查结果
  - 总分与 pass/fail
- group 级：
  - 同一 `taskId` 下各变体对比
  - `skill-set` 对 `plan-graph-set` 的分差与提升率
  - 不同干扰强度下的鲁棒性对比
- slice 级：
  - 按 `taskType`
  - 按 `taskComplexity`
  - 按 `contextSetKind`
  - 按 `interferenceLevel`
  - 按 skill 数量区间
  - 按 skill 复杂度区间

## 8. 文档回写

至少更新：

- `evals/README.md`
- `docs/operations/TESTING.md`
- `evals/agent-planning/README.md`

如果新增命令或 suite 名称容易漂移，补充 doc drift guard，锁定：

- `eval:agent-planning*` 命令面
- `evals/agent-planning/` 目录入口
- “完整 case 以具体任务为标识”的规则
- “同一任务配置不同种类强度干扰”的规则

## 9. 最小验证

实现完成后至少运行：

```bash
pnpm --filter @trapmap/contracts test --run <agent-planning-contract-tests>
pnpm test:file -- <agent-planning-runner-tests>
pnpm eval:agent-planning:dry-run
pnpm eval:smoke
pnpm check:docs-drift
pnpm check:structure
```

如果首版真实模型执行默认需要 provider env，则 dry-run 必须在无 provider env 条件下也能通过。

## 10. 首版完成标准

- 新 suite 能独立运行 dry-run
- root eval 聚合入口能识别并汇总该 suite
- 至少 1 个 `taskId` 能跑出 `skill-set` 与 `plan-graph-set` 对比结果
- 至少 1 个高干扰变体能进入报表
- 干扰数据来源明确绑定仓内现有第三方 skill fixture 与已有测试数据
- 文档写明 case 标识规则、干扰规则、评分规则与扩展位
