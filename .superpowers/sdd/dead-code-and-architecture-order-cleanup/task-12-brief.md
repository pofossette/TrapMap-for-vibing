### Task 12: 防复发守卫落地

**Files:**
- Create: scripts/check-table-schema.ts（从 persistence-schema 提取表清单，对比 DATABASE_SCHEMA.md 声明，diff 即失败）
- Modify: `scripts/check-doc-truth.ts` 或新建 guard（pgTable 双份守卫：扫描 `packages/service-*/src/**/schema.ts`，禁止直接定义 pgTable，只允许 re-export persistence-schema）
- Modify: `scripts/check-relative-imports.mjs`（把 `evals/` 纳入检查范围，或新建 scripts/check-eval-imports.mjs：只允许白名单路径——`host-local` 的公开测试装配面与 contracts——禁止 evals 直连 service 内部文件；@eval-only 模块除外）
- Create: scripts/check-eval-only.ts（扫描 product 包 src，检测仅被 evals 引用的模块是否带 `@eval-only` 头注释；未标记即失败）
- Modify: `package.json`（注册新 guard scripts，接入 `pnpm check` 与 CI `run-ci.ts`）
- Modify: `knip.json`（Task 6 已补 entry，此处确认 eval 死代码可报告）
- Modify: `docs/operations/TESTING.md`、`docs/operations/CI_CD.md`、`docs/guides/DOCUMENTATION_GOVERNANCE.md`（新增 guard 说明）

**Interfaces:**
- Consumes: Task 2/3/7/11 的清理结果（表单源、eval-only 标记、表清单校准）。
- Produces: 四类防复发守卫接入 CI。

- [ ] **Step 1: 表清单守卫**
  实现 `check-table-schema.ts`；正例（一致）绿、反例（缺表/幽灵表）红；接 package.json 与 run-ci.ts。
- [ ] **Step 2: pgTable 双份守卫**
  实现 service schema 单源扫描；candidate-ingestion 本地定义（Task 3 已改 re-export 后）作为反例基线。
- [ ] **Step 3: eval import 边界守卫**
  `check-relative-imports.mjs` 纳入 evals 或新建守卫；白名单 evals→host-local testing 装配面与 contracts；其余 evals→service 内部 import 失败；@eval-only 模块例外。
- [ ] **Step 4: @eval-only 标记守卫**
  实现扫描；3 个已标记模块为反例基线；新 eval-only 依赖必须带标记。
- [ ] **Step 5: 验证 + 文档**
  `rtk pnpm check:docs`、`rtk pnpm check:structure`、`rtk pnpm exec fallow audit --base main`、新增 guard 单测；更新 TESTING.md/CI_CD.md/DOCUMENTATION_GOVERNANCE.md。
- [ ] **Step 6: Commit**
  `feat(guards): enforce table single-source, eval import boundaries, and eval-only markers`

