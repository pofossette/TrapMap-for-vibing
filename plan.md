# TrapMap Enum And Export Cleanup Plan

## 状态

- 状态：`active`
- 日期：`2026-06-21`
- 本文件角色：根级执行计划，专门跟踪枚举、类型定义与导出收敛

## 目标

- 把项目内分散的枚举、字面量联合类型、共享类型定义收敛到就近的 `enum-types/` 文件夹。
- 用 `index.ts` 作为每个 `enum-types/` 目录和包级类型入口的唯一聚合出口。
- 清理当前零散的 `export *`、跨层深链类型导入和“大文件既定义又到处被直接引用”的状况。

## 当前现状

- `packages/web-panel/src/shared/types/admin-panel.ts` 聚合了大量 UI 共享类型与字面量联合，但当前仍是单文件承载，没有 `index.ts` 聚合层。
- `packages/server/src/lib/store/types/index.ts` 已经形成按目录聚合导出的雏形，但目录命名仍停留在 `types/`，尚未统一到 `enum-types/` 约定。
- `packages/server/src/lib/types.ts`、`packages/server/src/lib/store/index.ts`、`packages/contracts/src/index.ts` 存在多处 `export * from ...` 链式转发，导出边界较宽。
- 当前仓库里显式 `enum` 很少，已识别的代表点是 `packages/contracts/src/domain/path-validation.ts` 中的 `PathValidationError`；更多“枚举语义”目前以字符串字面量联合散落在各处。
- 已识别的分散类型热点包括：
  - `packages/web-panel/src/shared/types/admin-panel.ts`
  - `packages/web-panel/src/stores/theme-store.ts`
  - `packages/server/src/lib/store/types/*.ts`
  - `packages/server/src/lib/types.ts`
  - `packages/contracts/src/domain/*.ts`

## 约束

- 不为了“集中”而打破现有 domain 边界；`enum-types/` 应放在就近领域根下，而不是把全仓库类型堆到单一目录。
- 不在本计划中顺带重做业务逻辑。
- 收敛导出时优先保留已有公共 import path，避免无必要的对外破坏。

## 目标结构

- 每个需要暴露共享枚举/类型的上下文，采用如下结构：

```text
<context>/
  enum-types/
    <domain-a>.ts
    <domain-b>.ts
    index.ts
```

- 目录外统一从 `<context>/enum-types/index.ts` 导入。
- 包级 `index.ts` 只转发对应上下文的 `enum-types/index.ts`，不再拼接零散文件列表。

## 分阶段执行

### Phase 0 基线盘点

- [ ] 列出各包现有 `types/`、显式 `enum`、字面量联合热点与 `export *` 聚合点。
- [ ] 标记哪些目录直接升级为 `enum-types/`，哪些目录需要先拆分文件再迁移。
- [ ] 冻结需要兼容的公共导入路径。

### Phase 1 目录与导出规范收口

- [ ] 在 `AGENTS.md`、必要的包 README 或局部说明中固定 `enum-types/` + `index.ts` 规则。
- [ ] 为每个首批治理目录补齐 `enum-types/index.ts`。
- [ ] 停止新增“业务文件内顺手定义共享类型”的写法。

### Phase 2 首批迁移

- [ ] `packages/web-panel/src/shared/types/admin-panel.ts` 拆分为 `packages/web-panel/src/shared/enum-types/` 下的领域文件并补 `index.ts`。
- [ ] `packages/server/src/lib/store/types/` 评估后迁移到 `packages/server/src/lib/store/enum-types/`，保留兼容导出层。
- [ ] `packages/contracts/src/domain/` 中具有枚举语义的共享定义逐步抽到就近 `enum-types/` 目录，`PathValidationError` 作为首批样板。

### Phase 3 导出清理

- [ ] 收紧 `packages/contracts/src/index.ts` 的零散转发，优先改为面向聚合入口导出。
- [ ] 收紧 `packages/server/src/lib/types.ts`、`packages/server/src/lib/store/index.ts` 的转发链。
- [ ] 清理跨层深链导入，避免外部模块直接引用迁移前的叶子类型文件。

### Phase 4 验证与收尾

- [ ] 运行受影响包的最小类型检查与测试。
- [ ] 运行 `pnpm check:structure`，确认根级计划与文档入口未破坏结构守护。
- [ ] 如涉及事实源或说明入口变更，再补 `pnpm check:docs-drift`。
- [ ] 在本文件回写已完成目录、兼容导入保留策略和剩余债务。

## 优先级

1. `packages/web-panel/src/shared/types/admin-panel.ts`
2. `packages/server/src/lib/store/types/`
3. `packages/server/src/lib/types.ts`
4. `packages/contracts/src/domain/path-validation.ts`
5. `packages/contracts/src/index.ts`

## 完成定义

- 枚举和共享类型定义都有明确的 `enum-types/` 归属目录。
- 每个治理目录都通过 `index.ts` 统一导出。
- 首批重点区域不再依赖散乱的深链类型导入。
- 根 `plan.md`、`AGENTS.md` 与仓库结构规则保持一致。
