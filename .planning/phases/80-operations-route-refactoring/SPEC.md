# Phase 80: Operations Route Refactoring

## Summary

拆分 `packages/server/src/routes/operations.ts` (1663 行，18 个导入) 为多个职责单一的路由模块，提升可维护性。

## Motivation

当前 `operations.ts` 承担过多职责：
- 审计 (audit)
- 激活/停用 (activation/deactivation)
- 导入导出 (import/export)
- 迁移 (migration)
- 技能编辑 (skill editing)
- 审核决策 (review decisions)

任何修改都需要理解整个大文件，违反单一职责原则。

## Scope

### In Scope
- 分析现有 operations.ts 的路由分组
- 创建新的路由文件：
  - `audit-routes.ts` — 审计相关端点
  - `activation-routes.ts` — 激活/停用端点
  - `import-export-routes.ts` — 导入导出端点
  - `skill-edit-routes.ts` — 技能编辑端点
- 更新 app.ts 注册新路由
- 迁移相关测试文件
- 清理原 operations.ts 或删除

### Out of Scope
- CLI 侧 `packages/cli/src/commands/operations.ts` 的重构（可后续 Phase 处理）
- API 接口变更

## Success Criteria

- [ ] operations.ts 行数 < 300 行（或完全删除）
- [ ] 每个新路由文件 < 400 行
- [ ] 所有现有测试通过
- [ ] 无 API 行为变更

## Dependencies

- None

## Risks

| Risk | Mitigation |
|------|------------|
| 路由注册顺序影响行为 | 保持原有注册顺序 |
| 测试遗漏 | 确保测试覆盖率不下降 |

## Estimated Effort

2-3 小时

## Files Affected

- `packages/server/src/routes/operations.ts` (拆分)
- `packages/server/src/routes/audit-routes.ts` (新建)
- `packages/server/src/routes/activation-routes.ts` (新建)
- `packages/server/src/routes/import-export-routes.ts` (新建)
- `packages/server/src/routes/skill-edit-routes.ts` (新建)
- `packages/server/src/app.ts` (更新路由注册)
- `packages/server/src/routes/operations.test.ts` (迁移测试)
