### Task 2: 修复源码路径与事实源同步批次

**Files:**
- Modify: `packages/contracts/README.md`
- Modify: `packages/server/README.md`
- Modify: `packages/server/src/routes/README.md`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: `docs/todos/doc-drift-fix-list.md` 中 M-01 至 M-05 与 L-01 的问题定义；`packages/contracts/src/index.ts`、`packages/contracts/src/domain/`、`packages/server/src/routes/`、`packages/server/src/bootstrap/run-startup-sequence.ts`
- Produces: 已修正的路径说明、路由组说明、schema 清单、表数量文案与启动阶段描述

- [ ] **Step 1: 逐文件核对路径与数量**

Run: `rtk rg -n "src/types/|57 张表|5 阶段|feedback-admin|labels.ts" packages/contracts/README.md packages/server/README.md packages/server/src/routes/README.md docs/reference/SYSTEM_TRUTH_SOURCES.md docs/README.md`
Expected: 命中当前待修表述

- [ ] **Step 2: 更新文档事实并完成中文化**

要求：
- 删除或替换 `src/types/` 为真实入口
- `packages/server/README.md` 同时完成简体中文化
- `packages/server/src/routes/README.md` 补 `feedback-admin`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md` 纳入 `labels.ts` 或改成稳态描述
- `docs/README.md` 的表数量统一为 `63 张表`
- `packages/server/README.md` 的启动阶段数改准确，或改成不写死数量

- [ ] **Step 3: 校验文档守卫**

Run: `rtk pnpm check:docs-drift`
Expected: PASS

- [ ] **Step 4: 校验链接**

Run: `rtk pnpm check:links`
Expected: PASS 或仅剩与本任务无关的既有告警

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/README.md packages/server/README.md packages/server/src/routes/README.md docs/reference/SYSTEM_TRUTH_SOURCES.md docs/README.md
git commit -m "docs: align readmes and truth sources"
```

