# TrapMap WebUI 按页面划分需求文档

## 1. 文档目的

本文档用于定义 TrapMap WebUI 的页面结构、每个页面承载的业务目标、模块组成、交互功能和展示数据，供产品、设计和前端实现统一使用。

本版文档按“页面”而不是按“功能域”组织，便于直接做信息架构、线框图和平面设计。

## 2. 产品定位

`@trapmap/web-panel` 是 TrapMap 的内部管理与调试控制台，主要服务以下场景：

- 平台运行态观察
- 审核与人工干预
- trap / skill 工件检查
- trap 图与 skill graph 结构调试

它不是通用内容创作前台，也不是面对公众的展示站点。

## 3. 目标用户

- 平台管理员
- 治理审核者
- 事故处理者
- 检索 / 索引调试者
- Skill 作者或维护者

## 4. 全局导航结构

一级页面建议固定为：

- 首页数据展板
- 审核队列页
- 审核详情页
- 工件总览页
- Trap 图谱页
- Skill 图谱页
- 活动审计页

全局壳层必须提供：

- 顶部导航
- 左侧主导航
- 当前环境与 deployment profile 展示
- 当前登录用户信息
- 全局健康状态指示器
- 全局搜索入口

## 5. 页面一：首页数据展板

### 5.1 页面定位

首页是 WebUI 首屏，承担“总览入口”的职责。用户打开系统后，首先看到平台当前状态、图谱预览、库内数据规模和待处理事项。

### 5.2 页面目标

- 一眼看到系统是否健康
- 一眼看到当前治理工作量
- 一眼看到知识库 / 工件库 / 图谱库的大致规模
- 一眼看到 trap 图与 skill 图的预览概况
- 快速跳转到后续具体页面

### 5.3 页面模块

首页建议至少包含以下模块：

- 顶部状态摘要区
- 系统健康卡片区
- 数据规模展板区
- 图谱预览区
- 待处理事项区
- 最近异常 / 告警区
- 快捷入口区

### 5.4 顶部状态摘要区

应展示：

- deployment profile
- 版本号 / build 标识
- 最近一次健康检查时间
- 当前运行模式摘要
- 当前登录用户

### 5.5 系统健康卡片区

应展示：

- readiness 状态
- liveness 状态
- degraded dependencies 数量
- failed jobs 数量
- capsule index health
- graph backend 状态

卡片交互要求：

- 点击卡片可跳转到对应详情页或带过滤条件的列表页
- 异常卡片使用更强视觉层级

### 5.6 数据规模展板区

应展示库内核心数据规模：

- trap 总数
- skill artifact 总数
- capsule 总数
- graph document 总数
- 待审核项数量
- 近 24 小时新增 / 更新数量

如果后端支持，还应展示趋势信息：

- 今日新增
- 本周新增
- 本周审核完成数

### 5.7 图谱预览区

这是首页重点模块之一，必须展示两个预览块：

- Trap 图预览
- Skill 图预览

每个预览块建议展示：

- 缩略图式小型关系预览
- 当前节点数 / 边数
- 当前可见图源数
- 最近更新的 graph document 信息

交互要求：

- 点击预览块进入对应图谱页
- 点击“查看详情”进入聚焦视图
- 预览图为只读轻交互，不承载复杂操作

### 5.8 待处理事项区

应展示：

- pending review 数量
- 高风险待处理项
- 长时间未处理项
- candidate ingestion backlog

应支持：

- 点击跳转到审核队列页
- 按风险或等待时长快速过滤

### 5.9 最近异常 / 告警区

应展示：

- 最近 warnings
- 最近 incidents
- 最近失败任务
- 图索引或 capsule index 异常摘要

### 5.10 快捷入口区

应至少包含：

- 进入审核队列
- 进入工件总览
- 进入 Trap 图谱
- 进入 Skill 图谱
- 进入活动审计

## 6. 页面二：审核队列页

### 6.1 页面定位

审核队列页是治理审核的主列表页，用于承接所有待人工处理的审核项。

### 6.2 页面目标

- 快速扫描当前待处理工作
- 用过滤和排序缩小处理范围
- 从列表进入审核详情

### 6.3 页面模块

- 顶部统计条
- 过滤栏
- 搜索栏
- 排序控件
- 队列表格或卡片列表
- 分页或增量加载区

### 6.4 展示内容

每条队列项应展示：

- title 或 identifier
- source type
- current status
- created time
- risk markers
- assignment state

### 6.5 交互要求

- 按 status、source、risk level、created time、assignee 过滤
- 按 newest、oldest、highest risk、longest waiting 排序
- 支持关键字搜索
- 点击进入审核详情页

## 7. 页面三：审核详情页

### 7.1 页面定位

审核详情页是单条治理项的工作台，负责承载人工决策与人工修复。

### 7.2 页面目标

- 阅读完整上下文
- 理解机器分析结果
- 做 approve / reject / return for correction
- 必要时进行 JSON 修复

### 7.3 页面模块

- 头部摘要区
- metadata summary 区
- warnings 区
- related trap / skill references 区
- 操作面板
- JSON 编辑面板
- 活动时间线

### 7.4 交互要求

必须支持：

- approve
- reject
- return for correction
- save draft decision
- reassign

其中：

- `reject` 和 `return for correction` 必须填写理由
- 所有敏感动作必须二次确认

### 7.5 JSON 编辑面板要求

必须支持：

- 加载当前 payload
- JSON 语法校验
- format
- reset
- copy
- apply
- invalid JSON 禁止保存
- 保存修改时填写 edit rationale
- 离开页面前提示 unsaved changes

## 8. 页面四：工件总览页

### 8.1 页面定位

工件总览页是 skill artifact 与可读 trap 记录的统一查询入口，承担“从实体进入图谱与派生结果”的角色。

### 8.2 页面目标

- 查看库中有哪些工件
- 按条件过滤工件
- 查看单个工件的派生摘要
- 从工件跳转到 Skill Graph 或 Trap Graph

### 8.3 页面模块

- 顶部统计区
- 搜索栏
- 过滤器区
- 列表区
- 详情侧栏或详情子页入口

### 8.4 过滤条件

建议支持：

- artifact / entry type
- lifecycle state
- scope
- required level
- revision
- labels

### 8.5 列表项展示

每条记录应展示：

- artifact ID 或 entry ID
- title
- type
- lifecycle state
- scope
- required level
- revision
- 更新时间

### 8.6 工件详情内容

必须展示：

- base info
- derivation summary
- graph summary
- governance metadata
- audit summary
- 跳转到图谱页的快捷入口

## 9. 页面五：Trap 图谱页

### 9.1 页面定位

Trap 图谱页用于可视化查看 trap graph 结构，帮助调试 trap 与 cue、tool、environment、prerequisite、mitigation、boundary 信息之间的关系。

### 9.2 页面目标

- 查看全局 trap graph 概览
- 查看单个 trap 的局部子图
- 通过视觉方式理解 graph document 结构

### 9.3 页面布局

采用三栏布局：

- 左栏：过滤器、图层控制、显示开关
- 中栏：G6 图谱画布
- 右栏：Inspector

顶部工具栏必须包含：

- 搜索框
- 布局切换
- 刷新
- Fit View
- Minimap 开关
- 关系过滤
- 导出操作

### 9.4 节点类型

必须支持：

- `trap`
- `cue`
- `tool`
- `environment`
- `prerequisite`
- `mitigation`
- `boundary-context`
- `boundary-version`
- `boundary-platform`

### 9.5 边类型

必须支持：

- `risk-blocks`
- `co-occurs-with`
- `requires`
- `mitigates`
- `order`
- `applies-in`
- `requires-version`
- `excludes-context`
- `excludes-version`

### 9.6 页面功能

必须支持：

- 全局 trap graph 概览
- source-focused subgraph
- 仅显示 hard edges
- neighborhood depth 切换：
  - selected node only
  - one-hop
  - two-hop
  - connected component
- 图统计信息展示：
  - node count
  - edge count
  - hard edge count
  - source count

### 9.7 Inspector 内容

选中 trap 节点时展示：

- entry ID / source ID
- label / title
- severity
- revision
- scope
- required level
- graph document ID
- evidence / extraction clues
- related cue nodes
- related mitigation nodes
- 相关 skill nodes

选中边时展示：

- source node
- target node
- relation type
- relation strength
- evidence
- source document ID

## 10. 页面六：Skill 图谱页

### 10.1 页面定位

Skill 图谱页用于展示 skill artifact 的结构化派生关系，以及 skill 在图索引中的语义关系。

### 10.2 页面目标

- 查看 skill artifact 的 derivation 结果
- 查看 capsules 与 sourcePaths 的关系
- 查看 skill 对 cue、tool、environment、prerequisite、mitigation 的图语义映射
- 点击查看 skill 派生物信息

### 10.3 页面布局

采用三栏布局：

- 左栏：artifact selector、过滤器、视图模式切换
- 中栏：G6 图谱画布
- 右栏：Inspector

顶部工具栏必须包含：

- 搜索框
- derivation / semantic mode switch
- 布局切换
- 刷新
- Fit View
- Minimap 开关
- 导出操作

### 10.4 视图模式

必须支持两种模式：

- Derivation View
- Semantic Graph View

#### Derivation View 节点

- `artifact`
- `profile`
- `capsule`
- `reference`
- `asset`
- `script`
- `manifest`

#### Semantic Graph View 节点

- `skill`
- `capsule`
- `cue`
- `tool`
- `environment`
- `prerequisite`
- `mitigation`

### 10.5 页面功能

必须支持：

- 从工件总览页跳转进入
- 通过 artifact ID 直接打开
- 在 derivation / semantic 模式之间切换
- 聚焦单个 capsule
- 聚焦某一 revision 的全部节点
- 展示图统计信息：
  - capsule count
  - reference count
  - asset count
  - script count
  - graph node count
  - graph edge count

## 11. 页面六右侧：Skill 派生物 Inspector

Skill 图谱页右侧 Inspector 是该页面核心功能，必须支持点击不同节点后显示对应派生信息。

### 11.1 点击 artifact 节点时

展示：

- artifact ID
- revision
- title
- description
- submitted time
- submitted by
- lifecycle state
- scope
- required level
- source hash
- derived-at timestamp
- capsule count
- reference path summary

### 11.2 点击 profile 节点时

展示：

- title
- summary
- keywords
- labels
- prerequisites
- reference paths
- content hash

### 11.3 点击 capsule 节点时

展示：

- capsule ID
- artifact ID
- revision
- source paths
- situation
- problem
- goal
- content
- error text
- contextual prefix
- labels
- scope
- required level

### 11.4 点击 manifest 节点时

展示：

- references list
- assets list
- scripts list
- source hash

### 11.5 点击 reference 节点时

展示：

- path
- media type
- size bytes
- sha256
- 是否参与 derivation

### 11.6 点击 asset 节点时

展示：

- path
- media type
- size bytes
- sha256
- activation-only 状态

### 11.7 点击 script 节点时

展示：

- path
- capability
- args schema summary
- side effect summary
- default policy
- 是否 activation-only

## 12. 页面七：活动审计页

### 12.1 页面定位

活动审计页用于查看管理员、审核者和操作员在系统中产生的关键操作记录。

### 12.2 页面目标

- 回溯人工治理动作
- 支持问题排查
- 支持审计和复盘

### 12.3 页面模块

- 顶部过滤区
- 时间范围选择区
- 审计列表区
- 详情查看区

### 12.4 过滤条件

必须支持：

- actor
- action type
- time range

### 12.5 展示内容

每条记录应展示：

- actor
- action type
- target record
- timestamp
- reason / note（如有）

并支持跳回相关页面。

## 13. 全局图交互规范

Trap 图谱页和 Skill 图谱页统一遵循以下交互规范。

### 13.1 图形库

统一使用 `G6`。

交互基线采用：

- `https://g6.antv.antgroup.com/examples/layout/force-directed/#drag-fixed`

### 13.2 必需交互

- 平移与缩放
- 节点拖拽
- 拖拽后固定节点位置
- 单节点取消固定
- 全部取消固定
- 点击选中
- hover 高亮一跳邻居
- 点击边查看详情
- fit-to-view
- reset layout
- minimap

### 13.3 过滤要求

必须支持：

- node type filter
- edge type filter
- scope filter
- required level filter
- revision filter
- hide isolated nodes
- 仅显示当前 focus neighborhood

### 13.4 搜索要求

必须支持搜索：

- artifact ID
- capsule ID
- trap entry ID
- graph document ID
- node label
- labels / keywords

搜索后必须：

- 自动定位命中节点
- 高亮命中项
- 支持逐个切换多个结果

## 14. 全局视觉与交互设计要求

- 节点类型必须通过视觉可区分
- hard / soft edges 必须有明显区分
- 选中路径必须明显高亮
- 无关节点默认降噪，不直接消失
- 长文本在 Inspector 中必须支持复制、折叠和展开
- 画布中的长标签可截断，但详情中必须完整展示
- 被固定的节点必须有清晰的 pin 状态

## 15. 权限与安全要求

- 面板必须要求认证访问
- 必须支持基于角色的显示控制：
  - administrator
  - reviewer
  - read-only operator
- 敏感操作必须二次确认
- 无权限时必须展示明确反馈

## 16. 状态管理建议

建议按页面和子域拆分 store：

- session state
- home dashboard state
- review queue state
- review detail state
- artifact list/detail state
- trap graph state
- skill graph state
- graph inspector UI state
- activity state
- transient UI state

## 17. API 接入要求

前端应通过明确的 service interfaces 获取数据，不应在组件中直接堆叠原始请求逻辑。

推荐 API 能力包括：

- 首页总览数据接口
- 首页图谱预览数据接口
- review queue 列表接口
- review detail 接口
- artifact list / detail 接口
- trap subgraph 接口
- skill derivation graph 接口
- skill semantic graph 接口
- node detail 接口
- activity list 接口

## 18. 空态、错误态与性能要求

每个页面都必须定义：

- empty state
- loading state
- recoverable error state
- permission-denied state

图谱页性能要求：

- 大图先给概览，再逐步细化
- 画布更新时 Inspector 仍可操作
- 过滤应尽量局部生效，而不是整页刷新
- 如果 force layout 对大图不稳定，必须提供 degraded-mode 提示和局部视图替代方案

## 19. 交付优先级

### Phase 1

- 首页数据展板
- 审核队列页
- 审核详情页
- 工件总览页
- Trap 图谱页
- Skill 图谱页
- 活动审计页

### Phase 2

- revision diff
- graph compare workflows
- 用户本地 layout presets
- 更丰富的 evidence overlays
- side-by-side compare

## 20. 验收标准

- 首屏能清楚展示系统健康状态、库内数据规模和图谱预览
- 审核者能从列表进入详情并完成治理动作
- 操作者能在详情页安全修复 JSON
- 用户能从工件总览页进入 Trap 图谱和 Skill 图谱
- Trap 图谱页能查看 graph 结构、过滤子图并检查节点和边
- Skill 图谱页能查看 derivation 和 semantic 两种视图
- 用户点击 skill 相关节点时，能看到完整派生物信息
- 图谱交互行为符合 G6 `drag-fixed` 力导向交互预期
