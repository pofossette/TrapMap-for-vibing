# Requirements: Skill Shareer v1.1

**Defined:** 2026-04-14
**Core Value:** Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake

## v1.1 Requirements

本里程碑需求源自 `docs/retrieval-structure-adjustment.md`，将检索系统从单路 embedding 演进为可扩展的多路 RAG 架构。

### 检索架构重构 (Phase A)

- [ ] **ARCH-01**: 抽出 `retrieval/orchestrator.ts` 作为检索编排入口
- [ ] **ARCH-02**: 分离过滤逻辑到 `retrieval/filters.ts`
- [ ] **ARCH-03**: 分离召回逻辑到 `retrieval/recall/` 目录
- [ ] **ARCH-04**: 分离结果组装逻辑到独立模块
- [ ] **ARCH-05**: 保持现有 API 返回结构兼容（globalConstraints + projectKnowledge）
- [ ] **ARCH-06**: 定义 query mode 接口（semantic / hybrid / graph-assisted）

### 混合检索 (Phase B)

- [ ] **HYBR-01**: 实现关键词召回通道 (`retrieval/recall/keyword.ts`)
- [ ] **HYBR-02**: 实现向量与关键词候选集合并逻辑
- [ ] **HYBR-03**: 引入简单 rerank 模块 (`retrieval/rerank.ts`)
- [ ] **HYBR-04**: 支持混合查询模式 (hybrid mode)
- [ ] **HYBR-05**: 验证混合检索对短文本查询的改进效果

### 索引生命周期 (Phase C)

- [ ] **IDX-01**: 创建索引管线 (`indexing/pipeline.ts`)
- [ ] **IDX-02**: 创建内容标准化模块 (`indexing/normalize.ts`)
- [ ] **IDX-03**: 创建索引事件触发器 (`indexing/events.ts`)
- [ ] **IDX-04**: 审批通过后自动建索引
- [ ] **IDX-05**: 知识更新时刷新索引
- [ ] **IDX-06**: 知识停用时移除索引
- [ ] **IDX-07**: 实现向量索引 adapter (`indexing/adapters/vector.ts`)
- [ ] **IDX-08**: 实现关键词索引 adapter (`indexing/adapters/keyword.ts`)

### 图辅助检索 (Phase D)

- [ ] **GRAPH-01**: 创建实体图 adapter (`indexing/adapters/graph.ts`)
- [ ] **GRAPH-02**: 创建图辅助召回模块 (`retrieval/recall/graph-assisted.ts`)
- [ ] **GRAPH-03**: 实现高价值实体抽取 (service, tool, symptom, root-cause, fix, environment)
- [ ] **GRAPH-04**: 实现实体扩展查询
- [ ] **GRAPH-05**: 实现关系辅助召回
- [ ] **GRAPH-06**: 支持图辅助查询模式 (graph-assisted mode)
- [ ] **GRAPH-07**: 创建轻量图索引存储（非重型知识图谱平台）

### 回答与引用 (Phase E)

- [x] **CITE-01**: 创建 Citation Builder (`retrieval/citations.ts`)
- [ ] **CITE-02**: 引用包含命中来源 (source)
- [ ] **CITE-03**: 引用包含命中片段 (snippet)
- [ ] **CITE-04**: 引用包含命中标签 (tags)
- [ ] **CITE-05**: 引用包含召回通道 (recall channel)
- [x] **CITE-06**: 引用包含 rerank 后得分
- [x] **SUMM-01**: 创建 Summary Builder (`retrieval/summary.ts`)
- [ ] **SUMM-02**: 摘要仅基于命中的批准知识生成
- [ ] **SUMM-03**: 摘要不绕过权限过滤
- [ ] **SUMM-04**: 摘要必须能返回引用
- [ ] **SUMM-05**: 摘要生成可以关闭（可选功能）
- [x] **SUMM-06**: 更新 API 契约支持可选 answer/summary 字段

### 业务边界保护

- [x] **BOUND-01**: contracts 仍然是唯一契约真源
- [ ] **BOUND-02**: cli 继续只依赖 API 契约
- [ ] **BOUND-03**: RBAC、team 过滤、审批和审计仍在 server 内
- [ ] **BOUND-04**: global/project 继续表示业务范围，不是检索模式
- [x] **BOUND-05**: 所有增强服从 审批 → 权限过滤 → 检索 → 输出 的顺序

## v2 Requirements

延期到后续版本的特性。

### 高级特性

- **GRAPH-20**: 重型知识图谱平台集成
- **SUMM-20**: 多轮对话式问答
- **RETR-20**: 跨项目全局检索
- **PERF-20**: 分布式缓存层

## Out of Scope

明确排除的功能，防止范围蔓延。

| Feature | Reason |
|---------|--------|
| 直接集成 LightRAG 项目 | 保持技术栈一致（TypeScript），避免引入 Python 运行时 |
| 重型知识图谱平台 | Phase D 仅实现轻量实体抽取，不需要完整图数据库 |
| 让外部 RAG 系统接管主业务流程 | 必须保留现有业务边界和审计能力 |
| 多模态检索 | v1.1 继续专注文本检索 |
| 实时流式索引 | 索引刷新绑定到生命周期事件，不需要实时流式处理 |

## Traceability

需求与路线图阶段的映射关系。将在路线图创建时更新。

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 06 | Pending |
| ARCH-02 | Phase 06 | Pending |
| ARCH-03 | Phase 06 | Pending |
| ARCH-04 | Phase 06 | Pending |
| ARCH-05 | Phase 06 | Pending |
| ARCH-06 | Phase 06 | Pending |
| HYBR-01 | Phase 07 | Pending |
| HYBR-02 | Phase 07 | Pending |
| HYBR-03 | Phase 07 | Pending |
| HYBR-04 | Phase 07 | Pending |
| HYBR-05 | Phase 07 | Pending |
| IDX-01 | Phase 08 | Pending |
| IDX-02 | Phase 08 | Pending |
| IDX-03 | Phase 11 | Pending |
| IDX-04 | Phase 11 | Pending |
| IDX-05 | Phase 11 | Pending |
| IDX-06 | Phase 11 | Pending |
| IDX-07 | Phase 08 | Pending |
| IDX-08 | Phase 08 | Pending |
| GRAPH-01 | Phase 09 | Pending |
| GRAPH-02 | Phase 09 | Pending |
| GRAPH-03 | Phase 09 | Pending |
| GRAPH-04 | Phase 09 | Pending |
| GRAPH-05 | Phase 09 | Pending |
| GRAPH-06 | Phase 09 | Pending |
| GRAPH-07 | Phase 09 | Pending |
| CITE-01 | Phase 10 | Complete |
| CITE-02 | Phase 10 | Pending |
| CITE-03 | Phase 10 | Pending |
| CITE-04 | Phase 10 | Pending |
| CITE-05 | Phase 10 | Pending |
| CITE-06 | Phase 10 | Complete |
| SUMM-01 | Phase 10 | Complete |
| SUMM-02 | Phase 10 | Pending |
| SUMM-03 | Phase 10 | Pending |
| SUMM-04 | Phase 10 | Pending |
| SUMM-05 | Phase 10 | Pending |
| SUMM-06 | Phase 10 | Complete |
| BOUND-01 | All Phases | Complete |
| BOUND-02 | All Phases | Pending |
| BOUND-03 | All Phases | Pending |
| BOUND-04 | All Phases | Pending |
| BOUND-05 | All Phases | Complete |

**Coverage:**
- v1.1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-14*
*Last updated: 2026-04-15 after gap closure planning (Phase 11 added)*
