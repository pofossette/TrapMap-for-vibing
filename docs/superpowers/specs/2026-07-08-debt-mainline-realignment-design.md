# 工程债主线重整设计

> 日期：2026-07-08
> 根入口：[`plan.md`](../../../plan.md)
> 当时活跃细则（已归档）：[`docs/todos/open-debt-and-compromises.md`](../../archived/archived-plans/open-debt-and-compromises-2026-07-11-archived.md)

## 背景

当前 [`docs/todos/agent-eval-framework-evaluation-and-plan.md`](../../todos/agent-eval-framework-evaluation-and-plan.md) 已明确写明 Agent Eval 主线 active closeout 完成并具备归档条件，但根 [`plan.md`](../../../plan.md) 仍指向它作为当前主线。

同时，当时的 [`docs/todos/open-debt-and-compromises.md`](../../archived/archived-plans/open-debt-and-compromises-2026-07-11-archived.md) 仍只是 debt register，不是可执行主线：它记录了真实残留问题，但没有当前批次、入口优先级、补录规则和主线切批机制。用户要求：

1. 归档当前 Agent Eval 主线
2. 同步清理 `docs/todos/` 活跃面
3. 将 `plan.md` 设为唯一主入口
4. 采用“总主线”方案而不是单一技术主题主线
5. 在真正开始执行前，先用 `fallow` 做一次总体分析，并据此更新 `open-debt-and-compromises.md`

本设计定义的是文档与执行入口重整方案，不直接实施归档或内容改写。

## 目标

在不新增并行活跃入口的前提下，把当前活跃面收束为：

1. `plan.md` 是唯一主入口
2. `open-debt-and-compromises.md` 从 debt register 升级为“工程债与平台成熟度收口”总主线细则
3. 已完成的 Agent Eval 主线退出活跃面并归档
4. 已清空的 `doc-drift-fix-list.md` 不再继续占用活跃面
5. 新总主线开始前，先以一次 `fallow` 仓库级静态复核重新校准问题池

## 非目标

- 本轮不直接确定所有债务都要在单次计划中完成
- 本轮不把 `open-debt-and-compromises.md` 变成无限增长的杂项备忘录
- 本轮不把 `MLflow` 或第二平台验证继续保留为当前活跃主线
- 本轮不在没有 `fallow` 复核的情况下直接冻结新的 debt 优先级

## 入口重整方案

### `plan.md` 作为唯一主入口

`plan.md` 应只承担入口职责，但比当前更强：

- 明确当前主线名称为“工程债与平台成熟度收口”
- 明确当前状态为进行中
- 只指向一个主细则：`docs/todos/open-debt-and-compromises.md`
- 明确说明 `docs/todos/` 下其他文档只有在被主细则显式引用并承担当前职责时才算活跃
- 明确 Agent Eval 主线已完成并转入归档参考

这意味着根索引不再同时挂两个“看起来都像主线”的入口。

### `docs/todos/` 的角色收缩

`docs/todos/` 不再承担“多入口并行执行面”。在本轮重整后：

- `open-debt-and-compromises.md` 是唯一主细则
- 其他文档只有在主细则明确声明其承担当前批次职责时才保留在活跃面
- 已完成或已清空职责的 todo 文档应转归档，而不是继续挂在活跃索引里

## 总主线文档结构

升级后的 `open-debt-and-compromises.md` 不应只是问题枚举，而应具备可执行主线结构。

### 1. 当前主线状态

文档开头应回答：

- 当前主线是什么
- 为什么现在切换到这条主线
- 当前 active focus 是哪一批问题
- 哪些事项只是 queued 或 deferred

### 2. 批次化执行模型

总主线内部应采用 tranche/batch 机制，避免所有债务被同时视为活跃：

- Tranche A：读侧耦合收口
- Tranche B：高频异步任务迁移到持久化队列
- Tranche C：分布式成熟度 follow-up

任一时刻只允许一个 active focus 批次，其余批次必须标记为 queued 或 deferred。

### 3. 问题池与补录规则

文档必须显式承认“当前清单可能不完整”，并允许后续补录；但每个新增项都必须带上：

- 来源
- 当前影响
- 建议归类：`active` / `queued` / `deferred` / `frozen`
- 证据入口

这样可以补全 debt register，但不会回到无结构堆积状态。

### 4. 冻结与移出规则

已完成事项不继续挂在主线正文里。处理规则应为：

- 已完成 closeout：移出主线，转归档或压缩为一行历史说明
- 已冻结但近期不做：转 `deferred` 或 `frozen decision`
- 只剩历史背景：移到 `docs/archived/`

## `fallow` 前置复核设计

在开始归档和主线改写前，先执行一次仓库级 `fallow` 静态分析，作为新主线的基线校准。

### 目的

- 复核当前 debt register 中哪些问题仍被代码现状支持
- 发现需要补录到问题池的新结构性问题
- 避免以过期判断直接冻结新的主线优先级

### 分析范围

本轮 `fallow` 复核应优先关注：

- architecture boundary / import coupling
- complexity hotspots / refactoring targets
- duplication clusters
- unused exports / dependencies 中可能暴露的清理机会

不要求把全部 `fallow` 输出原样搬进文档；必须经过人工归纳。

### 结果回写方式

`open-debt-and-compromises.md` 应新增“本轮基线复核”区块，把结果分成三类：

1. 已有 debt 被再次证实
2. 新发现、应补录进问题池的事项
3. 暂不纳入当前主线的问题或噪音

## 推荐实施顺序

1. 先执行一次 `fallow` 仓库级复核
2. 用复核结果更新 `open-debt-and-compromises.md`
3. 将其升级为新的总主线细则
4. 归档 Agent Eval 主线文档
5. 移出或归档 `doc-drift-fix-list.md`
6. 更新 `plan.md`，使其成为唯一主入口
7. 更新 `docs/todos/README.md` 与 `docs/archived/README.md` 以反映新活跃面和归档事实
8. 运行最小文档治理验证

这个顺序保证：新的主线不是基于旧 debt register 直接接管，而是先经过一次静态复核再成为执行入口。

## 风险与约束

### 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 直接把 `open-debt-and-compromises.md` 升级为主线但不补结构 | 总主线重新退化成 debt dump | 先重写结构，再回填内容 |
| 不做 `fallow` 复核就切换主线 | 新主线优先级可能建立在过期判断上 | 将 `fallow` 设为执行前强制步骤 |
| `plan.md` 仍然同时挂多个入口 | 活跃面再次失真 | 只保留一个主细则链接 |
| 已清空的 `doc-drift-fix-list.md` 继续保留 | 活跃面被无 owner 文档占用 | 归档或移出活跃索引 |

### 约束

- `plan.md` 只能做入口，不承载执行细节
- `docs/todos/` 活跃面只保留当前有 owner 的执行文档
- 归档动作必须同步更新 `docs/archived/README.md` 和 `docs/todos/README.md`
- `fallow` 输出必须经人工归纳后再回写，不直接粘贴报告

## 最小验证

本设计进入实施时，最小验证应包括：

```bash
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

如果归档或主线切换同时引入跨包边界结论更新，再补：

```bash
rtk pnpm exec fallow audit --base main
```

## 决策总结

本设计冻结以下决策：

1. 当前 Agent Eval 主线应归档，不再继续作为活跃主线
2. 新主线采用“总主线”方案，而不是单主题主线
3. `plan.md` 是唯一主入口
4. `open-debt-and-compromises.md` 需要先升级结构，再承担总主线职责
5. 真正开始执行前必须先做一次 `fallow` 总体复核并回写
