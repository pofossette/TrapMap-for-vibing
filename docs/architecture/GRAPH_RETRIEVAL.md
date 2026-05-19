# 图检索系统详解 (GraphRAG-lite)

## 一、概览：两套独立的图系统

项目中存在**两套图系统**，用途完全不同：

| 系统 | 位置 | 规模 | 用途 |
|------|------|------|------|
| **外部代码知识图谱** | `graphify-out/` | 1,876 节点 / 4,734 边 / 108 社区 | 开发时 AI 辅助导航代码库 |
| **内部 GraphRAG-lite 领域图** | 运行时内存 (Graphology) | 按知识条目动态构建 | 应用运行时检索 (trap + skill 关联召回) |

本文重点介绍**内部领域图**——它是 Trap-Map 检索系统的核心。

---

## 二、图结构：节点与边

### 2.1 节点类型 (GraphNodeKind)

定义在 `packages/server/src/lib/indexing/graph-lite/documents.ts`

| Node Kind | ID 模式 | 语义 |
|-----------|---------|------|
| `trap` | `trap:{entryId}` | 工程陷阱/踩坑记录 |
| `skill` | `skill:{artifactId}` | 可操作的知识工件 |
| `cue` | `cue:{pattern}` | 错误症状/警告信号 |
| `tool` | `tool:{name}` | 技术工具 (docker, pg) |
| `environment` | `env:{name}` | 运行环境 |
| `prerequisite` | `prereq:{text}` | 前置条件 |
| `mitigation` | `mit:{text}` | 修复/缓解方案 |
| `boundary-context` | `boundary-context:{label}` | 上下文标签 |
| `boundary-version` | `boundary-version:{pkg}@{v}` | 版本约束 |
| `boundary-platform` | `boundary-platform:{name}` | 平台标识 |

每个节点包含：`id`, `kind`, `label` (人类可读), `evidence` (审计线索)

### 2.2 边类型 (GraphRelationType)

| Relation | 典型模式 | 强度 |
|----------|---------|------|
| `mitigates` | skill -> trap | soft/hard |
| `risk-blocks` | trap -> cue | hard/soft |
| `requires` | trap -> prereq | hard |
| `order` | prereq -> prereq | soft |
| `co-occurs-with` | trap -> tool / env | soft |
| `applies-in` | trap -> boundary-ctx | soft |
| `requires-version` | trap -> boundary-ver | hard |
| `excludes-context` | trap -> boundary-plat | soft |
| `excludes-version` | trap -> boundary-ver | soft |

**边强度 (hard/soft)**：只有 hard 边 (`requires`, `risk-blocks`, `requires-version`) 参与 DAG 环路检测。系统在写入时通过 `graphology-dag` 拒绝引入 hard 依赖环的图状态。

### 2.3 图文档 (GraphIndexDocumentRecord)

每条知识 (trap 或 skill) 生成一份图文档，是持久化单位：

```typescript
{
  id: "graphdoc_trap_{entryId}_r1",
  sourceType: "trap" | "skill",
  sourceId: string,           // 条目 ID 或工件 ID
  revision: number,
  contentHash: string,        // SHA-256 (nodes + edges)
  teamId: string | null,
  scope: "global" | "project",
  requiredLevel: number,      // 安全等级 0-10
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  evidence: string
}
```

文档存储在 `StoreData.graphIndexDocuments[]` 中，按 `{sourceType, sourceId}` upsert，只保留最新 revision。

### 2.4 运行时快照 (GraphRuntimeSnapshot)

查询时，所有图文档被组装为一个 **graphology 有向多重图**，并预计算查找索引：

```typescript
{
  graph: Graph,                          // graphology 有向多重图
  documentsBySourceId: Map,              // sourceId -> 文档
  nodeIdsByNormalizedLabel: Map,        // label -> node IDs
  sourceIdsByNormalizedLabel: Map,      // label -> source IDs
  sourceIdsByNodeId: Map,               // nodeId -> source IDs
  nodeIdsBySourceId: Map                // sourceId -> node IDs
}
```

---

## 三、写入路径：图如何被构建

### 3.1 实体抽取 (LLM 主路径 + 规则 fallback)

**Trap 侧** (`llm-extract.ts` -> `extractGraphEntitiesWithLLM()`):

```
知识条目 (shortcut + detail + labels)
  |
  +-> Phase 1: planExtraction() — 长文本(>2000字符)切分为 segments
  +-> Phase 2: extractSegmentEntities() × N — 并行 LLM 提取 (maxConcurrent=3)
  +-> Gleaning: 二次追问提取遗漏实体
  |
  +-> LLM 输出:
       创建 trap 节点 (来自条目 ID + shortcut)
       识别技术工具 -> tool 节点 (语义理解，不限于关键词列表)
       识别错误/症状 -> cue 节点
       识别运行环境 -> environment 节点
       识别前置条件 -> prerequisite 节点
       识别修复方案 -> mitigation 节点
  |
  +-> LLM 直接输出关系 + hard/soft 强度:
       trap --risk-blocks--> cue         (LLM 判定强度)
       trap --co-occurs-with--> tool     (soft)
       trap --co-occurs-with--> env      (soft)
       trap --requires--> prereq         (LLM 理解否定句)
       mitigation --mitigates--> trap    (LLM 判定修复强制性)
       prereq --order--> prereq          (soft)
  |
  +-> 三层降级: LLM 失败 -> 缓存 -> extractTrapGraphEntities() 规则引擎
```

**Boundary 侧** (`boundary-extract.ts` -> `extractBoundaryGraphEntities()`): 纯代码路径，不变。

**Skill 侧** (`artifact-graph.ts`): 调用同一 `extractGraphEntitiesWithLLM()`，从 `derived.profile` 和 `derived.capsules` 提取（安全约束 D-01/D-02）。

**LLM 提取缓存** (`llm-cache.ts`): `SHA-256(text + promptVersion)` 两层缓存（Phase 1 + Phase 2），promptVersion 递增时触发全量重建。

### 3.2 索引管线

```
知识条目 生命周期变更 (approved/updated/deactivated)
  -> syncKnowledgeIndex(chat?)
    -> fan out 到三个适配器：
       +-- vectorIndexAdapter   (embedding)
       +-- keywordIndexAdapter  (token)
       +-- graphIndexAdapter:
           +-- extractGraphEntitiesWithLLM(chat?, text)  <- LLM 两阶段提取
           |     (三层降级: LLM -> 缓存 -> extractTrapGraphEntities() 规则引擎)
           +-- extractBoundaryGraphEntities()
           +-- buildTrapGraphDocument()
           +-- assertNoHardDependencyCycles()  <- graphology-dag 环路检测
           +-- upsertGraphIndexDocument()      <- 持久化到 StoreData
```

---

## 四、读取路径：图如何参与检索

### 4.1 v1 Graph-Assisted Recall（单跳扩展）

**入口**: `POST /v1/retrieval/search` (mode=graph-assisted)
**文件**: `recall/graph-assisted.ts` + `recall-coordinator.ts`

```
查询文本
  |
  +-- extractGraphEntities() --> 提取查询中的实体标签
  |
  +-- buildGraphRuntimeSnapshot() --> 加载图 -> graphology 有向多重图
  |
  +-- expandSourcesOneHop(runtime, queryLabels)
  |   +-- 找到匹配查询标签的节点
  |   +-- 收集这些节点的一跳邻居对应的所有 sourceId
  |
  +-- 对每个候选 source：
  |   +-- 直接实体匹配 -> base 0.7 + relationStrength * 0.01
  |   +-- 仅关系匹配 -> base 0.3
  |
  +-- 结果与治理过滤后的 eligible entries 取交集 (安全保证)
```

**融合方式**：graph-assisted 模式下，semantic + keyword + graph 三通道并行召回，然后 `mergeCandidatesWithGraph()` 将 graph 分数以 0.2 权重因子加入合并分。

### 4.2 v3 Graph Plan Search（Trap-First Plan）

**入口**: `POST /v3/retrieval/search` 或 `POST /v3/retrieval/plan`
**文件**: `graph-plan-search.ts` + `plan-compiler.ts`

```
查询文本
  |
  +-- parseSeedIntent() --> 提取 situation / problem / goal / tokens / stack hints
  |
  +-- compileTrapFirstPlan():
  |   +-- 过滤治理合规的 trap 候选
  |   +-- rankCapsules() 排序 skill 候选 (<= 3x budget)
  |   +-- 映射候选 ID -> 图节点 ID
  |   +-- buildLocalExpansionView(seedNodeIds, maxDepth=2)
  |   |   +-- BFS 有界子图提取 (graphology-shortest-path)
  |   +-- 查找 blocking traps (含 risk-blocks 边的节点)
  |   +-- 查找 mitigating skills (含 mitigates->blocking traps 的 skill)
  |   +-- skill 预算分配 (mitigating skill 优先 +0.5 boost, 默认预算=3)
  |   +-- 收集 plan edges (risk-blocks / mitigates / requires / order)
  |   +-- 输出 TrapFirstPlan
  |       +-- blockingTraps[]     (按 severity hard 优先)
  |       +-- recommendedSkills[] (含 activation refs)
  |       +-- edges[]             (计划内节点间的边)
  |       +-- citations[]         (降级候选作为支撑证据)
  |       +-- graph: GraphPlan    (统一图视图 + focus 元数据)
  |
  +-- assessGraphPlanReadiness() --> 置信度评分 (0-1)
  |   +-- skill count > 0:  +0.4
  |   +-- trap count > 0:   +0.25
  |   +-- 有结构边:          +0.2
  |   +-- 有支撑证据:        +0.15
  |
  +-- 决策：
       >= 0.65 且有 skill -> 返回 TrapFirstPlan
       否则 -> fallback 到 v2 capsule 或 v1 graph-assisted
```

---

## 五、具体示例

### 5.1 图结构示例

假设有一条 trap 条目："Docker 容器 OOM 导致生产部署失败，需预先设置 memory limit"

构建出的图文档 nodes + edges：

```
nodes:
  [trap:deploy-oom-001]     kind=trap,            label="Docker OOM 导致部署失败"
  [cue:oom]                 kind=cue,             label="OOM"
  [tool:docker]             kind=tool,            label="Docker"
  [env:production]          kind=environment,     label="production"
  [prereq:set-mem-limit]    kind=prerequisite,    label="设置 memory limit"
  [mit:use-memory-limit]    kind=mitigation,      label="使用 --memory 标志"
  [boundary-ctx:deploy]     kind=boundary-context, label="deploy"

edges:
  [trap:deploy-oom-001] --risk-blocks(hard)-->     [cue:oom]
  [trap:deploy-oom-001] --co-occurs-with(soft)-->  [tool:docker]
  [trap:deploy-oom-001] --co-occurs-with(soft)-->  [env:production]
  [trap:deploy-oom-001] --requires(hard)-->        [prereq:set-mem-limit]
  [mit:use-memory-limit] --mitigates(hard)-->      [trap:deploy-oom-001]
  [trap:deploy-oom-001] --applies-in(soft)-->      [boundary-ctx:deploy]
```

### 5.2 查询走查示例

用户查询："Docker 部署 OOM 怎么处理"

**v1 graph-assisted 路径**：

1. 实体提取 -> `{docker, oom, deploy}` -> 匹配 `tool:docker`, `cue:oom`, `boundary-context:deploy`
2. 单跳扩展 -> 从这三个节点出发，找到邻居 `trap:deploy-oom-001` 和 `mit:use-memory-limit`
3. 计分 -> `trap:deploy-oom-001` 有 2 个直接匹配 (docker + oom)，base 0.7 + relationStrength boost
4. 与 semantic/keyword 结果合并，graph 贡献 0.2 权重

**v3 graph-plan 路径**：

1. seed intent 解析 -> situation="Docker 部署", problem="OOM"
2. 候选过滤 -> `trap:deploy-oom-001` 通过治理检查
3. 局部扩展 (depth=2) -> 从 `trap:deploy-oom-001` 展开到所有关联节点
4. 发现 blocking trap: `trap:deploy-oom-001` (有 risk-blocks->cue:oom)
5. 发现 mitigating skill: `mit:use-memory-limit` (有 mitigates->trap)
6. 输出 TrapFirstPlan:
   - `blockingTraps`: [{ "Docker OOM 导致部署失败", severity: hard }]
   - `recommendedSkills`: [{ "使用 --memory 标志", activationRef: ... }]
   - `edges`: [{ risk-blocks: trap->cue }, { mitigates: mit->trap }]

---

## 六、关键配置参数

| 参数 | 值 | 位置 |
|------|-----|------|
| 语义通道权重 | 0.6 | `DEFAULT_SEMANTIC_WEIGHT` in merge.ts |
| 关键词通道权重 | 0.4 | `DEFAULT_KEYWORD_WEIGHT` in merge.ts |
| Graph boost 因子 | 0.2 | `GRAPH_SCORE_BOOST_FACTOR` in recall-coordinator.ts |
| 双通道 boost | +0.15 | `DEFAULT_BOTH_CHANNEL_BOOST` in rerank.ts |
| Token 密度 boost | +0.10 | `DEFAULT_TOKEN_DENSITY_BOOST` in rerank.ts |
| 早停阈值 | 0.3 | recall-coordinator.ts |
| Skill 预算 | 3 | `DEFAULT_SKILL_BUDGET` in plan-compiler.ts |
| 图展开最大深度 | 2 | `DEFAULT_MAX_DEPTH` in plan-compiler.ts |
| 高置信度阈值 | 0.65 | graph-plan-search.ts |
| 中置信度阈值 | 0.4 | graph-plan-search.ts |
| Mitigation 优先 boost | +0.5 | plan-compiler.ts |
| Graph 直接匹配分 | 0.7 | graph-assisted.ts |
| Graph 仅关系匹配分 | 0.3 | graph-assisted.ts |

---

## 七、关键设计特点

1. **LLM 驱动抽取** -- 两阶段 LLM 提取 + gleaning，语义理解替代关键词/正则，规则引擎保留为 fallback
2. **Hard/Soft 边强度** -- LLM 直接输出强度，理解否定句和句级作用域；只有 hard 边参与环路检测
3. **治理安全** -- 图召回结果始终与 eligible entries 取交集，防止越权
4. **置信度感知回退** -- v3 图计划评分不足时自动降级到 v2/v1
5. **有界 BFS 扩展** -- `maxDepth=2` 限制子图大小，避免爆炸式扩展
6. **三通道融合** -- graph 作为 semantic + keyword 之外的补充通道，0.2 权重因子

---

## 八、关键源文件索引

### 图结构与存储

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/indexing/graph-lite/documents.ts` | 节点/边类型定义，图文档结构 |
| `packages/server/src/lib/indexing/graph-lite/graphology.ts` | 图组装、运行时快照、单跳扩展、BFS 子图、环路检测 |
| `packages/server/src/lib/indexing/graph-lite/store.ts` | 图文档 CRUD (upsert, remove, get) |
| `packages/server/src/lib/graph-index/repository.ts` | GraphIndexRepository 接口 + InMemory 实现 |

### 实体抽取

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/indexing/graph-lite/llm-extract.ts` | **LLM 两阶段实体提取** (planExtraction + extractSegmentEntities + gleaning) |
| `packages/server/src/lib/indexing/graph-lite/llm-cache.ts` | **LLM 提取缓存** (contentHash + promptVersion) |
| `packages/server/src/lib/retrieval/graph-extract.ts` | Trap 侧规则抽取 (LLM fallback 时使用) |
| `packages/server/src/lib/indexing/boundary-extract.ts` | Boundary 侧抽取 (context, version, platform) |
| `packages/server/src/lib/indexing/boundary-normalize.ts` | Boundary 节点 ID 构建与值标准化 |
| `packages/contracts/src/domain/graph-extraction.ts` | LLM 提取 Zod schema (节点/边/计划/指标) |
| `packages/server/src/lib/candidates/llm-dedup.ts` | LLM 重复判定 (exact/semantic/none) |
| `packages/server/src/lib/conflict/llm-conflict.ts` | LLM 冲突判定 (contradictory/alternative/superseded/none) |

### 索引适配器

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/indexing/adapters/graph.ts` | Trap 图索引适配器 (生命周期驱动) |
| `packages/server/src/lib/indexing/adapters/artifact-graph.ts` | Skill 图索引适配器 |
| `packages/server/src/lib/indexing/adapters/graph-builders.ts` | 纯函数：抽取结果 -> GraphIndexDocumentRecord |
| `packages/server/src/lib/indexing/pipeline.ts` | 多适配器扇出管线 |

### 检索通道

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/retrieval/recall/graph-assisted.ts` | v1 图辅助召回通道 (单跳扩展 + 计分) |
| `packages/server/src/lib/retrieval/recall-coordinator.ts` | 召回调度 + graph 三通道合并 |
| `packages/server/src/lib/retrieval/channel-registry.ts` | 可插拔召回通道注册 |
| `packages/server/src/lib/retrieval/strategy-registry.ts` | 可插拔检索策略注册 |

### 图计划检索 (v3)

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/retrieval/plan-compiler.ts` | Trap-First Plan 编译器 (BFS 局部展开 + skill 预算) |
| `packages/server/src/lib/retrieval/graph-plan-search.ts` | v3 图计划搜索入口 + 置信度评估 + 降级逻辑 |
| `packages/server/src/lib/retrieval/graph-plan-search.ts` | v3 图计划搜索入口 + 置信度评估 + 降级逻辑 |

### 管线集成

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/retrieval/orchestrator.ts` | 检索编排器 (v1/v2/v3 入口) |
| `packages/server/src/lib/retrieval/merge.ts` | 多通道候选合并 (加权平均) |
| `packages/server/src/lib/retrieval/rerank.ts` | 启发式重排序 (衰减、边界、跨通道 boost) |
| `packages/server/src/lib/retrieval/citations.ts` | 结构化引用构建 |

### 契约层

| 文件 | 职责 |
|------|------|
| `packages/contracts/src/domain/plans.ts` | TrapFirstPlan / GraphPlan Zod schema |
| `packages/contracts/src/domain/retrieval.ts` | v1/v2/v3 检查查询/响应 schema |
| `packages/contracts/src/domain/boundary.ts` | Boundary schema |
| `packages/contracts/src/domain/knowledge.ts` | Knowledge entry schema (trap 节点源) |

### 测试

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/retrieval/__fixtures__/graph-fixtures.ts` | 测试 fixture (Deploy Cluster 数据集, 环路检测数据集) |
| `packages/server/src/lib/retrieval/graph-extract.test.ts` | 实体抽取测试 |
| `packages/server/src/lib/retrieval/graph-plan-search.test.ts` | v3 图计划搜索测试 |
| `packages/server/src/lib/retrieval/recall/graph-assisted.test.ts` | v1 图召回测试 |
| `packages/server/src/lib/retrieval/plan-compiler.test.ts` | Plan 编译器测试 |
| `packages/server/src/lib/indexing/graph-lite/graphology.test.ts` | 图组装与遍历测试 |
| `packages/server/src/lib/indexing/adapters/graph.test.ts` | Trap 图适配器测试 |
| `packages/server/src/lib/indexing/adapters/artifact-graph.test.ts` | Skill 图适配器测试 |

> **LLM 图提取架构详解**见 [`HYBRID_GRAPH_EXTRACTION.md`](HYBRID_GRAPH_EXTRACTION.md)。
