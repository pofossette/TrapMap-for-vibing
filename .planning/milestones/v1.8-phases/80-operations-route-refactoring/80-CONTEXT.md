# Phase 80: Operations Route Refactoring

## Context

`packages/server/src/routes/operations.ts` 目前有 1663 行代码，承担过多职责：
- Artifact import/export
- Artifact activation
- Skill edit workflow
- Skill review queue
- Skill history
- Legacy knowledge operations (list, deactivate)
- Audit events
- Migration commands
- Compatibility status

## Problem

1. **单文件过大** — 1663 行超出健康阈值 (500-800 行)
2. **职责混杂** — 导入/导出、激活、审核、迁移等逻辑交织
3. **测试困难** — 需要测试整个大文件
4. **变更风险高** — 修改任一功能可能影响其他功能

## Goals

1. 将 `operations.ts` 拆分为独立的功能模块
2. 每个模块保持在 500 行以内
3. 保持 API 路径不变 (向后兼容)
4. 测试文件同步拆分

## Proposed Structure

```
packages/server/src/routes/
├── operations.ts          # 主入口，仅注册子路由 (约 50 行)
├── operations/
│   ├── artifacts-import.ts    # artifact import 逻辑 (~250 行)
│   ├── artifacts-export.ts    # artifact export 逻辑 (~200 行)
│   ├── artifacts-activate.ts  # activation 逻辑 (~200 行)
│   ├── skill-edit.ts          # skill edit + history (~300 行)
│   ├── skill-review.ts        # review queue + decision (~200 行)
│   ├── knowledge-legacy.ts    # list, deactivate (~150 行)
│   ├── audit.ts               # audit events (~100 行)
│   ├── migrate.ts             # legacy migration (~200 行)
│   └── status.ts              # compatibility status (~100 行)
```

## Acceptance Criteria

- [ ] `operations.ts` 主文件 < 100 行
- [ ] 每个子模块 < 400 行
- [ ] 所有现有测试通过
- [ ] 测试文件同步拆分
- [ ] API 路径保持不变
- [ ] 无功能性变更

## Dependencies

- None

## Estimated Effort

Medium (4-6 hours)

## Related

- Phase 81: Orchestrator Decomposition (server 端另一个大文件)
- Phase 85: CLI Operations Refactoring (CLI 端对应的大文件)
