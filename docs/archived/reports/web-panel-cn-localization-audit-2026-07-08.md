# Web Panel 中文本地化残留审计报告

- 日期：2026-07-08
- 范围：`packages/web-panel/src/**`
- 目标：收集网页面板中“中文界面仍混有英文文案/状态/术语”的问题，形成后续修复清单
- 说明：本次只统计前端面板直接渲染到 UI 的文案，以及会直接透传到 UI 的 mapper/status label；不统计纯文档、测试断言、后端内部日志
- 扫描方式：主代理本地静态扫描 + `gpt-5.4-mini` 子代理补充页面/共享组件复核

## 扫描结论

问题集中在 4 类位置：

1. 页面组件中直接硬编码英文文案，没有走 `i18n-store`
2. mapper 把英文风险标签、元数据标签、默认 source/status 直接塞进 view model
3. 图谱页面、工件抽屉、控制台卡片里存在大段英文说明文案
4. 中文 locale 已经存在，但页面仍在拿英文值做条件判断，导致“中英文混排”和“术语不统一”同时出现

问题最集中的页面：

- `packages/web-panel/src/pages/dashboard/dashboard-page.tsx`
- `packages/web-panel/src/pages/artifacts/artifacts-page.tsx`
- `packages/web-panel/src/pages/trap-graph/trap-graph-page.tsx`
- `packages/web-panel/src/pages/skill-graph/skill-graph-page.tsx`
- `packages/web-panel/src/pages/review-queue/review-queue-page.tsx`
- `packages/web-panel/src/pages/review-detail/review-detail-page.tsx`
- `packages/web-panel/src/services/mappers/review-item-mapper.ts`

## 建议保留英文的术语

这些词更适合作为产品名、技术名或对象标识保留英文，不建议简单汉化：

- `TrapMap`
- `Trap`
- `Skill`
- `JSON`
- `API`
- `ID`
- `G6`
- 工件/图谱里的真实 `artifact.id`、`file.path`、`sha-*`、`revision` 编号

## 问题清单

| 页面/区域 | 文件与行号 | 原文案 | 问题类型 | 建议 |
| --- | --- | --- | --- | --- |
| 共享页头组件 | `packages/web-panel/src/shared/ui/section-header.tsx:13` | `TrapMap Console` | 纯英文未翻译 | 改为 `TrapMap 控制台` |
| 共享空状态组件 | `packages/web-panel/src/shared/ui/empty-state.tsx:17` | `No items matched your filter preferences.` | 默认英文文案会回落到业务页 | 改为 `没有符合筛选条件的条目。`，并强制业务页显式传入中文描述 |
| 共享时间线组件 | `packages/web-panel/src/shared/ui/timeline-item.tsx:37` | `By` + `typeLabel` 原值 | 中英混排 / 数据字段直接裸露到 UI | 改为结构化渲染，例如 `由 {actor}`，并给 `typeLabel` 增加统一中文映射 |
| 控制台服务健康卡片 | `packages/web-panel/src/pages/dashboard/dashboard-page.tsx:103` | `Running` | 纯英文未翻译 | 改为 `运行中` |
| 控制台服务健康列表 | `packages/web-panel/src/pages/dashboard/dashboard-page.tsx:128` | `HEALTHY` / `DEGRADED` / `UNHEALTHY` | 纯英文状态直接裸露到 UI | 统一为 `健康` / `降级` / `异常` |
| 控制台待处理卡片标题 | `packages/web-panel/src/pages/dashboard/dashboard-page.tsx:142-166` | `Pending Backlogs` / `Action Needed` / `Pending Reviews` / `Audit Queue` / `Failed Runtime Jobs` / `Check Logs` / `18 items` / `2 jobs` | 大片英文硬编码 | 建议改为 `待处理积压`、`需要处理`、`待审核条目`、`查看审核队列`、`运行时失败任务`、`查看日志`、`18 条`、`2 个任务` |
| 控制台图谱预览卡片 | `packages/web-panel/src/pages/dashboard/dashboard-page.tsx:180-185` | `Trap Graph Overview` / `Topology` | 纯英文未翻译 | 建议改为 `Trap 图谱概览` / `拓扑` |
| 控制台图谱统计 | `packages/web-panel/src/pages/dashboard/dashboard-page.tsx:181` | `9 nodes · 8 relationships` | 英文计量文案 | 建议改为 `9 个节点 · 8 条关系` |
| 控制台头部运行信息 | `packages/web-panel/src/pages/dashboard/dashboard-page.tsx:44-61` | `PROFILE` / `BUILD` / `LAST CHECK` / `n/a` | 英文标签未本地化 | 建议接入现有 `i18n-store`，改为 `配置档` / `构建` / `上次检查` / `暂无` |
| 控制台扩展卡片 | `packages/web-panel/src/pages/dashboard/dashboard-page.tsx:180-448` | `Interactive Debug` / `Skill Graph Overview` / `Derivation` / `Audit Derivation` / `Knowledge Scale Index` / `Total Traps` / `Skill Artifacts` / `Capsules` | 英文硬编码集中残留 | 建议改为 `交互式调试`、`Skill 图谱概览`、`推导`、`审查推导`、`知识规模指数`、`陷阱总数`、`技能工件`、`胶囊数` |
| 审核队列状态筛选器 | `packages/web-panel/src/pages/review-queue/review-queue-page.tsx:99-104` | `Submitted` / `Approved` / `Rejected` | 筛选项硬编码英文 | 改为 `已提交` / `已批准` / `已拒绝` |
| 审核队列空状态描述 | `packages/web-panel/src/pages/review-queue/review-queue-page.tsx:258-260` | `No pending items match your filter preferences...` | 纯英文未翻译 | 改为完整中文说明，并迁入 i18n |
| 审核队列时间字段 | `packages/web-panel/src/pages/review-queue/review-queue-page.tsx:308-313` | `Created` | 纯英文未翻译 | 改为 `创建时间` 或复用 `createdAt` |
| 审核详情上下文卡片 | `packages/web-panel/src/pages/review-detail/review-detail-page.tsx:173-181` | `Source` / `Status` / `Assigned Reviewer` / `Created At` | 依赖英文 label 再映射中文 | mapper 层直接返回已本地化 key 或结构化字段，避免 UI 继续比对英文字符串 |
| 审核详情默认值 | `packages/web-panel/src/pages/review-detail/review-detail-page.tsx:190-192` | `Unassigned` | 默认英文值透传到 UI | 改为 view model 层统一输出空值或 `unassigned` key |
| 审核详情告警标签 | `packages/web-panel/src/pages/review-detail/review-detail-page.tsx:222-225` | `agent-note` / `manual-flag` | 内部枚举值直接展示 | 建议改为 `代理备注` / `人工标记` |
| 活动页类型切片判断 | `packages/web-panel/src/pages/activity/activity-page.tsx:76-84` | `Review Decision` / `Manual Intervention` / `System Ingestion` | 页面逻辑绑定英文类型名 | 应改为稳定枚举值，再由 i18n 显示中文 |
| 活动页类型筛选 | `packages/web-panel/src/pages/activity/activity-page.tsx:134-178` | `Review Decision` / `Manual Intervention` / `System Ingestion` | 选项 id 为英文展示语义，术语混乱 | 建议保留内部枚举，如 `review-decision`，显示文案单独翻译 |
| 工件页标题描述 | `packages/web-panel/src/pages/artifacts/artifacts-page.tsx:79-82` | `View and inspect governed skill artifacts...` | 大段英文说明未翻译 | 改为中文描述，并迁入 i18n |
| 工件页筛选区 | `packages/web-panel/src/pages/artifacts/artifacts-page.tsx:86-112` | `Search by ID or title...` / `All States` / `Approved` / `Submitted` / `Draft` / `All Scopes` / `Global` / `Project` | 纯英文筛选文案 | 统一中文化；`Global`/`Project` 若保留枚举，UI 应显示 `全局` / `项目` |
| 工件页列表状态 | `packages/web-panel/src/pages/artifacts/artifacts-page.tsx:131-145,178-180` | `Loading artifacts...` / `No governed artifacts found.` / `STATE` / `APPROVED` 等 | 英文加载态、空态、表头、状态值 | 全部接入 i18n；状态值不要直接 `toUpperCase()` 输出 |
| 工件详情抽屉 | `packages/web-panel/src/pages/artifacts/artifacts-page.tsx:214-368` | `Close` / `Loading detailed metadata...` / `Base Information` / `Lifecycle State` / `Required Level` / `Owner` / `Derivation Results` / `File Manifest` / `Governance Metadata` / `Last Reviewed At` / `View Skill Graph` | 大量英文硬编码 | 建议拆成统一字典，抽屉整体改为中文界面 |
| 工件详情派生统计 | `packages/web-panel/src/pages/artifacts/artifacts-page.tsx:268-289` | `Capsules` / `References` / `Scripts` / `No computed derivation outputs found for this revision.` | 英文统计与空态 | 改为 `胶囊` / `引用` / `脚本` / `当前修订未生成派生结果` |
| Trap 图谱页描述 | `packages/web-panel/src/pages/trap-graph/trap-graph-page.tsx:89-92` | `Topology mapping and dependency analysis...` | 大段英文说明 | 改为中文说明 |
| Trap 图谱左侧控制区 | `packages/web-panel/src/pages/trap-graph/trap-graph-page.tsx:111-167` | `Graph Layers` / `Trap (Threat Risks)` / `Cue (Signatures)` / `Tool (Penetration)` / `Neighborhood Depth` / `1-Hop Neighbors` | 大量英文选项 | 建议译为 `图层筛选`、`Trap（威胁风险）`、`Cue（信号）`、`Tool（工具）`、`邻域深度`、`1 跳邻居` 等 |
| Trap 图谱统计与搜索 | `packages/web-panel/src/pages/trap-graph/trap-graph-page.tsx:194-217` | `Graph Stats` / `Nodes` / `Edges` / `Search graph node...` / `Initializing Graph Engine...` | 纯英文统计和加载态 | 改为 `图谱统计` / `节点` / `边` / `搜索图节点...` / `正在初始化图引擎...` |
| Trap 图谱检查器 | `packages/web-panel/src/pages/trap-graph/trap-graph-page.tsx:232-315` | `Graph Inspector` / `Node ID` / `Model Type` / `Severity` / `Relation` / `Evidence / Notes` / `No evidence linked...` | 纯英文元数据面板 | 建议统一改为中文标签；`ID` 可保留英文缩写 |
| Skill 图谱页说明 | `packages/web-panel/src/pages/skill-graph/skill-graph-page.tsx:98-100` | `Analyze compile-time structural derivations...` | 大段英文说明 | 改为中文说明 |
| Skill 图谱选择/视角切换 | `packages/web-panel/src/pages/skill-graph/skill-graph-page.tsx:106-166` | `Artifact:` / `Derivation View (推导视角)` / `Semantic Graph (语义关系)` | 中英混排不统一 | 建议统一成 `工件：` / `推导视角` / `语义图谱` |
| Skill 图谱左侧说明 | `packages/web-panel/src/pages/skill-graph/skill-graph-page.tsx:180-205` | `View Controls` / `Derivation mode...` / `Semantic mode...` / `Graph Stats` | 大段英文硬编码 | 改为完整中文说明 |
| Skill 图谱搜索与加载态 | `packages/web-panel/src/pages/skill-graph/skill-graph-page.tsx:212-223` | `Search graph node...` / `Rebuilding Layout...` | 英文交互文案 | 改为 `搜索图节点...` / `正在重建布局...` |
| Skill 图谱检查器 | `packages/web-panel/src/pages/skill-graph/skill-graph-page.tsx:237-339` | `Derivation Inspector` / `Situation context:` / `Goal state:` / `Policy:` / `Needs Approval` / `Side Effect:` / `Submitter:` / `Hash:` / `Relation:` | 大量英文标签与示例值 | 统一中文化；示例值如 `sha-*` 保留英文 |
| 壳层品牌与模式切换 | `packages/web-panel/src/app/shell/app-shell.tsx:216-223,397-399` | `Switch to light mode` / `Switch to dark mode` / `Admin Workspace` | 中心 UI 英文残留 | 改为 `切换到浅色模式` / `切换到深色模式` / `管理工作台` |
| 壳层主题按钮 | `packages/web-panel/src/app/shell/app-shell.tsx:213-237` | `Dark` / `Light` | 纯英文模式名 | 改为 `深色` / `浅色` |
| mapper 风险标签 | `packages/web-panel/src/services/mappers/review-item-mapper.ts:48-57` | `High Risk` / `Needs Review` / `Low Risk` | 英文风险标签在数据层生成 | 不应在 mapper 中固化英语；建议改为结构化枚举：`high` / `medium` / `low` |
| mapper 默认来源 | `packages/web-panel/src/services/mappers/review-item-mapper.ts:77,100` | `knowledge-entry` | 数据字段直接裸露到 UI | 若属内部 source kind，应在 UI 显示 `知识条目`，内部值保留枚举 |
| mapper 元数据标签 | `packages/web-panel/src/services/mappers/review-item-mapper.ts:107-110` | `Scope` / `Required Level` / `Owner` / `Last Updated` | 英文 label 在 view model 固化 | 建议改为 key 驱动，交给 i18n 层显示 |
| 中文 locale 术语漂移 | `packages/web-panel/src/stores/i18n-store.ts:56,65,126-151,184-195` | `服务集成健康状况`、`治理审核队列`、`Schema`、`JSON`、`Payload` 等混合策略不一致 | 术语层不一致 | 需要建立统一术语表：例如 `service health` 固定为 `服务健康`，`queue` 固定为 `队列`，`schema drift` 固定为 `Schema 漂移` 或 `结构漂移`，避免同页多种说法 |

## 根因判断

1. `i18n-store` 已经具备基础中文词条，但页面实现没有强制要求所有展示文案走 `t(...)`
2. 页面层仍存在大量原型期占位文案，尤其是 Dashboard、Artifacts、Graph 两类页
3. `review-item-mapper.ts` 这类 view model 层混入了英文展示语义，导致页面不得不依赖英文字符串继续判断
4. 部分页面把“内部枚举值”“显示文案”“筛选项值”混为一层，修复时容易继续出现中文显示和英文判断耦合的问题

## 修复优先级建议

### P0

- `dashboard-page.tsx`
- `artifacts-page.tsx`
- `trap-graph-page.tsx`
- `skill-graph-page.tsx`

原因：这些页面的英文残留最密集，且都属于用户一进入面板就会看到的主界面。

### P1

- `review-item-mapper.ts`
- `review-queue-page.tsx`
- `review-detail-page.tsx`
- `activity-page.tsx`

原因：这里不只是翻译问题，还涉及显示层和内部枚举值耦合，建议顺手一起收口。

### P2

- `app-shell.tsx`
- icon/title/aria-label 等辅助文本

原因：用户感知弱于主内容区，但收尾时应统一。

## 后续修复建议

1. 先把“展示文案”和“内部枚举值”彻底分离
2. mapper 层只返回稳定枚举或 key，不返回英文显示词
3. 页面层禁止新增裸字符串，统一走 `useI18nStore().t(...)`
4. 为 `packages/web-panel` 增加一个最小静态检查，扫描中文模式下的高频英文残留词，例如 `Pending`、`Running`、`Approved`、`Graph Stats`、`Search graph node`

## 扫描覆盖文件

- `packages/web-panel/src/pages/dashboard/dashboard-page.tsx`
- `packages/web-panel/src/pages/review-queue/review-queue-page.tsx`
- `packages/web-panel/src/pages/review-detail/review-detail-page.tsx`
- `packages/web-panel/src/pages/activity/activity-page.tsx`
- `packages/web-panel/src/pages/artifacts/artifacts-page.tsx`
- `packages/web-panel/src/pages/trap-graph/trap-graph-page.tsx`
- `packages/web-panel/src/pages/skill-graph/skill-graph-page.tsx`
- `packages/web-panel/src/app/shell/app-shell.tsx`
- `packages/web-panel/src/services/mappers/review-item-mapper.ts`
- `packages/web-panel/src/stores/i18n-store.ts`
