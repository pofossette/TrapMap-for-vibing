# TrapMap v2 管线多路召回实施方案

## 📋 文档信息

- **创建日期**: 2026-05-23
- **版本**: 1.0
- **负责人**: 开发者
- **状态**: Draft
- **预估总工作量**: 10-15 天（2-3 周）
- **优先级**: 高
- **目标范围**: `/v2/retrieval/search` 及其评测、索引、观测、灰度发布链路

---

## ⚠️ 重要约束

### 阶段完成标准

**一个阶段完成，必须同时满足以下条件：**

- [ ] 该阶段所有任务 checkbox 已标记完成
- [ ] 相关单元测试、集成测试、评测已通过
- [ ] 涉及的文档已经同步更新
- [ ] TypeScript 类型检查通过
- [ ] Lint 检查通过
- [ ] 如修改了代码，本阶段对应的验证结果已记录

**⚠️ 注意：架构设计完成 ≠ 阶段完成**

```text
❌ 错误做法：
补一部分代码 → 认为主链路已成型 → 继续下阶段 → 最后统一补评测和文档

✅ 正确做法：
完成本阶段代码 → 更新文档 → 跑最小必要验证 → 记录结果 → 标记该阶段完成
```

### 不可破坏约束

本方案默认遵守以下边界，除非单独立项突破：

- [ ] 不破坏 `/v2/retrieval/search` 现有请求/响应主契约
- [ ] 不绕过现有治理过滤：team、requiredLevel、lifecycleState
- [ ] 不在检索阶段返回 raw assets、raw scripts、raw file bodies
- [ ] 不让派生索引表成为业务真相源（source of truth）
- [ ] 不让 graph 通道直接替代 capsule 侧精排
- [ ] 不要求 PostgreSQL 模式是唯一运行模式，需保留 fallback 路径

### 文档同步要求

**每类变更必须同步更新对应文档：**

| 变更位置 | 必须同步的文档 |
|---------|---------------|
| `packages/contracts/src/domain/retrieval.ts` | `docs/reference/api-surface.md`、`docs/architecture/components/RETRIEVAL.md` |
| `packages/server/src/lib/retrieval/orchestration/orchestrator.ts` | `docs/architecture/components/RETRIEVAL.md` |
| `packages/server/src/lib/retrieval/capsules/*` | `docs/architecture/components/RETRIEVAL.md` |
| `packages/server/src/lib/persistence/schema.ts` | 数据库 Schema 文档 / 相关架构文档 |
| `evals/retrieval/*` | `docs/operations/TESTING.md`、`evals/retrieval/README.md` |
| 新增环境变量 / feature flag | `docs/operations/ENVIRONMENT.md` |

**文档更新检查项：**

- [ ] 检索流程图已反映 v2 多路召回新链路
- [ ] 通道定义、融合策略、回退策略已补充到 RETRIEVAL.md
- [ ] 若新增索引表，表结构与同步职责已说明
- [ ] 测试和评测命令已写入 TESTING.md
- [ ] 若新增观测字段，trace/log 结构已记录

### 代码 / 测试 / Eval / 文档联动矩阵

本计划不接受“只改主实现，不改配套”的交付方式。以下联动矩阵用于约束每类改动必须同步更新的对象。

| 改动类型 | 主代码 | 测试代码 | Eval 组件 | 文档 |
|---------|--------|----------|-----------|------|
| v2 orchestrator / coordinator 改造 | `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`、`packages/server/src/lib/retrieval/capsules/*` | `packages/server/src/lib/retrieval*.test.ts`、`packages/server/src/routes/retrieval.test.ts` | `evals/retrieval/lib/*`（若 trace / normalize 受影响） | `docs/architecture/components/RETRIEVAL.md` |
| 新 recall channel | `packages/server/src/lib/retrieval/capsules/channels/*` | 对应 channel 单测、integration test | 新增 v2 retrieval cases、必要时调整 normalize / governance adapter | `RETRIEVAL.md`、`TESTING.md` |
| 新 merge / rerank | `packages/server/src/lib/retrieval/capsules/scoring/*` | merge/rerank 单测、v2 integration | 新增 mixed-channel / regression eval case | `RETRIEVAL.md` |
| 新 PG 索引表 / repo | `packages/server/src/lib/persistence/schema.ts`、`packages/server/src/lib/retrieval/capsules/repositories/*` | PG 集成测试、validation test | eval 不直接改逻辑，但要新增 PG 路径回归 case 或运行说明 | Schema 文档、`ENVIRONMENT.md`、`TESTING.md` |
| 新 trace / feature flag | orchestrator / config / routing | route test、trace test | eval runner / normalize / reporting（若消费 trace） | `ENVIRONMENT.md`、`RETRIEVAL.md`、`TESTING.md` |
| 新 graph recall | `packages/server/src/lib/retrieval/capsules/channels/graph.ts`、graph adapter/repo | graph recall 单测、route/integration test | graph-assisted-v2 eval cases | `RETRIEVAL.md`、必要时 graph 架构文档 |

### 测试代码同步要求

**只改实现、不补测试代码，视为阶段未完成。**

测试代码更新至少覆盖以下层次中的相关项：

- [ ] 单元测试：新通道、新 merge、新 rerank、新 util
- [ ] 集成测试：`/v2/retrieval/search` 主链路、governance、activation hints、summary
- [ ] 路由级测试：输入校验、返回形状、trace 或 feature flag 行为
- [ ] PG 集成测试：若新增 DB recall / 索引表
- [ ] 回归测试：当前 v2 baseline 核心 case 不退化

### Eval 组件同步要求

**只补数据集、不检查 eval runner / normalize / metrics 的兼容性，也视为未完成。**

每次影响 v2 retrieval 行为的改动，都必须检查以下 eval 组件是否要同步变更：

- [ ] `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts`
- [ ] `evals/retrieval/datasets/core/v2-retrieval-core.ts`
- [ ] `evals/retrieval/scenarios/` 下对应 fixture/scenario
- [ ] `evals/retrieval/lib/normalize.ts`：若响应结构、trace、result extraction 变化
- [ ] `evals/retrieval/lib/adapters.ts`：若执行边界或 feature flag 驱动的调用方式变化
- [ ] `evals/retrieval/lib/governance.ts`：若新增治理断言维度
- [ ] `evals/retrieval/lib/metrics.ts`：若新增报告切片或统计维度
- [ ] `evals/retrieval/run.ts` / README：若新增 endpoint 选项、trace 输出、baseline 行为

### 每阶段完成检查清单

```markdown
## Phase X 完成检查

### 任务完成
- [ ] 所有任务 checkbox 已标记完成
- [ ] 实际完成日期已记录

### 代码质量
- [ ] `rtk pnpm typecheck` 通过
- [ ] `rtk pnpm check` 通过
- [ ] 相关 `rtk pnpm test` 通过

### 检索验证
- [ ] `rtk pnpm eval:retrieval:smoke` 通过（若适用）
- [ ] `rtk pnpm eval:retrieval:core` 通过或有说明（若适用）
- [ ] 与 baseline 对比结果已记录

### 文档同步
- [ ] RETRIEVAL.md 已更新
- [ ] TESTING.md 已更新（如有相关修改）
- [ ] API / ENV / Schema 文档已更新（如有相关修改）

### 签字确认
- 实现者签名: ___________
- 日期: ___________
```

---

## 🎯 背景与目标

当前 TrapMap 的 v2 检索主路径是 **capsule-first 响应**，但不是严格意义上的“多路召回”。

现状大致如下：

- 路由入口为 `/v2/retrieval/search`
- 主协调逻辑位于 `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- v2 检索核心排序位于 `packages/server/src/lib/retrieval/capsules/capsule-recall.ts`
- 当前能力更接近“治理过滤后的 capsule 全量打分排序”
- 已具备：
  - seed intent 解析
  - situation/problem/goal/errorText 多特征评分
  - contextualPrefix 上下文匹配
  - stack/path boost
  - activation hint 组装
  - v2 smoke/core 评测基线

### 现状问题

当前 v2 的主要短板不是“缺少排序公式”，而是 **召回层过于单一**：

1. 缺少独立 recall channels
2. 缺少 channel 级候选融合与审计
3. 缺少 capsule 侧 DB 级 lexical/vector recall
4. graph 索引已存在 skill 侧基础，但未真正接入 v2 召回
5. 现有评测更偏排序和治理，缺少“多通道互补收益”的专门断言

### 本方案目标

为 TrapMap v2 管线引入 **多路召回（multi-recall）**，在不破坏现有客户端契约的前提下，建立可扩展、可观测、可灰度的 capsule-side retrieval architecture。

### 核心目标

- [ ] 让 v2 具备 semantic / keyword / graph / heuristic 多通道召回能力
- [ ] 保持现有 capsule-first 响应结构不变
- [ ] 保持 activation hints / summary / governance 逻辑可复用
- [ ] 提升 Recall@K，尽量不伤害 Hit@1 和治理正确性
- [ ] 为后续 v3 fallback 到 v2、skill search-by-content 共用能力打基础

### 非目标

本期明确不做以下事项，避免范围失控：

- [ ] 不重新设计 v2 API 契约
- [ ] 不把 v1 entry retrieval 与 v2 capsule retrieval 强行合并成单实现
- [ ] 不把 graph 通道做成唯一主排序器
- [ ] 不在本期处理所有 retrieval 技术债
- [ ] 不把多路召回扩展到 `/v1/retrieval/search` 之外的所有入口

---

## 🧭 当前代码现状与切入点

### 已确认的关键实现

| 位置 | 当前职责 | 对本方案的意义 |
|------|----------|----------------|
| `packages/server/src/routes/retrieval.ts` | v1/v2/v3 路由入口 | v2 API 可保持稳定，改造集中在服务内部 |
| `packages/server/src/lib/retrieval/orchestration/orchestrator.ts` | v1/v2 主编排器 | v2 多路召回的主要接入点 |
| `packages/server/src/lib/retrieval/capsules/capsule-recall.ts` | capsule 治理过滤、打分、reason 生成 | 可拆为 heuristic channel + rerank 特征层 |
| `packages/server/src/lib/retrieval/orchestration/recall-coordinator.ts` | v1 多路召回调度 | 提供模式、接口、日志、merge 的参考实现 |
| `packages/server/src/lib/retrieval/recall/keyword.ts` | v1 内存版 lexical recall | capsule keyword recall 的重要复用源 |
| `packages/server/src/lib/retrieval/recall/pg-keyword.ts` | v1 PG lexical recall | capsule PG keyword recall 的 SQL 范式来源 |
| `packages/server/src/lib/indexing/adapters/artifact-graph.ts` | skill artifact 图文档生成 | graph 通道的 skill 侧基础 |
| `packages/server/src/lib/persistence/schema.ts` | skill artifact 结构化表定义 | capsule 侧 vector/keyword 索引设计基础 |
| `evals/retrieval/*` | 检索评测 | 多路召回收益和回归的验证基础 |

### 当前 v2 主流程

```text
searchKnowledgeV2
  -> parse query
  -> parse seed intent
  -> store.snapshot()
  -> governance filters
  -> rankCapsules(...)
  -> build capsule matches
  -> build profile hints
  -> build activation hints
  -> optional summary
  -> rag log
```

### 当前 v2 的本质问题

`rankCapsules()` 同时承担了三类职责：

1. 候选空间构造
2. 召回与粗排
3. 最终排序解释

这会导致几个问题：

- 无法区分“没召回到”还是“召回到了但排序不够高”
- 无法独立观测 semantic / keyword / graph 哪条通道有效
- 无法平滑接入 PG 索引与 memory fallback
- 无法对 v2 做通道级 feature flag 和熔断

因此，本方案的核心不是简单加一个新函数，而是把 v2 分解为：

```text
治理过滤 -> 多通道候选召回 -> merge -> rerank -> 响应装配
```

---

## 🏗️ 目标架构

### 目标流程总览

```text
┌──────────────────────────────────────────────────────────────┐
│ 输入: /v2/retrieval/search { seed, filters, maxResults }     │
└──────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 阶段 1: 解析与治理过滤                                        │
│  - parse query                                                │
│  - parse intent                                               │
│  - build auth governance filters                              │
│  - shortlist governed artifacts / capsules                    │
└──────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 阶段 2: 多通道召回                                            │
│  - capsule-semantic                                           │
│  - capsule-keyword                                            │
│  - capsule-graph                                              │
│  - capsule-heuristic (fallback / safety net)                  │
└──────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 阶段 3: 候选融合与精排                                        │
│  - per-channel merge                                          │
│  - keep channel scores / audit trail                          │
│  - intent-aware rerank                                        │
│  - generate reason                                            │
└──────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 阶段 4: 响应装配                                              │
│  - capsules                                                   │
│  - profileHints                                               │
│  - activation hints                                           │
│  - optional summary                                           │
│  - routing trace / RAG log                                    │
└──────────────────────────────────────────────────────────────┘
```

### 设计原则

#### 原则 1：先分层，再提性能

第一优先级是把 v2 从“巨型打分函数”拆成可观测的召回架构，而不是上来就做 PG 深优化。

#### 原则 2：API 稳定，内部重构

先保证 `/v2/retrieval/search` 的输入输出基本不变，避免影响 CLI、v3 fallback、评测归一化层。

#### 原则 3：治理前置，不可绕过

所有 recall channels 要么：

- 输入来自已治理过滤的 capsule shortlist
- 要么在 DB 查询层实现与之等价的 governance where 条件

不能允许某条通道“查到了，再事后过滤”，否则容易引入泄漏和排序漂移。

#### 原则 4：graph 是扩召回，不是唯一裁决

graph 对 v2 来说更适合：

- 找补充候选
- 给重排加结构化 boost

而不适合作为最终主排序器。

#### 原则 5：memory 与 PG 双路径并存

默认要支持：

- snapshot / memory fallback
- PG 索引增强

这样可以兼顾现有开发、测试和生产路径。

---

## 🧱 多通道设计

### 通道总览

| 通道 | 主要职责 | 首版优先级 | 是否必须依赖 PG |
|------|----------|-----------|-----------------|
| `capsule-heuristic` | 复用现有 `rankCapsules`，作为保底与精排特征来源 | P0 | 否 |
| `capsule-keyword` | 精确 lexical 召回，补足语义漏召回 | P0 | 否 |
| `capsule-semantic` | embedding 语义召回，补足表达差异 | P1 | 否 |
| `capsule-graph` | 基于 skill graph 的扩召回与结构增强 | P2 | 否 |

### 1. `capsule-heuristic`

#### 定位

当前 `rankCapsules()` 的包装通道，用于：

- 作为迁移期兼容通道
- 作为 recall safety net
- 作为 rerank 特征计算基础

#### 输入

- governed artifacts
- parsed intent
- maxResults * N 的候选窗口

#### 输出

- capsule candidates
- score breakdown
- reason fragments

#### 注意事项

- 不能继续让 heuristic 通道承担整个系统的全部职责
- 应逐步把它收缩为“fallback + feature extractor”

### 2. `capsule-keyword`

#### 定位

面向精确术语、报错文本、路径词、标签词的 lexical recall。

#### 建议检索文本面

```text
labels
problem
goal
situation
contextualPrefix
content
```

#### 建议字段权重

| 字段 | 权重建议 | 说明 |
|------|---------|------|
| `labels` | 3.0 | 强语义标签命中 |
| `problem` | 2.5 | 问题文本是最强 capsule intent 信号之一 |
| `goal` | 2.0 | 目标导向检索的重要补充 |
| `situation` | 1.5 | 场景词对上下文区分有价值 |
| `contextualPrefix` | 1.5 | 提升上下文词召回，但不能压过 problem |
| `content` | 1.0 | 长正文噪音高，作为兜底字段 |

#### 复用来源

- `packages/server/src/lib/retrieval/recall/keyword.ts`
- `packages/server/src/lib/retrieval/recall/pg-keyword.ts`

#### 首版建议

- 先做内存版
- 再做 PG 版
- 两者共享 tokenization / normalize 逻辑

### 3. `capsule-semantic`

#### 定位

解决 query 与 capsule 文本表达不同，但问题本质相近的场景。

#### 建议 embedding 文本

```text
labels
situation
problem
goal
contextualPrefix
content
```

#### 设计要求

- 文本拼接顺序固定
- 支持 contentHash / revisionNo 级缓存
- 支持内存 fallback
- PG 模式可走向量索引

#### 注意事项

- contextualPrefix 有价值，但权重不宜过高
- content 需控制长度，避免 embedding 被冗长正文淹没

### 4. `capsule-graph`

#### 定位

利用 skill artifact graph 文档做结构化补召回，尤其适合：

- 前置技能
- 依赖链
- 共现技能
- 问题解决链路

#### 首版建议

不要直接做 capsule-to-capsule graph recall，先做：

```text
graph recall artifact IDs
  -> map to artifact capsules
  -> rerank within artifact
```

这样复杂度可控，也更符合当前 artifact graph adapter 的现实能力。

#### 注意事项

- graph 通道只读取 derived profile / capsules 文本与图边
- 不得引入 raw assets/scripts 内容

---

## 🧩 目标模块拆分

### 建议新增目录结构

```text
packages/server/src/lib/retrieval/capsules/
├── capsule-recall.ts
├── capsule-recall-coordinator.ts
├── capsule-channel-registry.ts
├── channels/
│   ├── heuristic.ts
│   ├── keyword.ts
│   ├── semantic.ts
│   └── graph.ts
├── scoring/
│   ├── merge.ts
│   ├── rerank.ts
│   └── reasons.ts
└── repositories/
    ├── pg-capsule-keyword.ts
    ├── pg-capsule-vector.ts
    └── pg-capsule-graph.ts
```

### 模块职责建议

| 模块 | 职责 |
|------|------|
| `capsule-recall.ts` | 保留现有 scoring primitives、governance helpers、match reason helper |
| `capsule-recall-coordinator.ts` | 统一调度 channels、merge、rerank |
| `capsule-channel-registry.ts` | capsule 通道注册与管理 |
| `channels/*` | 各 recall channel 独立实现 |
| `scoring/merge.ts` | RRF / weighted merge / dedupe |
| `scoring/rerank.ts` | 把当前 intent-aware 特征作用在 merged candidates 上 |
| `scoring/reasons.ts` | 将多通道来源与 rerank 特征转成 explainable reason |
| `repositories/*` | capsule PG recall 适配层，负责 DB 查询和结果映射 |

### 与现有 orchestrator 的关系

理想状态下，`searchKnowledgeV2()` 变成一个真正的编排器：

```text
parse
-> intent
-> snapshot / repo
-> governance shortlist
-> capsuleRecallCoordinator.execute(...)
-> response assembly
```

而不是直接手写“召回 + 排序 + 组装”的内联逻辑。

---

## 🔁 对已有代码的复用策略

### 可直接复用

- [ ] `parseSeedIntent`
- [ ] `isArtifactGovernanceEligible`
- [ ] `buildProfileShortlist`
- [ ] `buildCapsuleMatch`
- [ ] `buildProfileHint`
- [ ] `buildAllActivationHints`
- [ ] `buildCapsuleSummary`
- [ ] `logRagRetrieval`
- [ ] v1 `timedStep` 风格的 pipeline step 记录

### 建议抽取复用

- [ ] `normalizeQuery` / `tokenize`
- [ ] embedding 文本 hash 计算方式
- [ ] PG keyword recall 的条件拼接模式
- [ ] merge / rerank 的分层边界

### 不建议直接套用

- [ ] v1 的 `RecallCandidate` 与 `MergedCandidate`
- [ ] v1 entry bucket assembly
- [ ] v1 graph-assisted 实现细节

### 原因说明

v1 的内部结构是 entry-centric，而 v2 是 capsule-centric：

- 主键不同
- 文本字段面不同
- reason 维度不同
- 治理继承来自 artifact root
- 响应需要 activation hints / profile hints

因此更推荐 **复用设计模式，不直接复用数据模型**。

---

## 🗃️ 数据与索引设计

### 当前可用结构化表

`skill_artifact_capsules` 已经具备以下关键字段：

- `capsule_id`
- `artifact_id`
- `revision_no`
- `content`
- `situation`
- `problem`
- `goal`
- `error_text`
- `contextual_prefix`
- `labels`
- `scope`
- `required_level`

这足以支撑 capsule keyword / semantic recall 的索引化设计。

### 建议新增索引表

#### 1. `skill_artifact_capsule_keywords`

```text
capsule_id
artifact_id
revision_no
team_id
scope
required_level
status
tokens
field_tokens_content
field_tokens_situation
field_tokens_problem
field_tokens_goal
field_tokens_labels
field_tokens_contextual_prefix
content_hash
created_at
updated_at
```

#### 2. `skill_artifact_capsule_embeddings`

```text
capsule_id
artifact_id
revision_no
team_id
scope
required_level
status
embedding
content_hash
created_at
updated_at
```

### 索引同步原则

- [ ] 索引数据是派生数据，不是事实源
- [ ] 使用 `capsuleId + revisionNo + contentHash` 做幂等校验
- [ ] 发布/审批/重派生后触发同步
- [ ] 失败要记录 status / lastError
- [ ] 支持重试和批量重建

### graph 侧数据复用

skill graph 文档已有 artifact 级适配器，因此 graph 通道首版可以复用现有 graph 文档，不必先建 capsule 独立图表。

---

## 📊 融合与精排策略

### 推荐策略：两阶段

#### 阶段 1：Merge

对多通道候选做：

- dedupe by `capsuleId`
- 保留 per-channel scores
- 计算 `preRerankScore`

#### 阶段 2：Rerank

在 merged candidate 上复用现有 v2 intent-aware 评分：

- problem score
- situation score
- goal score
- error score
- context score
- stack/path boost

### 推荐 merge 方案

首版建议优先使用以下两种之一：

#### 方案 A：RRF

```text
RRF score = Σ 1 / (k + rank_i)
```

优点：

- 对不同通道的分数归一化要求较低
- 稳定、易解释

缺点：

- 无法充分利用通道分数差异

#### 方案 B：Weighted normalized sum

```text
preRerank =
  semanticScore * 0.35 +
  keywordScore * 0.30 +
  heuristicScore * 0.25 +
  graphScore * 0.10
```

优点：

- 可直接表达业务偏好

缺点：

- 对标定要求高

### 推荐落地方式

首版建议：

- [ ] 先用 RRF 建立稳定 merge
- [ ] 保留通道原始分数
- [ ] 后续通过评测决定是否切 weighted merge

### reason 生成策略

最终 reason 不应该只说“Matched: keyword match”，而应该能体现：

- 哪些通道命中
- 哪些 intent 特征推动了精排
- 是否有 stack/path/context boost

建议结构：

```text
Matched via semantic + keyword; strong problem match (82%), context match (61%), stack/path boost
```

---

## 🧪 评测与验证方案

### 必须新增的评测切片

#### 1. keyword-dominant

场景：术语、报错、路径词精确匹配，semantic 可能不稳。

验证目标：

- [ ] keyword 通道独立提升 recall
- [ ] 不引入 forbidden 泄漏

#### 2. semantic-dominant

场景：query 和 capsule 表达差异大，但语义相近。

验证目标：

- [ ] semantic 通道召回成功
- [ ] heuristic/rerank 保证 top1 不漂移

#### 3. graph-assisted-v2

场景：问题需要前置技能或依赖链扩召回。

验证目标：

- [ ] graph 通道能补充候选
- [ ] graph 不直接污染最终 top1

#### 4. mixed-channel

场景：一个问题同时被 semantic、keyword、heuristic 命中。

验证目标：

- [ ] channelsUsed 正确记录
- [ ] merge 与 rerank 能稳定输出合理顺序

#### 5. regression safety

场景：当前 v2 baseline 中命中的核心例子。

验证目标：

- [ ] baseline Hit@1 不显著下降
- [ ] 无治理回归

### 建议新增断言

- [ ] trace 中记录 `channelsPlanned`
- [ ] trace 中记录 `channelsUsed`
- [ ] 候选融合前后数量可观测
- [ ] 支持 baseline 对比

### 建议执行命令

```bash
rtk pnpm test
rtk pnpm typecheck
rtk pnpm check
rtk pnpm eval:retrieval:smoke
rtk pnpm eval:retrieval:core
rtk pnpm eval:smoke
```

### 成功判据

最小成功标准：

- [ ] v2 smoke / core 全通过
- [ ] 无 governance leak
- [ ] v2 baseline 关键 case 无明显退化
- [ ] 至少有一类 previously weak case 获得稳定提升

---

## 🚩 Feature Flag 与灰度方案

### 推荐新增开关

| 开关 | 用途 |
|------|------|
| `RETRIEVAL_V2_MULTI_RECALL` | 总开关 |
| `RETRIEVAL_V2_CAPSULE_KEYWORD` | keyword 通道开关 |
| `RETRIEVAL_V2_CAPSULE_SEMANTIC` | semantic 通道开关 |
| `RETRIEVAL_V2_CAPSULE_GRAPH` | graph 通道开关 |
| `RETRIEVAL_V2_CAPSULE_PG_SEARCH` | PG recall 开关 |

### 灰度顺序建议

1. `heuristic` only，新 coordinator 落地
2. 打开 `keyword`
3. 打开 `semantic`
4. 打开 `PG search`
5. 最后打开 `graph`

### 熔断策略

当某个通道异常时：

- [ ] 单通道失败不应导致整个 v2 请求失败
- [ ] 自动降级到剩余通道 + heuristic fallback
- [ ] trace 中记录通道失败和 fallbackApplied

---

## 📦 分阶段实施计划

### Phase 0: Baseline 冻结与缺口补样（1-2 天）✅ 已完成

**目标**: 先把"现在的 v2 到底表现如何"量化清楚，避免后续无法判断收益。

#### 任务清单

- [x] **0-1: 冻结当前 baseline 指标**
  - [x] 运行 `rtk pnpm eval:retrieval:smoke`
  - [x] 运行 `rtk pnpm eval:retrieval:core`
  - [x] 记录当前 v2 的 Hit@1、Hit@5、MRR、nDCG、Recall@10
  - [x] 保存 baseline 报告文件

- [x] **0-2: 审视当前 v2 用例覆盖缺口**
  - [x] 识别 keyword-dominant 场景是否不足 → **不足**：缺少错误文本、文件路径、精确标签匹配用例
  - [x] 识别 semantic paraphrase 场景是否不足 → **不足**：缺少同义不同词（口语化 vs 术语）用例
  - [x] 识别 graph-assisted-v2 场景是否不足 → **不足**：graph 通道尚未接入 v2，Phase 5 目标
  - [x] 识别 mixed-channel 场景是否不足 → **不足**：缺少多通道命中/去重验证用例

- [x] **0-3: 为多路召回补充目标用例**
  - [x] 在 `evals/retrieval/datasets/core/` 添加新 case（5 个）
  - [x] 在 `evals/retrieval/scenarios/` 补充 fixture（3 个新 scenario）
  - [x] 增加 trace / channel 行为断言准备（当前 v2 为 heuristic-only，后续 Phase 1-4 将逐步添加 channel 行为断言）

#### 注意事项

- [x] 这一步先不改主实现
- [x] baseline 文件必须可重复生成
- [x] 新增 case 应覆盖"当前 v2 明显不擅长"的场景

#### 交付物

- [x] baseline 报告（`reports/phase0-baseline-report.md`、`reports/baseline-v2-core.json`）
- [x] 新增/更新的 v2 retrieval eval cases（5 个新 case + 3 个新 scenario）
- [x] 书面记录当前弱点（见 Phase 0-2 缺口分析）

#### 对应文档更新

- [x] `evals/retrieval/README.md`：补充新增 v2 case 类型与运行方式
- [x] `docs/operations/TESTING.md`：补充 v2 baseline 与新增评测切片说明

#### 对应测试代码更新

- [x] `evals/retrieval/runner.test.ts`：无需变更（未新增过滤/baseline/trace行为）
- [x] `packages/server/src/routes/retrieval.test.ts`：无需变更（未修改服务端代码）

#### 对应 Eval 组件更新

- [x] `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts`：无需变更（smoke 层不新增多通道用例）
- [x] `evals/retrieval/datasets/core/v2-retrieval-core.ts`：已新增 5 个 case
- [x] `evals/retrieval/scenarios/` 中新增 keyword / semantic / graph / mixed 场景：已新增 3 个 scenario
- [x] `evals/retrieval/lib/normalize.ts`：无需变更（归一化逻辑暂不需要扩展）

#### Phase 0 完成检查

##### 代码质量
- [x] `rtk pnpm typecheck` 通过
- [x] `rtk pnpm lint` 通过
- [x] `rtk pnpm test` 通过（无相关单元测试变更）

##### 检索验证
- [x] `rtk pnpm eval:retrieval:smoke` 通过（15/15，100%）
- [x] `rtk pnpm eval:retrieval:core` 通过（24/26，92.3%，2 个预存问题与本次变更无关：v1-low-maxresults-core、v2-label-filter-core）

##### v2 Baseline 指标
| 指标 | Smoke | Core |
|------|-------|------|
| Hit@1 | 0.60 | 0.86 |
| Hit@5 | 0.60 | 0.86 |
| Hit@10 | 0.60 | 0.86 |
| MRR | 0.60 | 0.86 |
| nDCG | 0.60 | 0.86 |
| Recall@10 | 0.60 | 0.86 |

##### 新增文件
- `reports/phase0-baseline-report.md` - 基线报告与覆盖缺口分析
- `reports/baseline-v2-core.json` - 机器可读基线

##### 签字确认
- 实现者签名: 开发者
- 日期: 2026-05-23

---

### Phase 1: v2 召回架构解耦（1-2 天）

**目标**: 先把 v2 的召回逻辑从 orchestrator 中拆成独立 coordinator 和 channel 模型，但行为保持与当前一致。

#### 任务清单

- [ ] **1-1: 定义 capsule recall 类型**
  - [ ] 新增 `CapsuleRecallChannel`
  - [ ] 新增 `CapsuleRecallCandidate`
  - [ ] 新增 `MergedCapsuleCandidate`
  - [ ] 定义 channel score / reason / evidence 结构

- [ ] **1-2: 新增 capsule channel registry**
  - [ ] 创建 `capsule-channel-registry.ts`
  - [ ] 支持注册、获取、枚举通道
  - [ ] 明确重复注册和启动失败行为

- [ ] **1-3: 新增 capsule recall coordinator**
  - [ ] 创建 `capsule-recall-coordinator.ts`
  - [ ] 支持调用 configured channels
  - [ ] 支持 merge 和 rerank 的 seam
  - [ ] 支持 pipeline steps 记录

- [ ] **1-4: 将 `searchKnowledgeV2()` 切到 coordinator**
  - [ ] 保持 route / response / summary / activation hints 不变
  - [ ] 默认只启用 `capsule-heuristic`
  - [ ] 输出与现状尽量一致

#### 注意事项

- [ ] 这是架构切缝阶段，不追求收益，只追求行为稳定
- [ ] 若此阶段引入排序漂移，后续调优成本会显著上升

#### 交付物

- [ ] 新 coordinator
- [ ] 新 channel registry
- [ ] `searchKnowledgeV2()` 改为调用 coordinator

#### 对应文档更新

- [ ] `docs/architecture/components/RETRIEVAL.md`：更新 v2 主流程图和 orchestrator/coordinator 职责
- [ ] 本计划文档：记录 Phase 1 实际实现偏差与完成日期

#### 对应测试代码更新

- [ ] `packages/server/src/lib/retrieval.test.ts`：补 v2 orchestration 行为回归
- [ ] `packages/server/src/routes/retrieval.test.ts`：确保 `/v2/retrieval/search` 契约未变
- [ ] 为新 `capsule-channel-registry` / `capsule-recall-coordinator` 补单测

#### 对应 Eval 组件更新

- [ ] 检查 `evals/retrieval/lib/adapters.ts` 是否仍能直接调用 v2
- [ ] 检查 `evals/retrieval/lib/normalize.ts` 是否受 trace 字段变化影响
- [ ] 若无结构变化，可记录“无需修改”的确认结果

---

### Phase 2: Keyword 通道落地（2-3 天）

**目标**: 为 v2 引入第一条真正独立的 recall channel，并尽快获得一类明确收益。

#### 任务清单

- [ ] **2-1: 抽公共 lexical util**
  - [ ] 复用或抽取 v1 的 `tokenize` / `normalizeQuery`
  - [ ] 避免 v1 与 v2 分叉出两套 token 规则

- [ ] **2-2: 实现内存版 capsule keyword recall**
  - [ ] 支持 `content/situation/problem/goal/labels/contextualPrefix`
  - [ ] 支持字段权重
  - [ ] 支持 matched token evidence

- [ ] **2-3: 实现 `capsule-keyword` channel**
  - [ ] 独立返回 topN capsule candidates
  - [ ] 不参与最终 assembly，只进入 merge 层

- [ ] **2-4: 实现 PG 版 capsule keyword recall**
  - [ ] 设计 `skill_artifact_capsule_keywords` 表
  - [ ] 编写 schema / migration
  - [ ] 编写 repository / query adapter
  - [ ] 在 PG 可用时优先走 DB recall

- [ ] **2-5: 接入评测**
  - [ ] 添加 keyword-dominant smoke/core 用例
  - [ ] 验证 recall 提升与 governance 正确性

#### 注意事项

- [ ] 先做“字段正确、证据清晰”，再做复杂优化
- [ ] contextualPrefix 参与 lexical recall，但权重不应过高
- [ ] 错误文本命中应被视为高价值信号

#### 交付物

- [ ] capsule keyword recall 实现
- [ ] capsule keyword PG query 实现
- [ ] 对应评测用例与测试

#### 对应文档更新

- [ ] `docs/architecture/components/RETRIEVAL.md`：新增 `capsule-keyword` 通道说明、字段权重、fallback 逻辑
- [ ] `docs/operations/TESTING.md`：补 keyword-dominant 用例与运行建议
- [ ] 若新增 feature flag，更新 `docs/operations/ENVIRONMENT.md`
- [ ] 若新增索引表，更新 Schema 文档

#### 对应测试代码更新

- [ ] `packages/server/src/lib/retrieval/capsules/channels/keyword.test.ts`
- [ ] `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-keyword.test.ts`（若存在 PG repo）
- [ ] `packages/server/src/routes/retrieval.test.ts`：新增 keyword 命中、governance、fallback 断言
- [ ] `packages/server/src/lib/validation/*`：新增 schema/table presence 校验（若建表）

#### 对应 Eval 组件更新

- [ ] `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts`：补 smoke 级 keyword case
- [ ] `evals/retrieval/datasets/core/v2-retrieval-core.ts`：补 core 级 keyword-dominant case
- [ ] `evals/retrieval/scenarios/`：补术语、报错、路径词场景
- [ ] 必要时更新 `evals/retrieval/lib/metrics.ts` 的切片汇总标签

---

### Phase 3: Semantic 通道落地（2-3 天）

**目标**: 为 v2 提供稳定的语义补召回能力。

#### 任务清单

- [ ] **3-1: 设计 capsule embedding text builder**
  - [ ] 明确字段拼接顺序
  - [ ] 控制 content 长度
  - [ ] 设计 contentHash

- [ ] **3-2: 实现内存版 semantic recall**
  - [ ] query embedding
  - [ ] capsule embedding 获取或计算
  - [ ] cosine similarity + normalization

- [ ] **3-3: 设计 capsule vector index**
  - [ ] 新增 `skill_artifact_capsule_embeddings`
  - [ ] 支持 revision / contentHash / status 跟踪
  - [ ] 支持 PG vector query

- [ ] **3-4: 实现 `capsule-semantic` channel**
  - [ ] memory fallback
  - [ ] PG search path
  - [ ] 通道级错误降级

- [ ] **3-5: 接入评测**
  - [ ] 添加 paraphrase / semantic-only 命中场景
  - [ ] 确认对 baseline top1 不产生明显伤害

#### 注意事项

- [ ] 语义召回会提升 recall，但可能拉进噪音候选
- [ ] 所以后续 rerank 必须保留足够强的 problem/situation 精排

#### 交付物

- [ ] capsule semantic recall 实现
- [ ] capsule vector index 设计与接线
- [ ] semantic-focused 评测结果

#### 对应文档更新

- [ ] `docs/architecture/components/RETRIEVAL.md`：新增 `capsule-semantic` 通道、embedding text builder、memory/PG fallback
- [ ] `docs/operations/ENVIRONMENT.md`：若新增向量检索或开关配置
- [ ] Schema 文档：若新增 capsule embeddings 索引表
- [ ] `docs/operations/TESTING.md`：补 semantic-dominant 回归说明

#### 对应测试代码更新

- [ ] `packages/server/src/lib/retrieval/capsules/channels/semantic.test.ts`
- [ ] `packages/server/src/lib/retrieval/capsules/repositories/pg-capsule-vector.test.ts`
- [ ] `packages/server/src/routes/retrieval.test.ts`：补 paraphrase 命中与 fallback 断言
- [ ] `packages/server/src/lib/validation/*`：新增 embeddings 表结构校验（若建表）

#### 对应 Eval 组件更新

- [ ] `evals/retrieval/datasets/core/v2-retrieval-core.ts`：新增 semantic-dominant / paraphrase case
- [ ] `evals/retrieval/scenarios/`：新增“表达不同但语义一致”的场景
- [ ] 若 summary/normalize 受排序结构影响，检查 `evals/retrieval/lib/normalize.ts`

---

### Phase 4: Merge 与 Rerank 正式落地（1-2 天）

**目标**: 让多通道结果真正变成“一个合理的最终排序”，而不是简单拼接。

#### 任务清单

- [ ] **4-1: 实现 capsule merge 层**
  - [ ] dedupe by capsuleId
  - [ ] 保留 `channelScores`
  - [ ] 生成 `preRerankScore`
  - [ ] 支持 RRF 或 normalized sum

- [ ] **4-2: 拆分现有 `rankCapsules()`**
  - [ ] 抽出 feature calculators
  - [ ] 抽出 reason fragments
  - [ ] 抽出 final rerank function

- [ ] **4-3: 实现 `rerankMergedCapsules()`**
  - [ ] problem / situation / goal / context / error / stackPath 特征
  - [ ] 计算 `finalScore`
  - [ ] 生成 explainable reason

- [ ] **4-4: 记录 trace**
  - [ ] `channelsPlanned`
  - [ ] `channelsUsed`
  - [ ] pre/post merge candidate counts

#### 注意事项

- [ ] `rankCapsules()` 不应继续承担 recall、merge、rerank 三件事
- [ ] 需要保留 backward-compatible reason 风格，避免 CLI 输出突然异常

#### 交付物

- [ ] merge 层
- [ ] rerank 层
- [ ] 新 trace 字段

#### 对应文档更新

- [ ] `docs/architecture/components/RETRIEVAL.md`：新增 merge/rerank 两阶段结构与 reason 生成方式
- [ ] `docs/operations/TESTING.md`：新增 mixed-channel、top1 stability、regression safety 检查建议
- [ ] 若 trace 字段成为稳定输出，更新 API / logging 相关文档

#### 对应测试代码更新

- [ ] `packages/server/src/lib/retrieval/capsules/scoring/merge.test.ts`
- [ ] `packages/server/src/lib/retrieval/capsules/scoring/rerank.test.ts`
- [ ] `packages/server/src/lib/retrieval/capsules/scoring/reasons.test.ts`
- [ ] `packages/server/src/routes/retrieval.test.ts`：补 channelsUsed / trace / top1 稳定性断言

#### 对应 Eval 组件更新

- [ ] `evals/retrieval/datasets/core/v2-retrieval-core.ts`：新增 mixed-channel case
- [ ] `evals/retrieval/lib/normalize.ts`：若 trace 进入评测归一化面
- [ ] `evals/retrieval/run.ts` / reporting：若新增基于 channel 的对比统计

---

### Phase 5: Graph 通道接入（2-3 天）

**目标**: 利用 skill graph 做结构化扩召回，但控制复杂度。

#### 任务清单

- [ ] **5-1: 明确 graph recall 粒度**
  - [ ] 定义 artifact-level graph hit 如何映射到 capsules
  - [ ] 定义 edge 类型与 boost 规则

- [ ] **5-2: 实现 graph recall adapter**
  - [ ] 读取 skill graph documents
  - [ ] 基于 seed / extracted concepts / dependencies 检索
  - [ ] 输出 artifact 或 capsule candidates

- [ ] **5-3: 接入 `capsule-graph` channel**
  - [ ] 允许通道补召回
  - [ ] 不允许图结果独占最终排序

- [ ] **5-4: 增加 graph-assisted-v2 评测**
  - [ ] 前置技能场景
  - [ ] 依赖链场景
  - [ ] 共现场景

#### 注意事项

- [ ] 首版避免 capsule-to-capsule 图建模
- [ ] graph recall 更像 recall augmentation，不是答案裁决器

#### 交付物

- [ ] `capsule-graph` channel
- [ ] graph-assisted-v2 eval cases

#### 对应文档更新

- [ ] `docs/architecture/components/RETRIEVAL.md`：新增 `capsule-graph` 通道、artifact-to-capsule 映射策略
- [ ] 若 graph routing / skill graph 细节有新增，补对应 graph/architecture 文档
- [ ] `docs/operations/TESTING.md`：补 graph-assisted-v2 评测说明

#### 对应测试代码更新

- [ ] `packages/server/src/lib/retrieval/capsules/channels/graph.test.ts`
- [ ] 必要时补 `packages/server/src/lib/indexing/adapters/artifact-graph.test.ts`
- [ ] `packages/server/src/routes/retrieval.test.ts`：补 graph 扩召回、非主导排序、governance 断言

#### 对应 Eval 组件更新

- [ ] `evals/retrieval/datasets/core/v2-retrieval-core.ts`：新增 graph-assisted-v2 case
- [ ] `evals/retrieval/scenarios/`：补前置技能、依赖链、共现场景
- [ ] 必要时更新 `evals/retrieval/lib/governance.ts` 以覆盖 graph 泄漏场景

---

### Phase 6: 索引同步与运维补齐（1-2 天）

**目标**: 让多路召回不仅能工作，而且可持续维护。

#### 任务清单

- [ ] **6-1: 梳理索引同步触发点**
  - [ ] artifact publish
  - [ ] artifact approve/review state change
  - [ ] derive outputs 更新

- [ ] **6-2: 完善同步状态与失败跟踪**
  - [ ] status
  - [ ] lastError
  - [ ] contentHash
  - [ ] revisionNo

- [ ] **6-3: 补运维与修复路径**
  - [ ] 批量重建命令或脚本
  - [ ] 局部重试
  - [ ] 数据对账说明

- [ ] **6-4: 明确 fallback 策略**
  - [ ] PG recall 不可用时如何退到 memory
  - [ ] 单通道失败时如何保证 v2 仍可用

#### 注意事项

- [ ] 运维缺口不补齐，多路召回上线后会逐渐漂移
- [ ] 需要把“重建索引的代价和入口”写进文档

#### 交付物

- [ ] 索引同步设计落地
- [ ] 运维文档与重建说明

#### 对应文档更新

- [ ] Schema 文档：记录新增索引表、字段和唯一键
- [ ] `docs/operations/ENVIRONMENT.md`：记录索引同步或 PG recall 相关配置
- [ ] `docs/operations/TESTING.md`：补 PG 集成测试 / 索引重建验证说明
- [ ] `docs/architecture/components/RETRIEVAL.md`：补索引同步触发点与 fallback 行为

#### 对应测试代码更新

- [ ] `packages/server/src/lib/validation/*`：补表结构和列存在性测试
- [ ] 索引同步相关单测 / 集成测试
- [ ] 若有重建命令或脚本，补对应测试或 dry-run 验证

#### 对应 Eval 组件更新

- [ ] 评测主逻辑通常无需变更，但需确认 PG 路径下 eval 结果可复现
- [ ] 如有必要，记录在 `evals/retrieval/README.md` 中的 PG 执行说明

---

### Phase 7: 灰度发布与回归收口（1 天）

**目标**: 控制上线风险，完成正式收口。

#### 任务清单

- [ ] **7-1: 加 feature flag**
  - [ ] 总开关
  - [ ] 单通道开关
  - [ ] PG recall 开关

- [ ] **7-2: 形成灰度顺序**
  - [ ] 先 heuristic-only
  - [ ] 再 keyword
  - [ ] 再 semantic
  - [ ] 再 graph

- [ ] **7-3: 最终回归**
  - [ ] `rtk pnpm test`
  - [ ] `rtk pnpm typecheck`
  - [ ] `rtk pnpm check`
  - [ ] `rtk pnpm eval:retrieval:smoke`
  - [ ] `rtk pnpm eval:retrieval:core`

- [ ] **7-4: 对比 baseline**
  - [ ] 记录改动前后关键指标
  - [ ] 记录收益场景
  - [ ] 记录残留风险

#### 注意事项

- [ ] graph 通道建议最后再开
- [ ] 若 keyword + semantic 已足够收益，可延后 graph 正式启用

#### 交付物

- [ ] 灰度配置
- [ ] baseline 对比报告
- [ ] 残留风险清单

#### 对应文档更新

- [ ] `docs/operations/ENVIRONMENT.md`：补 feature flag 与推荐灰度顺序
- [ ] `docs/operations/TESTING.md`：补最终回归命令和 baseline 对比要求
- [ ] `evals/retrieval/README.md`：补 baseline 比较、切片说明、必要时 trace 说明
- [ ] 本计划文档：填写阶段完成情况和残留风险

#### 对应测试代码更新

- [ ] `packages/server/src/routes/retrieval.test.ts`：补 feature flag 开关、单通道熔断、fallback 行为
- [ ] 必要时补 config / routing 相关测试

#### 对应 Eval 组件更新

- [ ] `evals/retrieval/run.ts`：如 baseline 比对、trace 输出或切片统计有新增能力
- [ ] `evals/retrieval/lib/types.ts` / reporting：如新增对 channel 或 route family 的展示
- [ ] 确保 smoke/core/baseline 模式均能覆盖多路召回上线前后的对比

---

## 🧪 示例结构

### 示例 1：目标内部类型

```typescript
export type CapsuleRecallChannel =
  | 'capsule-semantic'
  | 'capsule-keyword'
  | 'capsule-graph'
  | 'capsule-heuristic';

export interface CapsuleRecallCandidate {
  capsuleId: string;
  artifactId: string;
  revision: number;
  channel: CapsuleRecallChannel;
  score: number;
  matchedTokens?: string[];
  graphEvidence?: string[];
}

export interface MergedCapsuleCandidate {
  capsuleId: string;
  artifactId: string;
  revision: number;
  channels: CapsuleRecallChannel[];
  channelScores: Partial<Record<CapsuleRecallChannel, number>>;
  preRerankScore: number;
  finalScore: number;
  reason: string;
}
```

### 示例 2：v2 新编排结构

```typescript
const parsed = retrievalV2QuerySchema.parse(query);
const intent = parseSeedIntent(parsed.seed);
const governed = shortlistGovernedCapsules(data.skillArtifacts, auth, parsed.filters);

const recalled = await capsuleRecallCoordinator.execute({
  seed: parsed.seed,
  intent,
  governed,
  maxResults: parsed.maxResults,
});

const capsules = recalled.finalCandidates.map((candidate) =>
  buildCapsuleMatch(candidate.capsule, candidate),
);

return buildV2RetrievalResponse(capsules, profileHints, summary, activationHints);
```

### 示例 3：merge 后的 reason

```text
Matched via semantic + keyword; strong problem match (84%), context match (58%), stack/path boost
```

### 示例 4：评测新增 case 方向

```typescript
export const v2KeywordDominantCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-keyword-dominant-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'pnpm workspace lockfile mismatch frozen-lockfile',
    maxResults: 5,
  },
  scenarioId: 'keyword-dominant-skill-scenario',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_pnpm_lockfile_fix'],
      idealOrder: ['capsule_core_pnpm_lockfile_fix'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
  },
});
```

---

## ⚠️ 主要风险与应对

### 风险 1：Recall 提升但 Top1 下降

**表现**：

- Recall@10 提升
- Hit@1 / MRR 下降

**应对**：

- [ ] merge 后必须有独立 rerank
- [ ] 保留 heuristic 精排特征
- [ ] baseline 对比重点关注 Top1 稳定性

### 风险 2：Contextual Prefix 权重过高

**表现**：

- query 被 LLM 生成上下文误导
- lexical / semantic 都更偏向 prefix，而不是核心问题

**应对**：

- [ ] contextScore 保持中低权重
- [ ] problemScore 继续作为最强排序因子

### 风险 3：Graph 通道扩召回过头

**表现**：

- 相关 artifact 被引入，但 capsule 层不精准
- 最终排序噪音增加

**应对**：

- [ ] graph 首版只做补召回
- [ ] artifact hit 后仍要 capsule 内 rerank
- [ ] 默认低权重

### 风险 4：PG / memory 双实现行为不一致

**表现**：

- 本地测试通过，生产排序漂移
- 某些 token / scope / governance 条件在 DB 查询中实现不一致

**应对**：

- [ ] 同一组 golden cases 对 memory / PG 两种路径跑对比
- [ ] 把 governance 过滤规则写成明确断言

### 风险 5：治理泄漏

**表现**：

- 某个通道提前看到 forbidden capsule
- merge 层未完全过滤掉

**应对**：

- [ ] 所有通道输入必须已治理过滤，或 SQL 等价过滤
- [ ] governance eval 必须始终失败

---

## ✅ 推荐实施顺序总结

最推荐的落地顺序如下：

1. Phase 0：冻结 baseline，补齐缺口用例
2. Phase 1：先拆架构，只保留 heuristic 通道
3. Phase 2：接 keyword，先拿到第一类明确收益
4. Phase 3：接 semantic，补足表达差异召回
5. Phase 4：完成 merge/rerank 正式分层
6. Phase 5：最后接 graph 通道
7. Phase 6-7：补齐索引同步、灰度和回归收口

这个顺序的好处是：

- 风险分散
- 每一阶段都可回滚
- 每一阶段都能通过评测验证真实收益
- 不需要一次性大重写 v2

---

## 📌 最终验收标准

项目整体完成时，至少应满足以下条件：

- [ ] `/v2/retrieval/search` 仍保持现有主契约兼容
- [ ] v2 已具备至少 keyword + semantic + heuristic 三通道召回
- [ ] graph 通道已接入或具备可灰度启用能力
- [ ] 召回与精排已分层，`rankCapsules()` 不再承担全部职责
- [ ] 有可观测的 `channelsPlanned` / `channelsUsed`
- [ ] 有 capsule 侧评测覆盖多通道互补场景
- [ ] 无治理回归
- [ ] baseline 对比显示核心场景无明显退化，且至少一类弱场景显著提升
- [ ] 修改后的对应文档、测试代码、eval 组件都已同步更新并通过验证

---

## 附录：实施时重点关注的文件

### 代码

- `packages/server/src/routes/retrieval.ts`
- `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- `packages/server/src/lib/retrieval/capsules/capsule-recall.ts`
- `packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
- `packages/server/src/lib/retrieval/recall/keyword.ts`
- `packages/server/src/lib/retrieval/recall/pg-keyword.ts`
- `packages/server/src/lib/indexing/adapters/artifact-graph.ts`
- `packages/server/src/lib/persistence/schema.ts`

### 评测

- `evals/retrieval/README.md`
- `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts`
- `evals/retrieval/datasets/core/v2-retrieval-core.ts`
- `docs/operations/TESTING.md`

### 文档

- `docs/architecture/components/RETRIEVAL.md`
- `docs/reference/api-surface.md`
- `docs/operations/ENVIRONMENT.md`
