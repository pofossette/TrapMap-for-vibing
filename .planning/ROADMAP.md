# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- 🚧 **v1.1 RAG Structure Enhancement** — Phases 6-11 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-04-14</summary>

**Full archive:** [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)

- [x] Phase 1: Monorepo Skeleton and Contracts (3/3 plans) — completed 2026-04-13
- [x] Phase 2: Identity, Teams, and RBAC (3/3 plans) — completed 2026-04-13
- [x] Phase 3: Knowledge Intake and Review (4/4 plans) — completed 2026-04-13
- [x] Phase 4: Retrieval and CLI Workflow (4/4 plans) — completed 2026-04-13
- [x] Phase 5: Admin Operations and Hardening (3/3 plans) — completed 2026-04-13

**Delivered:**
- TypeScript monorepo with CLI, server, and shared contracts
- Team-aware RBAC with security levels (0-10) and permission checks
- Knowledge lifecycle with agent pre-review and human approval
- Embeddings-backed retrieval with CLI search commands
- Admin operations: import/export, knowledge management, audit trail

</details>

<details open>
<summary>🚧 v1.1 RAG Structure Enhancement (Phases 6-11) — IN PROGRESS</summary>

**Goal:** 从单路 embedding 检索演进为可扩展的多路 RAG 架构

- [ ] Phase 6: 检索架构重构 — TBD
- [ ] Phase 7: 混合检索 — TBD
- [ ] Phase 8: 索引生命周期 — TBD
- [ ] Phase 9: 图辅助检索 — TBD
- [ ] Phase 10: 回答与引用 — TBD
- [ ] Phase 11: 索引生命周期集成 — TBD (gap closure)

**Planned Features:**
- 检索编排层 (orchestrator) 与多路召回
- 混合检索模式 (vector + keyword)
- 生命周期驱动的索引管线
- 轻量图辅助检索
- 可审计的引用结构与可选摘要生成

**Depends on:** v1.0 MVP
**Success criteria:**
- 检索质量提升（短文本查询改进）
- 索引刷新自动化（降低查询时计算）
- 可审计的引用（来源、片段、标签、通道、得分）
- 可扩展架构（支持未来增强）

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Monorepo Skeleton and Contracts | v1.0 | 3/3 | Complete | 2026-04-13 |
| 2. Identity, Teams, and RBAC | v1.0 | 3/3 | Complete | 2026-04-13 |
| 3. Knowledge Intake and Review | v1.0 | 4/4 | Complete | 2026-04-13 |
| 4. Retrieval and CLI Workflow | v1.0 | 4/4 | Complete | 2026-04-13 |
| 5. Admin Operations and Hardening | v1.0 | 3/3 | Complete | 2026-04-13 |
| 6. 检索架构重构 | v1.1 | 0/3 | Pending | — |
| 7. 混合检索 | v1.1 | 0/3 | Pending | — |
| 8. 索引生命周期 | v1.1 | 0/4 | Pending | — |
| 9. 图辅助检索 | v1.1 | 0/4 | Pending | — |
| 10. 回答与引用 | v1.1 | 4/4 | Complete    | 2026-04-15 |
| 11. 索引生命周期集成 | v1.1 | 2/2 | Complete    | 2026-04-15 |

## Phase Details

### Phase 6: 检索架构重构

**Goal:** 重构为可扩展检索骨架，不改变产品行为

**Plans:**
1. 抽离检索编排器 (orchestrator)
2. 分离召回、过滤、组装逻辑
3. 定义 query mode 接口

**Requirements:** ARCH-01 ~ ARCH-06, BOUND-01 ~ BOUND-05
**Success criteria:**
- 检索逻辑清晰分层
- 现有 API 返回结构兼容
- 为多路召回预留接口

### Phase 7: 混合检索

**Goal:** 增加关键词召回通道，提升检索稳定性

**Plans:**
1. 实现关键词召回 adapter
2. 实现向量与关键词合并
3. 引入简单 rerank

**Requirements:** HYBR-01 ~ HYBR-05
**Success criteria:**
- 短文本查询召回率提升
- 混合模式可选
- Rerank 改进排序质量

### Phase 8: 索引生命周期

**Goal:** 索引构建变成生命周期驱动，降低查询时计算

**Plans:**
1. 创建索引管线与事件触发器
2. 审批后自动建索引
3. 更新/停用时刷新/移除索引
4. 实现向量与关键词索引 adapter

**Requirements:** IDX-01 ~ IDX-08
**Success criteria:**
- 审批通过后自动建索引
- 查询时不再重复计算索引
- 索引状态与知识状态同步

### Phase 9: 图辅助检索

**Goal:** 引入轻量实体抽取和关系辅助召回

**Plans:**
1. 设计实体类型与抽取策略
2. 实现轻量图索引存储
3. 实现实体扩展查询
4. 实现关系辅助召回

**Requirements:** GRAPH-01 ~ GRAPH-07
**Success criteria:**
- 高价值实体正确抽取
- 图辅助召回可查到隐性相关知识
- 不引入重型图数据库依赖

### Phase 10: 回答与引用

**Goal:** 增加可审计的引用结构和可选摘要生成

**Plans:** 4/4 plans complete

Plans:
- [ ] `10-01-PLAN.md` — 吸收 server typecheck 红基线并定义 citation/summary shared contracts
- [ ] `10-02-PLAN.md` — 在 server output stage 实现 Citation Builder 与可审计响应字段
- [ ] `10-03-PLAN.md` — 接入只消费 safe hits 的 optional Summary Builder
- [x] `10-04-PLAN.md` — 更新 CLI/route 消费契约并执行 Phase 10 联合验证 (completed 2026-04-15)

**Requirements:** CITE-01 ~ CITE-06, SUMM-01 ~ SUMM-06, BOUND-01 ~ BOUND-05
**Success criteria:**
- 每个结果包含完整引用信息
- 摘要基于命中知识生成
- 摘要不绕过权限过滤
- 摘要生成可关闭

### Phase 11: 索引生命周期集成

**Goal:** 连接索引事件触发器到知识生命周期，实现自动化索引管理

**Gap Closure:** Closes gaps from v1.1 audit (IDX-03, IDX-04, IDX-05, IDX-06)

**Plans:** 2/2 plans complete

Plans:
- [ ] `11-01-PLAN.md` — 注册默认索引适配器并把 reviewer approval 在提交后接到事件层
- [ ] `11-02-PLAN.md` — 把 knowledge update / deactivate 在提交后接到索引刷新与移除，并补齐路由回归测试

**Requirements:** IDX-03 ~ IDX-06
**Success criteria:**
- 审批通过后自动调用索引同步
- 知识更新时刷新索引状态
- 知识停用时移除索引
- 适配器正确注册并传递到事件处理器

## Dependencies

```
Phase 6 (架构重构)
    ↓
Phase 7 (混合检索)
    ↓
Phase 8 (索引生命周期) ─────┐
    ↓                        │
Phase 9 (图辅助检索)         │
    ↓                        │
Phase 10 (回答与引用) ◄──────┘
    ↓
Phase 11 (索引生命周期集成) ← gap closure for Phase 08
```

**说明:**
- Phase 6 必须首先完成，为后续阶段提供架构基础
- Phase 7 依赖 Phase 6 的 orchestrator
- Phase 8 可与 Phase 9 并行，但 Phase 10 依赖两者完成
- 所有阶段都必须遵守业务边界保护需求

---
*Roadmap updated: 2026-04-14*
