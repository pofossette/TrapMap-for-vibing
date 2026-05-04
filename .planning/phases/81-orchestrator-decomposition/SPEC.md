# Phase 81: Orchestrator Decomposition

## Summary

拆分 `packages/server/src/lib/retrieval/orchestrator.ts` (1145 行，17 个模块导入) 为多个专职服务，降低检索核心的复杂度。

## Motivation

当前 orchestrator.ts 是项目中最大的 God Module，承担了检索流程的所有环节：
- 嵌入生成 (embedding generation)
- 向量搜索 (vector search)
- 关键词搜索 (keyword search)
- 图搜索 (graph search)
- 候选合并 (candidate merging)
- 重排 (reranking)
- 边界匹配 (boundary matching)
- 引用构建 (citation building)
- 冲突丰富 (conflict enrichment)
- 摘要生成 (summarization)

修改任何一个环节都需要理解整个文件，测试困难，性能优化也难以局部进行。

## Scope

### In Scope
- 分析 orchestrator.ts 的职责边界
- 提取独立服务：
  - `search-strategy.ts` — 搜索策略选择与执行
  - `ranking-service.ts` — 重排与评分逻辑
  - `citation-builder.ts` — 引用构建
  - `search-coordinator.ts` — 协调各服务的主入口
- 重构后 orchestrator 作为协调器，委托给各服务
- 迁移或拆分测试文件
- 保持对外接口不变

### Out of Scope
- 检索算法优化
- 新增检索能力
- CLI 侧变更

## Success Criteria

- [ ] orchestrator.ts 行数 < 400 行
- [ ] 每个提取的服务文件 < 400 行
- [ ] 单一职责：每个服务只做一件事
- [ ] 所有现有测试通过
- [ ] 检索结果与重构前一致（eval 验证）

## Dependencies

- None (可独立执行)

## Risks

| Risk | Mitigation |
|------|------------|
| 服务间接口设计不当导致耦合 | 先定义清晰的接口类型 |
| 行为变更引入 bug | 运行 eval:core 验证 |

## Estimated Effort

3-4 小时

## Files Affected

- `packages/server/src/lib/retrieval/orchestrator.ts` (重构)
- `packages/server/src/lib/retrieval/search-strategy.ts` (新建)
- `packages/server/src/lib/retrieval/ranking-service.ts` (新建)
- `packages/server/src/lib/retrieval/citation-builder.ts` (新建)
- `packages/server/src/lib/retrieval/search-coordinator.ts` (新建)
- `packages/server/src/lib/retrieval/orchestrator.test.ts` (拆分)
