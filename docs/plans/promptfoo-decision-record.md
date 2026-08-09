# Promptfoo Eval 引擎迁移决策记录

> 状态：已完成（Phase 0 建立，Phase 8 closeout 完成）
> 关联计划：[`promptfoo-eval-migration-plan.md`](promptfoo-eval-migration-plan.md)

## ADR-1: 采用 promptfoo 作为 eval 执行引擎（库形态）

**决定**：将 `evals/` 下 6 个 suite 的 case 循环执行统一迁移到 promptfoo，只把 promptfoo 当执行引擎（provider 调度、并发、缓存、重试、dry-run、filter），契约层、报告格式、tier 语义、langfuse 镜像与 CI 门控保持不变。

**包形态修正（相对计划的偏差，明示）**：计划原文写 `@promptfoo/api`，该包在 npm 上**不存在**（`npm view @promptfoo/api` 返回 404）。promptfoo 的库 API（`evaluate()`）由主包 `promptfoo` 直接导出（`promptfoo/dist/src/index.js`）。本迁移以根 devDependency `promptfoo`（精确锁版 `0.122.0`）实现"库形态"意图，不做 CLI 子进程。新增共享基建 `evals/promptfoo/` 以 `SuiteBridge` 接口隔离 promptfoo，保证未来可替换引擎。

**理由**：promptfoo 提供成熟的 provider 调度/并发/断言基建；复用而非重写可消除自研 case 循环 runner 的维护负担。桥接层保持薄壳，使引擎可替换。

## ADR-2: 单供应商风险显式声明

**事实**：promptfoo 为 MIT 许可；2026-03 被 OpenAI 收购。

**风险**：第三方库被收购后存在许可、路线图、强制遥测或废弃风险。作为评估基础设施（非生产运行时依赖），影响面可控，但需持续跟踪。

**缓解**：
- `SuiteBridge` 薄壳隔离：所有 suite 通过统一接口消费执行引擎，换引擎只改 `evals/promptfoo/runner.ts` 一处。
- promptfoo 只做"载体"：governance / IR 指标 / judge 评分仍以 TrapMap 原生纯函数逻辑为准。
- 决策记录在 Phase 8 closeout 时更新跟踪状态。

## ADR-3: langfuse 升级采用精确版本锁定

**决定**：`langfuse` 在根 `package.json` 与 `packages/host-local/package.json` 中统一升级到 npm `latest`（2026-08-09 查询为 `3.38.20`，与当前安装版本一致），并**去掉 `^` 前缀锁定精确版本**。`pnpm-lock.yaml` 相应更新。

**影响**：版本号未实际变化（`3.38.20` → `3.38.20`），故 `evals/lib/platform/langfuse-adapter.ts` 与 `packages/host-local/src/nest/observability/langfuse.service.ts` 无 API 不兼容，无需最小适配；`EvalPlatformEvent` schema 与镜像语义不变。三条 success evidence 验证口径不变。

## ADR-4: 并发边界 — 共享 DB 的 suite 强制 `maxConcurrency: 1`

**事实**：`createExecutionContext` 每 case 构建独立 composed server 但共享同一 `TRAPMAP_DATABASE_URL`；`closeExecutionContext` 执行全表 `TRUNCATE`（`evals/retrieval/lib/adapters.ts:306-329`）。

**决定**：retrieval / summary / label-alignment-live 桥接的 promptfoo `maxConcurrency` 必须为 `1`，避免并发 case 间 truncate 竞态。agent-planning / graph-extraction / ingestion（无共享 DB 状态）可使用 `4`。

## Backlog（不在本次范围，Phase 8 跟踪）

- per-case DB schema/临时库隔离 → retrieval/summary/label-alignment-live 可并行
- promptfoo 内置 langfuse 导出 vs 现有平台镜像的评估
- `dedup-eval.ts` / `conflict-eval.ts` 桥接（独立脚本，未进 aggregate）
- `retrieval-live` 快照对比工具保持独立

## Closeout（Phase 8 填写）

**迁移结果（2026-08-09）**：6 个 suite（retrieval / summary / agent-planning / label-alignment / graph-extraction / ingestion）全部迁移到 promptfoo 执行引擎，逐 suite 建立 `SuiteBridge` + `parity-<suite>.test.ts`。Cutover（Phase 7）完成：`scripts/run-eval.ts` 默认 `--runner promptfoo`；`eval-all.ts` / `eval-ci.ts` 收敛为 bridge 注册表循环；6 个 `run.ts` 的自研 case 循环删除（保留契约类型、报告构建器与 `getXxxEvaluationCases` 加载）；`evals/promptfoo/snapshots/` 生成 6 个 smoke 判定快照，parity 测试改为"promptfoo 输出 vs 快照"；`.github/workflows/eval.yml` 增加 blocking `eval-parity` job（无 API key 可跑）。

**验收**：`rtk pnpm eval:smoke` 54/81（与本地 keyless 基线一致，无回归）；`rtk pnpm eval:ci` 无回归；6 个 parity 测试全绿（summary/retrieval 走 coordinator 临时库）；`rtk pnpm typecheck` 全绿；`check:docs-drift` / `check:structure` 全绿。退出码 / tier / dry-run / allow-empty / endpoint 过滤语义不变。

**Backlog 状态**（保持未做，显式登记）：
- per-case DB schema/临时库隔离 → retrieval/summary/label-alignment-live 可并行（当前 `maxConcurrency: 1`，ADR-4）
- promptfoo 内置 langfuse 导出 vs 现有 `evals/lib/platform` 镜像的评估（当前不启用 promptfoo 内置 langfuse，避免双写）
- `dedup-eval.ts` / `conflict-eval.ts` 桥接（独立脚本，未进 aggregate）
- `retrieval-live` 快照对比工具保持独立（用途不同，强制迁移无收益）

**单供应商风险跟踪**：promptfoo 仍为 MIT 许可、OpenAI 收购主体不变。`SuiteBridge` 薄壳隔离保留，换引擎只需改 `evals/promptfoo/runner.ts` 一处；governance / IR 指标 / judge 评分仍以 TrapMap 原生纯函数逻辑为准（promptfoo 只做载体）。持续跟踪第三方库许可与遥测政策变化。
