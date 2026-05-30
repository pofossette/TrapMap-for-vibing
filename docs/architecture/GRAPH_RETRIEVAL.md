# 图检索系统详解 (GraphRAG-lite)

## 一、概览：图系统

项目中存在**图系统**：

| 系统 | 位置 | 规模 | 用途 |
|------|------|------|------|
| **GraphRAG-lite 领域图** | 运行时内存 (Graphology) | 按知识条目动态构建 | 应用运行时检索 (trap + skill 关联召回) |

本文重点介绍**领域图**——它是 Trap-Map 检索系统的核心。

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

每个节点包含：`id`, `kind`, `label` (人类可读), `evidence` (审计线索)。Trap 节点额外包含预计算字段 `severity`（`'hard'` | `'soft'`），由入库时的 `risk-blocks` 边强度决定。Skill/Mitigation 节点额外包含预计算字段 `mitigates`（`string[]`），列出其缓解的所有 trap nodeId。

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
  nodeIdsBySourceId: Map,               // sourceId -> node IDs
  mitigatingSkillNodeIdsByTrapNodeId: Map  // trapNodeId -> Set<skillNodeId>（mitigates 反向索引）
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
           |      (预计算 trap severity: hard risk-blocks 边 -> 'hard', 否则 -> 'soft')
           |      (预计算 skill mitigation 关联: mitigates 边 -> mitigates[] 字段)
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

### 4.2 v2 Capsule Graph Channel（capsule-graph 通道在 v2 管线中的角色）

**入口**: `POST /v2/retrieval/search` (v2 capsule-native)
**文件**: `capsules/channels/graph.ts` + `capsules/scoring/rerank.ts`

在 v2 多路召回架构中，`capsule-graph` 通道作为补充召回源参与胶囊检索：

```
查询文本
  |
  +-- extractQueryEntityLabels() --> 从 seed 提取工具/实体关键词
  |
  +-- buildGraphRuntimeSnapshot() --> 加载 skill 类型图文档
  |
  +-- expandSourcesOneHop(runtime, queryEntities) --> one-hop 实体展开
  |
  +-- artifact-to-capsule 映射 --> 展开得到的 artifact ID 与治理过滤后的 artifacts 交集
  |
  +-- calculateCapsuleGraphScore(relationStrength) --> base 0.85 + relationStrength 加成
  |
  +-- 输出 CapsuleRecallCandidate[] (channel='capsule-graph', graphEvidence=[...])
```

**graph 证据在 rerank 中的参与方式 (Phase 2 v2 blend)**：

graph 通道分数通过以下路径影响最终排名：

1. **preRerankScore (RRF)**: graph 通道排名贡献 RRF 分数，进入 merge 层的 `preRerankScore`
2. **graphBoost**: rerank 层从 `mc.channelScores['capsule-graph']` 读取 graph 通道分数，乘以 0.1 权重加入 `blendedScore`
3. **channelConsensusBoost**: graph 通道作为额外通道增加通道计数，提升 `channelConsensusBoost`（每通道 +0.04，上限 0.12）
4. **reason 标注**: 当 `graphBoost > 0.02` 时，reason 字符串包含 `graph evidence` 标注

```
blendedScore = baseScore × 0.65
             + preRerankScore × 0.20
             + semanticBoost (capsule-semantic score × 0.2)
             + graphBoost (capsule-graph score × 0.1)
             + channelConsensusBoost (min(channels.length × 0.04, 0.12))
```

**设计约束**: graph 通道是召回补充，不是排名权威。graph 分数与其他通道平等进入 merge 层，rerank 层的 intent-aware 特征（problem/situation/goal）仍占 65% 权重。graph 通道的最大贡献为 `0.85 × 0.1 = 0.085` (graphBoost) + `0.04` (consensus) = `0.125`，不足以单独决定排名。

### 4.3 v3 Graph Plan Search（Trap-First Plan）

**入口**: `POST /v3/retrieval/search` 或 `POST /v3/retrieval/plan`
**文件**: `graph-plan-search.ts` + `plan-compiler.ts` + `trap-ranking.ts`

```
查询文本
  |
  +-- parseSeedIntentWithLLM() --> 提取 situation / problem / goal / tokens / stack hints
  |                                (+ LLM 扩展: category / semanticQuery / parseMethod)
  |                                (失败时自动降级到 regex baseline)
  |
  +-- compileTrapFirstPlan():
  |   +-- 过滤治理合规的 trap 候选
  |   +-- rankTrapCandidates() 对 trap 候选按查询相关性评分
  |   |   +-- 使用 intent 特征 (problem/situation/goal/keyword/stackPath) 评分
  |   |   +-- 过滤 score >= 0.18 且取 top 8
  |   +-- rankCapsules() 排序 skill 候选 (<= 3x budget)
  |   +-- buildGraphRuntimeSnapshot() 构建全局运行时快照 + 反向索引
  |   +-- 映射查询相关 trap + skill 候选 ID -> 图节点 ID（snapshot 索引 O(1) 查找）
  |   +-- buildLocalExpansionView(seedNodeIds, maxDepth=2)
  |   |   +-- BFS 有界子图提取 (graphology-shortest-path)
  |   +-- 查找 blocking traps (含 risk-blocks 边的节点，优先读取 node.severity)
  |   +-- 查找 mitigating skills (snapshot 反向索引 O(1) 查找，替代全图遍历)
  |   +-- skill 预算分配 (mitigating skill 优先 +0.5 boost, 默认预算=3)
  |   +-- 收集 plan edges (risk-blocks / mitigates / requires / order)
  |   +-- 输出 TrapFirstPlan
  |       +-- blockingTraps[]     (按 severity hard 优先)
  |       +-- recommendedSkills[] (含 activation refs)
  |       +-- edges[]             (计划内节点间的边)
   |       +-- citations[]         (降级候选作为支撑证据)
   |       +-- executionPlan[]   (拓扑排序后的执行序列)
   |           +-- rank: 拓扑层级 (0=无前置，同层可并行)
   |           +-- nodeId: 关联的 trap 或 skill 节点 ID
   |           +-- label: 人类可读标签
   |           +-- kind: 'trap-mitigation' | 'skill'
   |           +-- blockedBy: 前置节点 ID 列表
   |       +-- graph: GraphPlan    (统一图视图 + focus 元数据)
  |
  +-- assessGraphPlanReadiness() --> 置信度评分 (0-1)
  |   +-- skill count > 0:  +0.4
  |   +-- trap count > 0:   +0.25
  |   +-- trap-skill 结构连接 (mitigates/requires): +0.2
  |   +-- 有支撑证据:        +0.15
  |   +-- 无 trap-skill 连接时 bucket 降级为 medium
  |
  +-- 决策：
       >= 0.65 且有 skill 且有 trap-skill 结构 -> 返回 TrapFirstPlan
       否则 -> fallback 到 v2 capsule 或 v1 graph-assisted
```

#### 4.3.1 Trap Seed 排名 (Query-Aware)

**文件**: `trap-ranking.ts`

v3 图计划不再将所有治理合规的 trap 作为种子节点。`rankTrapCandidates()` 使用与 capsule 评分相同的特征管线对 trap 候选评分：

- **problemScore (30%)**: intent.problem + intent.errorText 与 entry.shortcut + entry.detail 的文本相似度
- **situationScore (21%)**: intent.situation 与 entry 文本的相似度
- **goalScore (17%)**: intent.goal 与 entry 文本的相似度
- **keywordScore (17%)**: intent.tokens 与 entry 文本的关键词重叠率
- **normalizedScore (15%)**: intent.normalized 与 entry 文本的相似度
- **stackPathBoost**: 匹配 stack/path hints 时最高 1.5x 加成

过滤条件：`score >= 0.18` 且取 top 8。确保只有查询相关的 trap 参与图扩展，避免无关节点污染计划。

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
7. **拓扑排序执行计划** -- `executionPlan` 字段基于 `mitigates`/`requires`/`order` 边进行 Kahn 拓扑排序，客户端无需自行计算执行顺序。边方向约定为 "source 先于 target"：`mitigates`(skill→trap) 表示 skill 应在 trap 之前执行，`requires`(A→B) 表示 A 应在 B 之前执行，`order`(A→B) 表示 A 应在 B 之前执行。环路节点追加到末尾。

---

## 八、缓存策略

系统使用统一的 `RetrievalCache<V>` 泛型类（LRU + TTL 内存缓存）管理各类热数据，通过 namespace 隔离不同缓存实例并聚合 metrics。

### 8.1 缓存实例一览

| 缓存名称 | namespace | maxSize | TTL | 用途 |
|----------|-----------|---------|-----|------|
| IntentCache | `intent` | 200 | 30 min | LLM 意图解析结果（ParsedIntent） |
| Graph State Cache | `graph-state` | 500 | 1 h | 图索引适配器的同步状态（LegacyGraphSyncState） |
| Graph Docs Cache | `graph-docs` | 500 | 1 h | 图文档记录（GraphIndexDocumentRecord） |
| LLM Phase1 Cache | `llm-phase1` | 300 | 1 h | LLM 两阶段提取的 Phase 1 计划（ExtractionPlan） |
| LLM Phase2 Cache | `llm-phase2` | 300 | 1 h | LLM 两阶段提取的 Phase 2 结果（LlmExtractionResult） |

### 8.2 缓存行为

- **LRU 淘汰**：基于 `Map` 插入序，get 时 delete+re-insert 提升到最近使用位置；满容量时淘汰最旧条目。
- **惰性 TTL**：get() 时检查 `Date.now() - createdAt > ttlMs`，过期条目惰性删除，无后台定时器。
- **Metrics 聚合**：所有实例通过 `WeakRef` 注册到模块级 `liveCaches` 集合，调用 `getRetrievalCacheStats()` 按 namespace 汇总 hits/misses/evictions/size/hitRate。

### 8.3 关键源文件

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/cache/retrieval-cache.ts` | `RetrievalCache<V>` 核心实现 + `getRetrievalCacheStats()` |
| `packages/server/src/lib/cache/metrics.ts` | metrics 入口（re-export） |
| `packages/server/src/lib/retrieval/capsules/intent-cache.ts` | IntentCache (`intent` namespace) |
| `packages/server/src/lib/indexing/adapters/graph.ts` | Graph State / Docs Cache (`graph-state`, `graph-docs`) |
| `packages/server/src/lib/indexing/graph-lite/llm-cache.ts` | LLM Extraction Cache (`llm-phase1`, `llm-phase2`) |

> **详细设计**见 [`CACHING.md`](CACHING.md)。

---

## 九、关键源文件索引

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
| `packages/server/src/lib/retrieval/recall/graph-extract.ts` | Trap 侧规则抽取 (LLM fallback 时使用) |
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
| `packages/server/src/lib/retrieval/orchestration/recall-coordinator.ts` | 召回调度 + graph 三通道合并 |
| `packages/server/src/lib/retrieval/orchestration/channel-registry.ts` | 可插拔召回通道注册 |
| `packages/server/src/lib/retrieval/orchestration/strategy-registry.ts` | 可插拔检索策略注册 |

### 图计划检索 (v3)

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts` | Trap-First Plan 编译器 (BFS 局部展开 + skill 预算 + 拓扑执行计划) |
| `packages/server/src/lib/retrieval/graph-plan/graph-plan-search.ts` | v3 图计划搜索入口 + 置信度评估 + 降级逻辑 |

### 管线集成

| 文件 | 职责 |
|------|------|
| `packages/server/src/lib/retrieval/orchestration/orchestrator.ts` | 检索编排器 (v1/v2/v3 入口) |
| `packages/server/src/lib/retrieval/capsules/scoring/merge.ts` | 多通道候选合并 (加权平均) |
| `packages/server/src/lib/retrieval/capsules/scoring/rerank.ts` | 启发式重排序 (衰减、边界、跨通道 boost) |
| `packages/server/src/lib/retrieval/response/citations.ts` | 结构化引用构建 |

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
| `packages/server/src/lib/retrieval/recall/graph-extract.test.ts` | 实体抽取测试 |
| `packages/server/src/lib/retrieval/graph-plan/graph-plan-search.test.ts` | v3 图计划搜索测试 |
| `packages/server/src/lib/retrieval/recall/graph-assisted.test.ts` | v1 图召回测试 |
| `packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts` | Plan 编译器测试 |
| `packages/server/src/lib/indexing/graph-lite/graphology.test.ts` | 图组装与遍历测试 |
| `packages/server/src/lib/indexing/adapters/graph.test.ts` | Trap 图适配器测试 |
| `packages/server/src/lib/indexing/adapters/artifact-graph.test.ts` | Skill 图适配器测试 |

> **LLM 图提取架构详解**见 [`HYBRID_GRAPH_EXTRACTION.md`](HYBRID_GRAPH_EXTRACTION.md)。
