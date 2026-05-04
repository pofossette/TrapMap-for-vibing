# Phase 84: Tech Debt Cleanup

## Summary

清理项目中的技术债务，包括死代码、过期 worktree、knip 警告等。

## Motivation

项目存在以下技术债务：
1. **过期 worktree**：`.claude/worktrees/` 下有 16 个残留 worktree，占用 574 MB
2. **死代码**：knip 检测到多个未使用的 interface/type
3. **重复导出**：`boundary.ts` 中存在重复导出

## Scope

### In Scope

#### 1. Worktree 清理
- 执行 `git worktree prune` 清理过期引用
- 验证 `.gitignore` 配置正确

#### 2. 死代码清理
- 清理 `graph-extract.ts` 中未使用的类型：
  - `GraphNode`, `GraphRelation`, `TrapGraphExtractionResult`
  - `LegacyGraphEntityType`, `LegacyGraphRelationType`
  - `GraphEntity`, `LegacyGraphRelation`, `GraphExtractionResult`
- 清理 retrieval 模块中未使用的 Config interface：
  - `MergeConfig`, `GraphAssistedRecallConfig`, `PgKeywordRecallConfig`
  - `BatchEmbeddingResult`, `BatchCacheStats`, `OptimizedSemanticRecallResult`
  - `RerankConfig`, `RetrievalStats`, `RoutingDecision`

#### 3. 重复导出修复
- 修复 `boundary.ts` 中的重复导出 `boundarySchema|boundaryMetaSchema`

### Out of Scope
- TypeScript 配置变更
- 依赖升级
- 未使用导出的全面清理（剩余警告为公共 API 或需更大范围重构）

## Success Criteria

- [ ] `git worktree list` 只显示有效 worktree
- [ ] `pnpm knip` 无重复导出警告，未使用导出警告数量减少
- [ ] 释放至少 500 MB 磁盘空间
- [ ] 所有测试通过

## Dependencies

- None

## Risks

| Risk | Mitigation |
|------|------------|
| 删除实际在用的类型 | 确认无引用后再删 |
| worktree 清理影响正在进行的分支 | 先检查 `git worktree list` |

## Estimated Effort

30 分钟 - 1 小时

## Files Affected

- `packages/server/src/lib/retrieval/graph-extract.ts`
- `packages/server/src/lib/retrieval/merge.ts`
- `packages/server/src/lib/retrieval/recall/*.ts`
- `packages/server/src/lib/retrieval/rerank.ts`
- `packages/server/src/lib/retrieval/types.ts`
- `packages/contracts/src/domain/boundary.ts`
