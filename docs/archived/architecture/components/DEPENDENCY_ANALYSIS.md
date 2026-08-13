# 依赖使用分析：LangChain & Graphology

## 概述

本文档追踪 TrapMap 项目对 `@langchain/*` 和 `graphology-*` 两组外部依赖的具体使用情况，包括哪些模块引入了哪些 API、解决什么问题、以及模块间的调用关系。供开发和架构审查参考。

---

## 一、依赖声明

均声明在 `packages/server（Wave-10 已删除）/package.json`：

| 包名 | 版本 | 角色 |
|------|------|------|
| `@langchain/core` | ^1.1.39 | 核心抽象：Document、Runnable、Messages |
| `@langchain/openai` | ^1.4.4 | OpenAI 兼容 Chat / Embeddings 实现 |
| `graphology` | ^0.26.0 | 有向多重图核心数据结构 |
| `graphology-dag` | ^0.4.1 | DAG 环检测 |
| `graphology-operators` | ^1.6.1 | 子图提取 |
| `graphology-shortest-path` | ^2.1.0 | BFS 最短路径 |

锁文件 `pnpm-lock.yaml` 额外引入传递依赖：`graphology-types@0.24.8`、`graphology-utils@2.5.2`、`graphology-indices@0.17.0`。

---

## 二、LangChain 使用详情

### 2.1 源文件总览

```
packages/server（Wave-10 已删除）/src/lib/
├── ai/
│   ├── providers.ts           # 主要集成点（懒加载）
│   └── types.ts               # ChatProvider / EmbeddingsProvider 接口
├── embeddings.ts              # 遗留 embeddings 模块（同步 require）
└── pre-review.ts              # 预审链（Document + RunnableLambda）
```

### 2.2 `ai/providers.ts` — AI 提供者抽象层

**职责**：提供 provider-agnostic 的 Chat 和 Embeddings 接口，支持 OpenAI / Azure / Ollama 等任意 OpenAI 兼容端点。

**所有 import 均为动态懒加载**（`await import()`），仅在非 fallback provider 实际需要时才加载 langchain：

| 行号 | 引入 | 来源包 | 用途 |
|------|------|--------|------|
| :33 | `OpenAIEmbeddings` | `@langchain/openai` | `OpenAICompatibleEmbeddings.ensureImpl()` 中创建 embeddings 实例 |
| :182 | `ChatOpenAI` | `@langchain/openai` | `OpenAICompatibleChat.ensureImpl()` 中创建 chat 实例 |
| :196 | `HumanMessage`, `SystemMessage` | `@langchain/core/messages` | `OpenAICompatibleChat.invoke()` 中构造消息 |

**类设计**：

- `OpenAICompatibleEmbeddings`（:19-49）— 封装 `OpenAIEmbeddings`，`embed()` 调用 `impl.embedQuery(text)` 生成向量
- `OpenAICompatibleChat`（:168-211）— 封装 `ChatOpenAI`，`invoke()` 构造 `SystemMessage` + `HumanMessage` 并调用 `impl.invoke([...])`
- `createAiProviders()` 工厂（:236）根据 `AiProviderConfig` 选择实现，无 key 时回退 `FallbackEmbeddings`

### 2.3 `embeddings.ts` — 遗留 Embeddings 模块

**职责**：旧版 embeddings API，仅支持直接 OpenAI（`OPENAI_API_KEY`）。

| 行号 | 引入方式 | 来源包 | 用途 |
|------|----------|--------|------|
| :118 | `require()` 同步加载 | `@langchain/openai` | `OpenAIEmbeddings` 类构造函数中实例化 |

**注意**：此模块为遗留代码，新功能应使用 `ai/providers.ts` 的抽象层。该模块还包含 `FallbackEmbeddings`（:35-100），在无 API key 时用确定性哈希生成伪向量，供本地/CI 环境使用。

### 2.4 `pre-review.ts` — 预审流水线

**职责**：知识提交入库前的预审，包括重复检测、边界提取、风险评分。

| 行号 | 引入 | 来源包 | 用途 |
|------|------|--------|------|
| :1 | `Document` | `@langchain/core/documents` | 将提交文本和已有知识包装为 Document 对象，用于 token 重叠分析（:159, :171） |
| :2 | `RunnableLambda` | `@langchain/core/runnables` | 将整个预审逻辑包装为 langchain chain（`preReviewChain`），统一 `invoke()` 接口（:157, :274） |

**注意**：此链是单体异步函数，内部并行执行 token-based 重复检测、可选 LLM 边界提取、风险评分，并非 langchain 的典型多步 chain 模式。

### 2.5 LangChain 消费关系图

```
                        caller code
                            │
               runPreReview() / generateEmbedding()
                            │
              ┌─────────────┴─────────────┐
              │                           │
     pre-review.ts               embeddings.ts (遗留)
     (Document, RunnableLambda)   (OpenAIEmbeddings — require)
              │                           │
              │                    ┌──────┴──────┐
              │                    │             │
              └──────────▶  providers.ts (新层)
                         (OpenAICompatibleEmbeddings, OpenAICompatibleChat)
                              │                    │
                    @langchain/openai        @langchain/core
                    (OpenAIEmbeddings,       (Document, RunnableLambda,
                     ChatOpenAI)              HumanMessage, SystemMessage)
```

---

## 三、Graphology 使用详情

### 3.1 源文件总览

```
packages/server（Wave-10 已删除）/src/lib/indexing/
├── graph-lite/
│   └── graphology.ts          # 唯一直接引用 graphology npm 的文件（网关）
├── adapters/
│   ├── graph.ts               # trap 侧图适配器 → assertNoHardDependencyCycles
│   └── artifact-graph.ts      # skill 侧图适配器 → assertNoHardDependencyCycles
├── skill-events.ts            # skill 事件扇出 → assertNoHardDependencyCycles
└── reconcile.ts               # 图索引重建 → assertNoHardDependencyCycles

packages/server（Wave-10 已删除）/src/lib/retrieval/
├── recall/graph-assisted.ts   # 关系增强召回 → 展开 + 打分
└── graph-plan/plan-compiler.ts # trap-first 计划编译 → 局部展开 + 子图
```

### 3.2 `graph-lite/graphology.ts` — 单网关模块（~450 行）

**职责**：所有 graphology npm API 的**唯一直接调用点**，外部模块不直接 import graphology 包。

**import 声明**（:9-12）：

```typescript
import Graphology from 'graphology';
import { hasCycle } from 'graphology-dag';
import { subgraph } from 'graphology-operators';
import { singleSourceLength } from 'graphology-shortest-path';
```

**导出函数及 graphology API 用法**：

| 函数 | 行号 | 解决什么问题 | 使用的 graphology API |
|------|------|-------------|---------------------|
| `buildGraphFromDocuments` | :76-95 | 从 `GraphIndexDocumentRecord[]` 组装有向多重图 | `GraphCtor({type:'directed',multi:true})`、`mergeNode`、`mergeEdgeWithKey` |
| `buildGraphRuntimeSnapshot` | :114-161 | 构建运行时快照 + 5 组 O(1) 索引映射 | 内部调用 `buildGraphFromDocuments` |
| `expandSourcesOneHop` | :163-189 | 查询标签一跳展开，收集候选 source ID | `graph.neighbors(nodeId)` |
| `calculateSourceRelationStrength` | :191-242 | 按硬/软边强度给候选 source 打分 | `graph.hasNode()`、`graph.edges()`、`graph.extremities()`、`graph.getEdgeAttributes()` |
| `projectHardDependencyGraph` | :268-285 | 投影出仅含硬依赖边的 DAG 子图 | `GraphCtor`、`mergeNode`、`mergeEdgeWithKey` |
| `assertNoHardDependencyCycles` | :297-302 | 检测硬依赖环，写入路径安全门 | `hasCycle(graph)` from `graphology-dag` |
| `buildLocalExpansionView` | :330-356 | 有界多跳局部展开（种子节点 maxDepth 范围内） | `singleSourceLength(graph, seedId)` from `graphology-shortest-path`、`subgraph(graph, nodeIds)` from `graphology-operators` |
| `findEntriesByContext` | :369-375 | 按 context 标签查找 source entry | 快照索引映射 |
| `findEntriesByPackage` | :384-401 | 按 package 约束查找 source entry | 快照索引映射 |
| `findEntriesByBoundaryConstraints` | :411-449 | 上下文 + 包约束的 AND 交集查询 | 委托给上两个函数 |

**导出类型**：`Graph`（:27-58，图 facade 接口）、`GraphRuntimeSnapshot`（:105-112）、`LocalExpansionParams`（:311-318）。

### 3.3 写入路径 — 环检测（4 个调用点）

所有写入路径在持久化前调用 `assertNoHardDependencyCycles()`，确保硬边子图无环：

| 文件 | 行号 | 场景 |
|------|------|------|
| `adapters/graph.ts` | :140 | trap 侧图索引 sync |
| `adapters/artifact-graph.ts` | :127 | skill 侧工件图索引 sync |
| `skill-events.ts` | :708 | skill 生命周期事件扇出，捕获错误后包装为更具体的消息 |
| `reconcile.ts` | :318 | 图索引全量重建协调，验证失败时保留删除但拒绝 upsert |

### 3.4 读取路径 — 图遍历检索（2 个消费端）

| 文件 | 导入函数 | 解决什么问题 |
|------|----------|-------------|
| `retrieval/recall/graph-assisted.ts` | `buildGraphRuntimeSnapshot`、`expandSourcesOneHop`、`calculateSourceRelationStrength` | **关系增强召回**：提取查询实体 → 一跳展开 → 边强度打分 |
| `retrieval/graph-plan/plan-compiler.ts` | `buildLocalExpansionView` + `Graph` 类型 | **trap-first 计划编译**：有界多跳展开 → 识别阻塞 trap（`risk-blocks` 边）→ 找缓解 skill（`mitigates` 边）→ 构建计划边和统一图 |

`plan-compiler.ts` 还大量使用 `Graph` 接口的方法：`forEachEdge()`、`nodes()`、`getNodeAttributes()`、`hasNode()`，在展开后的子图上做 trap/skill 识别和边收集。

### 3.5 Graphology 消费关系图

```
graphology npm 包
  graphology (核心)
  graphology-dag (hasCycle)
  graphology-operators (subgraph)
  graphology-shortest-path (singleSourceLength)
       │
       ▼
  graphology.ts  ← 唯一直接调用点
       │
       ├──▶ graph-assisted.ts    [检索: 一跳展开 + 打分]
       │       ├── buildGraphRuntimeSnapshot()
       │       ├── expandSourcesOneHop()
       │       └── calculateSourceRelationStrength()
       │
       ├──▶ plan-compiler.ts     [检索: 局部展开 + 计划编译]
       │       ├── buildLocalExpansionView()
       │       └── Graph 类型 (遍历 trap/skill/边)
       │
       ├──▶ graph.ts             [索引: trap 写入环检测]
       ├──▶ artifact-graph.ts    [索引: skill 写入环检测]
       ├──▶ skill-events.ts      [索引: 事件扇出环检测]
       └──▶ reconcile.ts         [索引: 重建协调环检测]
              │
              └── assertNoHardDependencyCycles()
```

---

## 四、整体架构关系

```
LangChain 层                          Graphology 层
┌─────────────────────┐              ┌──────────────────────────┐
│ providers.ts        │              │ graphology.ts            │
│  (Chat/Embeddings   │              │  (单网关，所有 npm 调用)   │
│   懒加载抽象)        │              │                          │
└────────┬────────────┘              └─────┬────────────────────┘
         │                                 │
    ┌────┴────┐                   ┌────────┼────────┐
    │         │                   │        │        │
pre-review.ts │              写入路径    读取路径1  读取路径2
 (Document,  │              4个adapter  graph-    plan-
  RunnableLambda)           cycle校验   assisted  compiler
         │
    embeddings.ts (遗留)
```

LangChain 负责 LLM 调用和 embeddings 生成，Graphology 负责知识图谱的组装、遍历和完整性校验。两者共同支撑项目的 GraphRAG-lite 架构。

---

## 相关文档

- [AI 提供商抽象层](AI_PROVIDER.md)
- [索引管道](INDEXING.md)
- [检索管道](RETRIEVAL.md)
- [混合图提取策略](../HYBRID_GRAPH_EXTRACTION.md)
