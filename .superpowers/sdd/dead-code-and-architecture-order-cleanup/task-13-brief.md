### Task 13: 回归验证与 closeout

**Files:**
- Modify: `docs/todos/open-debt-and-compromises.md`（回写：确认删除的死代码项关闭；未实施的大重构项——capability-model 拆分、OTel/Consul 双份收敛、EvalSeedPort 收窄、web-panel real 路径、internal-client review/governanceReview 合并、shared/ports.ts 业务下沉——登记为长期 debt 带进入条件）
- Modify: `docs/README.md`（LLM 图提取条目标注状态；若主线完成则更新"当前整改主线"小节）
- 全量验证：`rtk pnpm typecheck`、受影响包全量测试、`rtk pnpm exec knip`、`rtk pnpm exec fallow audit --base main`、`rtk pnpm check:docs`、`rtk pnpm check:structure`、`rtk pnpm eval:smoke`（若 docker 可用；不可用则记录 CI 需补跑）

**Interfaces:**
- Consumes: Task 1-12 全部结果。
- Produces: closeout 证据 + debt register 回写 + 新维护基线。

- [ ] **Step 1: 全量回归**
  运行上述全部命令，记录 knip/fallow 新基线数字。
- [ ] **Step 2: debt register 回写**
  关闭已确认删除项；登记未实施大重构项（带来源/影响/进入条件/后续落点）。
- [ ] **Step 3: 文档回写**
  更新 docs/README.md 与相关 reference；`rtk pnpm check:docs` 通过。
- [ ] **Step 4: 归档**
  全任务证据齐全后，本细则归档至 `docs/archived/archived-plans/`，根 `plan.md` 切换。
- [ ] **Step 5: Commit**
  `docs: closeout dead code and architecture order cleanup`

## Completion Gates

- [ ] 全仓确认死代码/死路径已删除（约 3000+ 行），knip unused files/exports 显著下降。
- [ ] `contracts` 无图算法/parsing/worker 运行时逻辑，依赖面仅剩 zod（及必要的 graphology 若保留消费）。
- [ ] candidates 表单源在 persistence-schema，六包 schema.ts 只 re-export。
- [ ] 无 `service-*` 之间的实现级 import（write↔read 环已断）。
- [ ] backend-core domain 零 SQL 字符串。
- [ ] DATABASE_SCHEMA.md 与 persistence-schema 表清单一致（64 表）。
- [ ] 四类防复发守卫（表清单、pgTable 双份、eval import 边界、@eval-only 标记）接入 CI 且可阻断。
- [ ] eval-only 模块带标记且不在产品公共导出面。
- [ ] 全量 typecheck + 受影响包测试全绿；fallow audit 无 changed-file issue；eval:smoke 在 CI 补跑记录。
- [ ] debt register 已回写：死代码项关闭，大重构项带进入条件登记。
- [ ] 本细则归档，根 plan.md 切换到下一主线或置空。
