# TrapMap Stage 1 执行包 B：Operations 读侧与兼容层边界收敛

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 将 `feedback-admin`、`operations/status`、`operations/artifacts-export`、`operations/audit` 等 operator/diagnostic 路径中零散的 compatibility snapshot 读取收口为显式只读 projection 或 repository，明确 operator 读侧 ownership。

**架构：** 保持模块化单体与现有 HTTP contract 不变，把这批路径视为 `运维与运行时`、`反馈与修复`、`工件生命周期` 三个 context 的派生读侧消费者。通过只读 seam 隔离 cross-entity lookup 与 migration diagnostics，避免 route 临时拼装 truth + 派生状态。

**技术栈：** TypeScript、Fastify、Zod、Vitest、PostgreSQL、Drizzle、现有 artifact/feedback/audit repository、compatibility status schema。

---

## 为什么先做这个

- [packages/server/src/routes/feedback-admin.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/feedback-admin.ts:1) 大部分查询已用 repository，但仍通过 snapshot 做 artifact shortcut/title lookup。
- [packages/server/src/routes/operations/status.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/operations/status.ts:1) 同时承载 async runtime status 与 compatibility status，已经是 operator 面的天然汇聚点。
- [packages/server/src/routes/operations/artifacts-export.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/operations/artifacts-export.ts:1) 与 [packages/server/src/routes/operations/audit.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/operations/audit.ts:1) 仍保留 snapshot 读取用于辅助显示字段。
- 这批问题属于 Stage 1C 和耦合工作流 D 的直接落点，先收口后，Stage 2 才能为 operator/read-model 建立稳定 freshness 合约。

## 范围

- 包含 operator/diagnostic 读路径的 projection seam 设计与落地。
- 包含 snapshot allowlist 的收敛与例外命名。
- 不修改外部 API shape。
- 不在本执行包中重写 retrieval 主链路。

## 目标边界

- route 仍负责 request/response 与 auth。
- projection / read repository 负责：
  - artifact slug/title lookup
  - compatibility migration status 组装
  - audit/operator 展示所需的跨实体只读拼装
- compatibility snapshot 只允许保留在：
  - 无可替代 projection 的迁移诊断
  - 文档显式声明的受控 operator 例外

## 任务 1：定义 operator 读侧 seam

**重点文件**

- 新增：`packages/server/src/lib/operations/` 下的只读 helper 或 projection 模块
- 修改：`packages/server/src/routes/operations/status.ts`
- 修改：`packages/server/src/routes/feedback-admin.ts`

- [x] 盘点 operator 路由里当前使用 snapshot 的原因，并按“可以补 repo / 需要专用 projection / 暂时保留例外”分类。
- [x] 为 artifact lookup、compatibility migration status、audit display lookup 建立显式只读入口。
- [x] 让 `feedback-admin` 调用只读 seam，而不是自己拼装 artifact map。
- [x] 让 `operations/status` 中 compatibility status 分支只依赖明确的 read helper。

**完成标准**

- route 中的 snapshot 读取数量下降或集中到单一只读模块。
- operator 读侧 owner 明确，不再是 route-local 临时拼装。

## 任务 2：梳理允许保留的 compatibility 例外

**重点文件**

- 修改：`packages/server/src/__tests__/snapshot-usage-guard.test.ts`
- 修改：`docs/reference/SYSTEM_TRUTH_SOURCES.md`

- [x] 对 `operations/status`、`operations/artifacts-export`、`operations/audit` 中剩余 snapshot 访问逐项命名原因。
- [x] 若某项只是因为 repo 能力缺口而保留，必须在文档中写成待消除债务，而不是“默认可接受”。
- [x] snapshot guard allowlist 按“diagnostic/projection exception”归类，而不是继续按零散文件堆积。

**完成标准**

- 兼容层例外范围可被审计。
- 后续新增 operator 路径时有清晰准入标准。

## 任务 3：回写 Stage 1 的 read-model ownership 规则

**重点文件**

- 修改：`docs/plans/backend-engineering-roadmap/stage-1-foundation-and-boundaries.md`
- 修改：`docs/plans/backend-engineering-roadmap/coupling-reduction-plan.md`
- 修改：`plan.md`

- [x] 在 Stage 1 文档中明确 operator/badcase/remediation inspection 属于派生读侧，而不是 authoritative write owner。
- [x] 在耦合计划中把本执行包映射到工作流 B/D。
- [x] 在根 `plan.md` 中把本执行包列为 Stage 1 第二优先级。

**完成标准**

- Stage 1 的 repository/compatibility 收敛不再只聚焦写路径。
- operator 读侧和 compatibility seam 的边界有明确索引。

## 任务 4：验证

- [x] 跑相关读侧聚焦测试。
- [x] 跑 `rtk pnpm test -- --run packages/server/src/routes/feedback.test.ts packages/server/src/routes/operations/status.test.ts packages/server/src/routes/operations/artifacts-export.test.ts packages/server/src/routes/operations/audit.test.ts packages/server/src/__tests__/snapshot-usage-guard.test.ts`。
- [x] 跑 `rtk pnpm typecheck`。

**验收结果**

- operator 路径默认通过显式 projection/read helper 读取。
- compatibility snapshot 被限制在命名过的受控例外内。
- Stage 2 可以在更稳定的 operator/read-model seam 上继续推进。
