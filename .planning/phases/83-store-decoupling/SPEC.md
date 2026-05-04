# Phase 83: Store Decoupling

## Summary

解耦 `packages/server/src/lib/store.ts` (774 行，被 96 个文件导入)，引入 Repository 接口层降低耦合度。

## Motivation

`store.ts` 是全项目最大的耦合节点：
- 被 **96 个文件**直接导入
- 集合了 JSON 文件存储、内存 store、日期工具、全实体类型定义
- 修改任何接口都可能影响半个代码库
- 无法独立替换底层存储（如从 JSON 迁移到纯 PG）
- 测试时难以 mock

这是中长期技术债，可以渐进式改善。

## Scope

### In Scope
- 在 contracts 包定义 Repository 接口
- 按实体拆分 repository 接口：
  - `KnowledgeRepository`
  - `CandidateRepository`
  - `ArtifactRepository`
  - `FeedbackRepository`
- 创建实现类包装现有 store
- 在新代码中优先依赖接口而非具体 store
- 逐步迁移高价值调用点

### Out of Scope
- 完全移除 store.ts（渐进式）
- 数据库迁移
- 全量重写所有调用点

## Success Criteria

- [ ] Repository 接口定义完成
- [ ] 至少 2 个模块已迁移到使用接口
- [ ] store.ts 的直接导入数量下降
- [ ] 所有测试通过

## Dependencies

- None

## Risks

| Risk | Mitigation |
|------|------------|
| 接口设计不完整导致频繁修改 | 先覆盖最常用的方法 |
| 渐进迁移导致双重维护 | 优先迁移新代码 |

## Estimated Effort

较大，可分多次迭代。首次约 3-4 小时完成接口和迁移示例。

## Files Affected

- `packages/contracts/src/domain/repositories.ts` (新建接口)
- `packages/server/src/lib/repositories/` (新建目录)
- `packages/server/src/lib/store.ts` (标记为 deprecated 逐步迁移)
- 多个调用 store 的模块

## Approach

**渐进式策略**：不追求一次性重构，而是：
1. 定义接口
2. 新功能使用接口
3. 触及旧代码时顺便迁移
4. 逐步降低 store.ts 的导入量
