# Server 模块桶导出结构

> 创建时间：2026-07-02
> 背景：Phase 0.4 六边形架构清理，完成模块拆分与桶导出

## 概述

`packages/server/src/lib/` 在 Phase 0.4 中完成了一轮模块拆分，目标是降低单文件复杂度并强化单一职责。每个拆分后的目录都补上了 `index.ts` 桶导出，用来提供稳定的导入表面。本文档记录当前已建立的 10 组桶导出。

## 桶导出

### 1. `lib/runtime/index.ts`

部署与运行时基础设施模块。

**重新导出：**

- `deployment-profile`：部署 profile 配置与解析
- `metrics`：运行时指标采集
- `resilience`：重试、熔断与回退工具
- `request-context`：按请求传播的 `requestId` / trace header 上下文
- `http-surface`：HTTP 表面配置
- `route-surface`：路由表面 gating 与能力判断
- `runtime-contract`：运行时能力与拓扑契约
- `service-unit`：服务单元抽象
- `runtime-metadata`：`/health` 与 `/ready` 运行时快照
- `runtime-ownership`：运行时所有权声明
- `service-topology`：服务实例拓扑模型

### 2. `lib/lifecycle/index.ts`

领域事件生命周期与 outbox 基础设施。

**重新导出：**

- `event-bus`：进程内事件总线
- `state-machine`：生命周期状态机定义
- `transitions`：合法生命周期状态转换
- `publisher`：事件发布器接口
- `emit-transition`：生命周期转换发射辅助函数
- `outbox`：用于持久化事件投递的 outbox worker
- `types`：共享生命周期类型
- `subscribers/audit`：审计日志订阅器
- `subscribers/conflict`：冲突检测订阅器
- `subscribers/indexing`：索引触发订阅器

### 3. `lib/graph-query/index.ts`

图查询后端抽象与投影辅助模块。

**重新导出：**

- `backend`：图查询后端接口
- `config`：图查询配置
- `memory-backend`：内存图后端回退实现
- `neo4j-backend`：Neo4j 图查询后端
- `projector`：图投影辅助工具
- `health`：图查询健康检查封装

### 4. `lib/decay/index.ts`

知识新鲜度衰减引擎。

**重新导出：**

- `config`：衰减配置与阈值
- `state-machine`：衰减状态转换
- `freshness`：新鲜度得分计算

### 5. `lib/conflict/index.ts`

冲突检测与冲突解释模块。

**重新导出：**

- `detect`：冲突检测逻辑
- `llm-conflict`：基于 LLM 的冲突判断
- `enrich`：为检索响应补充冲突上下文
- `repository`：冲突持久化仓库

### 6. `lib/indexing/graph-lite/index.ts`

轻量图索引流水线（GraphRAG Lite）。

**重新导出：**

- `documents`：面向图抽取的文档处理
- `graphology`：基于 Graphology 的图存储与扩展
- `store`：graph-lite 持久化辅助函数
- `llm-cache`：LLM 抽取结果缓存
- `llm-extract`：基于 LLM 的实体/关系抽取，内部再拆分为：
- `ids`：实体 ID 生成
- `merge`：实体合并逻辑
- `parsing`：LLM 响应解析
- `planning`：抽取规划

### 7. `lib/retrieval/scoring/index.ts`

检索评分与重排模块。

**重新导出：**

- `boundary-match`：基于 boundary 的过滤与评分
- `boundary-query`：boundary 反查辅助函数
- `merge`：多来源候选结果合并
- `rerank`：结果重排

### 8. `lib/retrieval/orchestration/index.ts`

检索流水线编排模块。

**重新导出：**

- `channel-registry`：召回通道注册
- `strategy-registry`：检索策略注册
- `recall-coordinator`：多通道召回协调
- `orchestrator`：顶层检索编排器
- `filters`：结果过滤
- `routing`：查询路由逻辑
- `search-v1`：v1 检索流水线
- `search-v2`：v2 检索流水线
- `embedding-update`：embedding 更新协调
- `pipeline-timing`：流水线耗时采集
- `routing-trace`：路由决策追踪

### 9. `lib/retrieval/response/index.ts`

检索响应组装模块。

**重新导出：**

- `assembly`：从评分结果组装响应
- `citations`：引用抽取与格式化
- `refinement`：响应精修与过滤
- `summary`：响应摘要生成

### 10. `lib/retrieval/graph-plan/index.ts`

以 trap 优先的图计划编译模块（v3 检索）。

**重新导出：**

- `graph-plan-search`：图计划检索入口
- `plan-compiler`：从图数据编译计划
- `execution-plan`：执行计划构建
- `plan-citations`：计划引用生成
- `plan-edges`：计划边构建
- `plan-graph`：计划图数据结构
- `skill-selection`：计划节点的 skill 选择
- `trap-identification`：图中的 trap 识别
- `trap-ranking`：trap 排名与优先级判断

## 导入约定

Phase 0.4 之后，调用方应优先从桶导出入口导入，而不是继续深入到子模块文件：

```typescript
// 之前：深层导入
import { detectConflict } from '../lib/conflict/detect.js';

// 现在：通过桶导出导入
import { detectConflict } from '../lib/conflict/index.js';
// 或等价地：
import { detectConflict } from '../lib/conflict.js';
```

这样可以在后续继续调整模块内部结构时，尽量不影响下游导入点。
