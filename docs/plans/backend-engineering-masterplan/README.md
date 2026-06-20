# TrapMap 后端工程化执行包索引

本目录是当前 TrapMap 后端工程化的正式执行入口。根 [`plan.md`](../../../plan.md) 负责总控、阶段顺序与进度跟踪；本目录负责提供按阶段拆分的可执行细则。

## 目录角色

- `plan.md`：根级总控执行计划，只保留背景、总目标、阶段依赖、进度勾选和子计划入口。
- `docs/plans/backend-engineering-masterplan/`：本轮后端工程化的正式执行包目录。
- `docs/plans/backend-engineering-roadmap/`：旧阶段计划目录，仍保留局部有效结论，但不再作为主入口。
- `docs/plans/runtime-recomposition/`、`docs/plans/deployment-flexibility/`：运行时/部署边界的有效参考事实源，由新根计划统一承接。
- `docs/todos/`：问题池与提案区，不直接承担执行计划角色。
- `docs/archived/archived-plans/`：被替代或完成后退出活跃轨道的历史计划。
- `docs/superpowers/plans/`：Superpowers 工作流生成的计划/草案区；除非被显式接管引用，否则不自动升级为正式长期计划。

## 与现有计划体系的关系

### 1. `backend-engineering-roadmap/`

继续作为参考：

- Stage 1 边界与兼容收敛
- Stage 2 异步运行时与读写分离
- Stage 3 operator / config / capacity / cache 主线

但新的执行入口以本目录为准；旧目录中的文件不再承担“读到这里就开始做”的角色。

### 2. `runtime-recomposition/` 与 `deployment-flexibility/`

这些目录中的运行时 capability、deployment profile、host assembly 和 gateway-only 结论继续有效；本轮不重写它们，而是在新阶段计划里说明这些结论如何被后端工程化主线吸收与约束。

### 3. `docs/todos/backend-engineering-optimization-plan.md`

该文件保留为问题池和优先级记录，不再充当总控执行计划。执行时应先读根 `plan.md` 与本目录阶段文件，再回头用 TODO 文档补充背景。

## 执行顺序

1. [`00-current-state-and-gap-baseline.md`](./00-current-state-and-gap-baseline.md)
2. [`01-boundaries-and-compat-convergence.md`](./01-boundaries-and-compat-convergence.md)
3. [`02-async-runtime-and-failure-semantics.md`](./02-async-runtime-and-failure-semantics.md)
4. [`03-operator-config-capacity-and-cache-ops.md`](./03-operator-config-capacity-and-cache-ops.md)
5. [`04-validation-rollout-and-doc-backfill.md`](./04-validation-rollout-and-doc-backfill.md)

## 阶段边界

### Phase 0

冻结真实代码入口、活跃计划、问题池和 gap matrix，防止后续执行继续建立在模糊现状上。

### Phase 1

收敛 route / application / repository / runtime / compatibility 边界，降低后续 contract 设计的歧义。

### Phase 2

统一 async runtime、projection freshness、idempotency、retry、resume 和 failure semantics。

### Phase 3

做厚 operator 面，补 config governance、capacity modeling、cache invalidation 与 bulk path 运维能力。

### Phase 4

规定验证矩阵、文档回写、旧计划退出机制和最终 closeout。

## 参考事实源

- 当前实现入口：
  - `packages/server/src/app.ts`
  - `packages/server/src/bootstrap/run-startup-sequence.ts`
  - `packages/server/src/routes/operations/status.ts`
  - `packages/server/src/lib/runtime/runtime-metadata.ts`
  - `packages/server/src/lib/operations/read-model.ts`
  - `packages/server/src/config.ts`
- 当前宿主/内核入口：
  - `packages/backend-core/src/`
  - `packages/host-local/src/`
  - `packages/host-distributed/src/`
- 当前规则与事实源：
  - `docs/reference/REPO_STRUCTURE.md`
  - `docs/reference/SYSTEM_TRUTH_SOURCES.md`
  - `docs/architecture/ARCHITECTURE.md`
  - `docs/architecture/components/ASYNC_MODEL.md`

## 退出规则

- 当本目录中的阶段计划被执行完成并有新的根总控计划接管时，应将本目录中的过时阶段文件移动到 `docs/archived/archived-plans/`，或在 `docs/plans/README.md` 中降级为 historical reference。
- 未被新根计划显式接管的计划，不得继续标记为默认执行入口。
