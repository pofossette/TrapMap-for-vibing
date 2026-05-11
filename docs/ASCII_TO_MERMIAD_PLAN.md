# ASCII 框图替换为 Mermaid Flowchart 计划

## 背景

项目文档中存在大量使用 ASCII 字符（`┌─┐│` 等）绘制的框图和流程图。这些图在部分 Markdown 渲染器中显示效果不佳，且不易维护。本计划将其替换为 Mermaid 的 `flowchart TB` + `subgraph` 语法。

## 替换原则

1. **仅替换复杂流程图**：保留简单的层级树状图（如文件目录树）、代码示例和表格
2. **使用 flowchart TB 方向**：从上到下的流程图统一使用 `flowchart TB`
3. **使用 subgraph 分组**：将相关节点用 `subgraph` 包裹，增强可读性
4. **保持语义一致**：替换后的 Mermaid 图应准确表达原 ASCII 图的含义

## 需要替换的文件和图表

### 1. `docs/architecture/ARCHITECTURE.md` (6 处)

| 序号 | 原图标题 | 类型 | 替换方案 |
|------|---------|------|---------|
| 1.1 | 分层架构（Presentation → Route → Business → Persistence） | 层级架构图 | `flowchart TB` + 4 个 `subgraph` |
| 1.2 | 多适配器索引（Entry State → Index State → 3 Adapters → Reconciliation） | 流程图 | `flowchart TB` + `subgraph` 分组适配器 |
| 1.3 | 检索管道（Request → Validate → Auth → Eligibility → Mode Dispatch → 3 Recall → Merge → Assembly） | 复杂流程图 | `flowchart TB` + `subgraph` 分组 Recall 阶段 |
| 1.4 | Trap 优先计划编译（Query → GraphRAG → Confidence Routing → High/Low Path） | 分支流程图 | `flowchart TB` + 决策菱形节点 |
| 1.5 | 异步摄取管道（Candidate → received → queued → analyzing → Duplicate/Analysis → Resolution） | 状态流程图 | `flowchart TB` + `subgraph` 分组处理阶段 |
| 1.6 | 会话与认证（Login → Validate → Create Session → Session Check → RBAC） | 流程图 | `flowchart TB` + 两个 subgraph（登录流程、会话检查） |

### 2. `docs/architecture/FLOW.md` (8 处)

| 序号 | 原图标题 | 类型 | 替换方案 |
|------|---------|------|---------|
| 2.1 | 知识提交流程 | 复杂流程图 | `flowchart TB` + `subgraph` 分组各阶段 |
| 2.2 | 检索查询流程 (v1) | 复杂流程图 | `flowchart TB` + `subgraph` 分组模式分支 |
| 2.3 | 审核决策流程 | 流程图 | `flowchart TB` + 决策节点 |
| 2.4 | 异步摄取管道流程 | 状态流程图 | `flowchart TB` + `subgraph` |
| 2.5 | 陷阱优先计划编译流程 | 分支流程图 | `flowchart TB` |
| 2.6 | 会话认证流程 | 流程图 | `flowchart TB` |
| 2.7 | 索引管道流程 | 并行流程图 | `flowchart TB` + 3 个适配器并行分支 |
| 2.8 | 工件派生流程 | 顺序流程图 | `flowchart TB` + `subgraph` |

### 3. `docs/architecture/components/` 目录下 (多处)

| 文件 | 原图数量 | 主要图表 |
|------|---------|---------|
| KNOWLEDGE_LIFECYCLE.md | 2 | 生命周期状态图、Agent Review 流程 |
| INGESTION.md | 4 | 架构概览、候选状态机、提交流程、重复检测流程、人工解决流程 |
| RETRIEVAL.md | 4 | 语义检索、混合检索、图辅助检索、胶囊检索、计划编译 |
| DEDUPLICATION.md | 1 | 候选状态机 |
| REVIEW.md | 0 | 已有 Mermaid 图 |
| INDEXING.md | 2 | 架构总览、规范化阶段、适配器流程 |
| AI_PROVIDER.md | 1 | 提供商抽象架构 |
| GOVERNANCE.md | 2 | 等级继承、权限检查流程、Access Key 流程 |
| AUTH.md | 2 | 认证流程概览、密码重置流程 |
| CLIENT.md | 0 | 已有 Mermaid 图 |

### 4. `docs/README.md` 和 `README.md` (2 处)

| 文件 | 原图标题 | 替换方案 |
|------|---------|---------|
| docs/README.md | 系统架构（Monorepo 包结构 → 索引） | `flowchart TB` + `subgraph` |
| README.md | 无 ASCII 框图（仅目录树） | 保留 |

## 执行步骤

1. 从 `docs/architecture/ARCHITECTURE.md` 开始（核心架构文档）
2. 继续 `docs/architecture/FLOW.md`（数据流文档）
3. 处理 `docs/architecture/components/` 下的组件文档
4. 最后处理 `docs/README.md`
5. 验证所有 Mermaid 语法正确性

## 注意事项

- 部分文件已有 Mermaid 图，不重复替换
- 简单树状结构（如文件目录 `├──`）保持不变
- 代码块内的 ASCII 输出示例保持不变
- 表格保持不变
