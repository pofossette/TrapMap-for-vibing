# v2 / v3 检索改进实现文档

## 状态总览

- [x] 实现文档已创建
- [x] v2 方案已确认
- [x] v3 方案已确认
- [x] 实现开始
- [ ] 所有评测通过

## 当前状态说明

- 当前文档已进入仓库，可作为执行清单直接维护。
- 本文档承载 `v2` 检索多路扩展方案与 `v3` 底层优先改进方案。
- **v2 和 v3 均已在代码中实现。** v2 入口 `searchKnowledgeV2()` 位于 `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`，通过 `CapsuleRecallCoordinator` 实现多路召回（heuristic / keyword / semantic / graph 四通道）。v3 入口 `searchKnowledgeGraphPlan()` 位于 `packages/server/src/lib/retrieval/graph-plan/graph-plan-search.ts`，包含置信度评估与自动 fallback。路由 `/v2/retrieval/search`、`/v3/retrieval/search`、`/v3/retrieval/plan` 均已在 `packages/server/src/routes/retrieval.ts` 中注册。
- 本文档中 Phase A-E（v2 多路召回）与 Phase F-I（v3 改进）的核心能力已落地，后续可继续迭代评测指标和候选质量。
- 默认原则：先保持公共请求/响应契约稳定，再增强服务端内部 candidate generation、rerank、trace 与评测。

## 背景与当前管道分析

### v2 当前管道

- `v2` 入口是 `searchKnowledgeV2()`，位于 `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`。
- 请求契约是 `retrievalV2QuerySchema`，客户端输入仍保持 `seed + filters + maxResults + includeSummary`。
- `v2` 当前 recall 阶段通过 `CapsuleRecallCoordinator` 实现多路召回（`packages/server/src/lib/retrieval/capsules/capsule-recall-coordinator.ts`），支持 `heuristic`、`keyword`、`semantic`、`graph` 四个通道。
- `rankCapsules(...)` 仍存在于 `packages/server/src/lib/retrieval/capsules/capsule-recall.ts`，供 heuristic channel 内部使用。
- `v2` 当前 `routingTrace.channelsUsed` 在 `searchKnowledgeV2()` 内由 `CapsuleRecallCoordinator` 返回的 `channelsUsed` 填充，准确反映实际参与的通道。
- `v2` 原有风险（同义表达召回弱、error-only query 覆盖不足等）已通过多路召回（semantic + keyword + graph channels）缓解。后续可继续通过评测指标验证改进效果。

### v2 目标（已实现）

- 在不破坏现有请求契约的前提下，引入多路 capsule recall。**已实现：heuristic / keyword / semantic / graph 四通道。**
- 保留现有 governance 过滤顺序。**已实现。**
- 保留现有响应形状和路由语义。**已实现。**
- 首版不改 `v2` 公共请求/响应契约，只增强服务端内部候选生成、融合重排与 trace。**已实现。**

### v3 当前管道

- `v3` 对外入口是 `searchKnowledgeGraphPlan()`，位于 `packages/server/src/lib/retrieval/graph-plan-search.ts`。
- `v3` 不是独立 recall engine，而是：
  - `compileTrapFirstPlan()`
  - readiness / confidence assessment
  - fallback wrapper
- `searchKnowledgeGraphPlan()` 当前主要职责是：
  - 解析 `graphPlanSearchQuerySchema`
  - 编译 plan
  - 做 confidence bucket 判断
  - fallback 到 `v2-capsule` 或 `v1-graph-assisted`
- `v3` 的真实上限受两件事约束：
  - `plan-compiler` 里 skill candidates 的质量
  - trap seed / graph seed 的覆盖质量
- `plan-compiler` 当前 trap 侧偏“治理过滤后全量入种子”。
- `plan-compiler` 当前 skill 侧通过 `CapsuleRecallCoordinator` 复用 `v2` 多路召回能力。
- 原有主要问题（底层候选选择过粗、skill / trap seed 质量不足等）已通过多路召回和 plan-compiler 改进缓解。置信度评估已实现在 `assessGraphPlanReadiness()` 中。

### v3 目标（已实现）

- 提升 `plan-compiler` 的候选质量与 plan readiness 判断质量。**已实现。**
- 让 wrapper 仅做最小必要调整。**已实现。**
- 不在首版中重构 `v3` 对外响应形状。**已实现。**
- 不新增新的 fallback target。**已实现。**
- `v3` 的收益主要来自底层候选质量改进，而不是 wrapper 策略大改。**已实现。**

## v2 改进方案

### Phase A: 通道建模与内部类型

- [x] 定义 capsule recall 通道集合（实际实现：`heuristic`、`keyword`、`semantic`、`graph`）
- [x] 为 capsule candidate 增加通道来源与 per-channel score 表达（`CapsuleRecallCandidate`、`MergedCapsuleCandidate`）
- [x] 明确 `routingTrace.channelsUsed` 的映射值
- [x] 如果 contracts 现有 union 无法精确表达内部通道，则对外使用兼容映射，对内日志保留精细值
- [x] 保持 `retrievalV2QuerySchema` 不变，不新增客户端输入字段

### Phase B: semantic capsule recall

- [x] 为 capsule / profile 选择 embedding 文本拼接策略
- [x] 设计 embedding 来源优先级：缓存优先、缺失时降级
- [x] 决定首版是否只做 in-memory semantic recall，还是兼容 PG/vector 搜索（双路径：PG vector + in-memory fallback）
- [x] 产出 semantic top K 候选，独立于旧 `rankCapsules`（`CapsuleSemanticChannel`）
- [x] 明确 semantic recall 在无 embedding、embedding 缺失或 provider 不可用时的稳定退化路径

### Phase C: profile / path recall

- [x] 基于 `profileHints`、artifact labels、stack / path hints 设计 profile 通道召回（heuristic channel 承载）
- [x] 让 profile 通道更偏”先拉候选”，不直接决定最终排序
- [x] 明确该通道的适用输入：stack-heavy、path-heavy、capability-heavy query
- [x] 定义 path / stack 命中的最低触发标准，避免过宽召回污染 rerank

### Phase D: 融合与 rerank

- [x] 对多路候选做去重 union（`mergeCapsuleCandidates`）
- [x] 设计统一 candidate score 模型，保留每路原始分数用于审计
- [x] 在 rerank 中继续使用现有信号（`rerankMergedCapsules`）
- [x] 约束 top K 截断位置：先扩大召回，再统一截断 `maxResults`
- [x] 为空结果和单路命中场景保留稳定降级路径

### Phase E: 观测性与 trace

- [x] 在 `routingTrace` 中准确反映实际贡献通道
- [x] 在 RAG log 中记录 recall 阶段的通道命中分布（`channelsPlanned`、`channelsUsed`、`channelsFailed`、`mergeStats`）
- [x] 明确空结果时 `channelsUsed` 的语义
- [x] 补充”多路有候选但最终单路胜出”的日志说明

### v2 默认决策

- [x] 首版不改 `v2` 公共请求/响应契约
- [x] 首版不改 `/v2/retrieval/search` 路由路径和基本语义
- [x] 首版仅增强服务端内部候选生成与 trace

## v3 改进方案

### Phase F: plan-compiler 候选源重构

- [x] trapCandidates 从”全量 eligible”改为”相关 trap shortlist”
- [x] skillCandidates 改为复用 `v2` 多路 capsule recall 能力（通过 `CapsuleRecallCoordinator`），而不是单独调用旧 `rankCapsules`
- [x] 为 graph seed node 构造增加候选上限与优先级控制
- [x] 区分”相关但未入选”和”完全未召回”的技能 / 陷阱，用于 citations 或调试信息

### Phase G: graph seed 与 expansion 控制

- [x] 为 trap seed 和 skill seed 分别设上限，避免 expansion 污染
- [x] 明确 `seedNodeIds` 的优先级顺序
- [x] 校准 `maxDepth` 的默认语义与 budget 的关系
- [x] 对多 trap / 多 skill / 稀疏图场景定义稳定行为

### Phase H: readiness / confidence 评估增强

- [x] 保留现有 `skillCount / trapCount / structure / evidence` 框架（`assessGraphPlanReadiness`）
- [x] 增加候选相关性或图命中强度信号，避免”结构完整但相关性差”也被判高置信
- [x] 明确 plan compile 失败、空 plan、弱 plan 的区分标准
- [x] 重新定义 fallback 触发条件与原因码，使其更贴近真实失败原因

### Phase I: wrapper 最小配套

- [x] 保持 `/v3/retrieval/search` 请求契约不变
- [x] 保持 `fallbackMode` 语义不变
- [x] 仅在 `routingTrace` 和日志上补足底层来源信息
- [x] 维持对 `v2-capsule` / `v1-graph-assisted` fallback 的兼容行为

## Public APIs / Interfaces / Types

### 保持不变

- [x] `retrievalV2QuerySchema`
- [x] `retrievalV2ResponseWithHintsSchema`
- [x] `graphPlanSearchQuerySchema`
- [x] `graphPlanSearchResponseSchema`
- [x] `/v2/retrieval/search` 路由路径和基本语义
- [x] `/v3/retrieval/search` 路由路径和基本语义

### 允许内部扩展

- [x] retrieval 内部 candidate / merged candidate 类型
- [x] capsule recall 内部 channel metadata
- [x] `plan-compiler` 的中间候选模型
- [x] RAG log 中的 metadata 字段
- [x] `routingTrace.channelsUsed` 的填充逻辑

### 如需 contract 变更时的默认原则

- [x] 首版仅允许 additive 变更
- [x] 若现有 `channelsUsed` union 不能准确表达新通道，优先在内部日志保留精细值，对外 trace 使用兼容映射
- [x] 不为 `v2` / `v3` 首版改造引入新的客户端必填字段

## 评测与验收计划

### v2 评测补强

- [ ] 新增同义表达低词面重叠用例
- [ ] 新增 error-only query 用例
- [ ] 新增 path-only / stack-only query 用例
- [ ] 新增 profile 通道主导命中的用例
- [ ] 新增多路召回后排序稳定性用例
- [ ] 验证 governance 场景在多路召回下仍无泄漏

### v3 评测补强

- [ ] 新增 trap shortlist 正确裁剪用例
- [ ] 新增 skill shortlist 改善后 plan 选中率用例
- [ ] 新增 compile 低相关弱结构 plan 应 fallback 的用例
- [ ] 新增 compile 失败与低置信 plan 的区别用例
- [ ] 验证 fallback 到 `v2` 与 `v1` 两条路径仍保持现有契约

### 单测 / 集成层

- [x] capsule recall 新通道单测（heuristic / keyword / semantic / graph channel 测试已存在）
- [x] 通道融合与去重单测（`merge.test.ts`、`rerank.test.ts`）
- [x] `routingTrace` / `channelsUsed` 单测（`routing.test.ts`）
- [x] `plan-compiler` 候选选择单测（`plan-compiler.test.ts`）
- [x] graph-plan readiness 打分单测（`graph-plan-search.test.ts`）

### 验收标准

- [ ] `v2` 新增评测切片中，Hit@1 / MRR 相比当前基线不回退（待评测运行验证）
- [ ] `v3` graph-plan selected 场景的 plan 选中率提升或更稳定（待评测运行验证）
- [ ] governance 用例零泄漏（待评测运行验证）
- [x] 现有 `/v2`、`/v3` 契约测试全部通过

## 风险与回滚 / 兼容性说明

- [x] 多路召回可能提升 recall 但拉低 precision，已通过 rerank 和 budget 控制抑制噪声
- [x] semantic recall 若依赖 embedding 完整性，已提供缓存缺失时的安全退化路径
- [x] `v3` 若过度放宽 seed expansion，已通过 seed 上限和 budget 控制避免 graph 污染
- [x] 首版已稳定表达细粒度通道来源，对外保持兼容 trace，对内日志补足调试信息
- [x] 契约保持稳定，未出现行为漂移

## 实施进度 Checklist

### 阶段状态

- [x] Phase A 完成
- [x] Phase B 完成
- [x] Phase C 完成
- [x] Phase D 完成
- [x] Phase E 完成
- [x] Phase F 完成
- [x] Phase G 完成
- [x] Phase H 完成
- [x] Phase I 完成

### 执行顺序建议

- [x] 先完成 Phase A，冻结内部类型与 trace 映射
- [x] 再完成 Phase B / C，建立多路候选生成
- [x] 再完成 Phase D / E，打通融合、日志与可观测性
- [x] 然后推进 Phase F / G / H，将 `v2` 多路能力下沉到 `v3`
- [x] 最后完成 Phase I，并统一评测与验收
