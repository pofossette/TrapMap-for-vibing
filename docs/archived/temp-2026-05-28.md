  你是 TrapMap 仓库的"文档漂移续审执行官（Documentation Drift Continuation
  Agent）"。
  上一轮审计已完成 P0 高频文档和核心架构文档的漂移修复与守卫补齐。
  你的任务是继续覆盖上一轮未审计的 P1/P2 文档，发现漂移后立即修正，并补充相应守卫。

  # Repository Context
  工作目录：`/home/wunai/Disks/Data/my-project/Trap-Map`

  必须先阅读并遵守：
  - `AGENTS.md`
  - `docs/reference/DOCS_TRUTH_MATRIX.md`
  - `docs/reference/SYSTEM_TRUTH_SOURCES.md`
  - `docs/archive/doc-drift-audit-report-2026-05-28.md`（上一轮审计报告，了解已修复
  内容和剩余风险）

  # 上一轮已完成的工作（不要重复）
  上一轮已修复的文件（已与代码对齐，不要回退）：
  - `README.md`、`docs/README.md`、`docs/guides/GETTING_STARTED.md`
  - `docs/guides/CONTRIBUTING.md`、`docs/operations/TESTING.md`、`docs/operations/CI
  _CD.md`
  - `docs/operations/ENVIRONMENT.md`
  - `docs/architecture/ARCHITECTURE.md`、`docs/architecture/DEPLOYMENT.md`
  - `docs/architecture/components/PERSISTENCE.md`、`docs/architecture/components/EVA
  LUATION.md`
  - `docs/architecture/components/AI_PROVIDER.md`、`docs/architecture/components/RET
  RIEVAL.md`
  - `docs/reference/DOCS_TRUTH_MATRIX.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`

  上一轮已添加的 docRules（`scripts/complexity-budgets.json` 中 15 条规则）和 smoke
  test 断言（27 条）。

  # Mission
  对以下未审计文档逐文件做逆向审计，发现漂移立即修正：

  ## 本次审计范围

  ### P1 组件文档（对照 `packages/server/src/` 源码）
  - `docs/architecture/components/AUTH.md` — 对照
  `packages/server/src/routes/auth.ts`、`packages/server/src/lib/auth/`
  - `docs/architecture/components/ASYNC_INFRASTRUCTURE.md` — 对照
  `packages/server/src/lib/queue/`、`packages/server/src/lib/lifecycle/`
  - `docs/architecture/components/CLIENT.md` — 对照 `packages/cli/src/`
  - `docs/architecture/components/GOVERNANCE.md` — 对照
  `packages/server/src/lib/governance/`
  - `docs/architecture/components/INDEXING.md` — 对照
  `packages/server/src/lib/indexing/`
  - `docs/architecture/components/ARTIFACTS.md` — 对照
  `packages/server/src/lib/artifacts/`
  - 其他 `docs/architecture/components/*.md` 中明显有旧实现描述的文件

  ### P1 Skill 工作流文档（对照 `packages/skills/` 和 CLI 命令）
  - `packages/skills/trapmap-knowledge-workflow/SKILL.md`
  - `packages/skills/trapmap-knowledge-workflow/references/*.md`（cli-index.md、regi
  stration.md、retrieval.md、review.md、artifacts.md、feedback.md、maintenance.md、a
  ccumulation.md）
  - 核对：命令是否存在于 `packages/cli/src/commands/`、路径是否与当前 monorepo
  结构一致

  ### P2 参考与评测文档
  - `docs/PACKAGES.md` — 核对各包职责描述是否与实际 package.json 和目录结构一致
  - `docs/PACKAGE_STACK_RATIONALE.md` — 删除与实现脱节的技术选型表述
  - `docs/reference/DATABASE_SCHEMA.md` — 与
  `packages/server/src/lib/persistence/schema/*.ts` 同步，验证表计数
  - `docs/reference/api-surface.md` — 与 `packages/server/src/routes/` 和 `app.ts`
  中的 `documentedRoutes` 校对
  - `evals/README.md` — 同步真实 runner、tier、dataset/scenario 结构
  - `evals/retrieval/README.md`、`evals/summary/README.md`、`evals/graph-extraction/
  README.md`

  # Execution Policy

  1.
  **先读真相源，再改文档**。对每个文件，先读对应的代码源，建立判定基线，再修文档。
  2. **发现漂移就改**，不要只列问题。
  3. **功能性漂移决策规则**（与上一轮相同）：
     - `implement`：仓库中能力已基本存在，只缺薄入口
     - `delete-doc-claim`：文档承诺不存在，补实现会显著扩 scope
     - 对 Helm/K8s/大型运维交付物默认 `delete-doc-claim`
  4. **所有修改都必须记录到审计报告**：`docs/archive/doc-drift-audit-report-2026-05-
  28-cont.md`
  5. **不要回退或覆盖上一轮已有改动**。
  6. shell 命令必须加 `rtk` 前缀。

  # Subagent Policy
  如果使用 sub-agent，按 lane 分工，禁止文件重叠写入：

  - Lane A: 组件文档（AUTH.md、ASYNC_INFRASTRUCTURE.md、CLIENT.md、GOVERNANCE.md、IN
  DEXING.md、ARTIFACTS.md 等）
  - Lane B: Skill 工作流文档（SKILL.md + references/*.md）
  - Lane C: 参考文档与评测 
  README（PACKAGES.md、DATABASE_SCHEMA.md、api-surface.md、evals/*.md）

  主线程负责：真相源交叉复核、功能性漂移决策、守卫更新、审计报告。

  # Verification Requirements
  每完成一批修改后至少运行：
  ```bash
  rtk pnpm check:docs-drift
  rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts
  rtk pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts

  如果某项无法运行，必须在审计报告中说明。

  Required Deliverables

  1. 已修改的文档
  2. 更新后的 docRules / smoke test（如发现新漂移类别）
  3. 审计报告：docs/archive/doc-drift-audit-report-2026-05-28-cont.md
  4. 最终总结：修复了哪些漂移、删除了哪些承诺、跑了哪些验证、剩余风险

  真相源速查表

  ┌───────────────────┬──────────────────────────────────────────────────────┐
  │       问题        │                        查什么                        │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ 路由端点列表      │ packages/server/src/app.ts 中的 documentedRoutes     │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ CLI 命令树        │ packages/cli/src/commands/ 目录结构                  │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ DB schema 表      │ packages/server/src/lib/persistence/schema/*.ts      │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ AI provider 配置  │ packages/server/src/lib/ai/provider-config.ts        │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ 环境变量默认值    │ packages/server/src/config.ts                        │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ CI/eval 工作流    │ .github/workflows/ci.yml、.github/workflows/eval.yml │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ Dockerfile        │ packages/server/Dockerfile                           │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ docker-compose    │ docker-compose.yml                                   │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ 根 workspace 命令 │ package.json scripts                                 │
  ├───────────────────┼──────────────────────────────────────────────────────┤
  │ Skill 工作流      │ packages/skills/trapmap-knowledge-workflow/SKILL.md  │
  └───────────────────┴──────────────────────────────────────────────────────┘

  First Step

  1. 读取上一轮审计报告 docs/archive/doc-drift-audit-report-2026-05-28.md
  2. 读取 docs/reference/DOCS_TRUTH_MATRIX.md 和 SYSTEM_TRUTH_SOURCES.md
  3. 对每个待审计文件，先读对应代码源，再对比文档内容
  4. 输出极简执行摘要（本轮覆盖哪些文件、预期最危险的漂移点）
  5. 立刻开始执行

