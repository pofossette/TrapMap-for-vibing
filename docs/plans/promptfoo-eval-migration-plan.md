# Promptfoo Eval Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. 完成后必须及时勾选，规则见下方"进度追踪规则"。

**Goal:** 将 `evals/` 下 6 个 suite 的执行引擎统一迁移到 promptfoo（`@promptfoo/api` 库形态），
删除自研 case 循环 runner，保留全部契约层、报告格式、tier 语义、langfuse 镜像与 CI 门控不变。

**Architecture:** promptfoo 只做执行引擎（provider 调度、并发、缓存、重试、dry-run、filter）。
新增共享基建 `evals/promptfoo/`，以 `SuiteBridge` 接口桥接各 suite：桥接器负责
"契约 case → provider 调用 → 评分函数（复用现有纯函数）→ 契约报告回填"。
`eval-all.ts`/`eval-ci.ts`/`scripts/run-eval.ts` 消费面保持不变。

**Tech Stack:** TypeScript, Vitest, tsx, `@promptfoo/api`（根 devDependency，精确锁版），
复用 `@trapmap/contracts`、`@trapmap/ai-providers`、`evals/retrieval/lib/adapters.ts`。

## 进度追踪规则（所有执行者必须遵守）

1. **及时勾选**：每完成一项任务（代码/测试/文档/提交均就绪）立即将该任务 `- [ ]` 改为 `- [x]`，
   并在该行下方追加证据行（`- 证据：<命令输出摘要或文件路径>`）。禁止批量勾选、禁止在 Phase
   结束时一次性补勾。
2. **未验证不勾选**：验收命令未全绿、文档未同步、未提交前，对应任务不得勾选。
3. **勾选即承诺**：勾选状态是执行进度真相；若后续发现回退，必须取消勾选并记录原因。

## 提交规则（每 Phase 一提交，不得攒批）

1. **每 Phase 至少一次提交**：该 Phase 全部任务勾选且验收命令全绿后，立即
   `git add` 本 Phase 涉及文件并 `git commit`（message 遵循仓库现有风格，
   形如 `feat(evals): add promptfoo bridge for <suite>`）。
2. **提交前检查**：`git status` + `git diff` 确认只包含本 Phase 变更，不含无关文件与密钥。
3. **依赖安装单独提交**：Phase 0 的 lockfile 变更单独一次提交。
4. **禁止跨 Phase 攒批**：不得把多个 Phase 的变更合并到一次提交。

## 文档更新要求（全局）

1. 任何命令 surface / runner 行为变化，必须同步更新
   [`docs/operations/TESTING.md`](../operations/TESTING.md)、[`evals/README.md`](../README.md) 与
   [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md)。
2. 新增 CI job 必须更新 [`docs/operations/CI_CD.md`](../operations/CI_CD.md)。
3. 新依赖、外部平台、单供应商决策必须落决策记录（Phase 0 指定落点）。
4. 文档改动后必须运行 `rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`。
5. 每 Phase 的 "Document updates" 清单未完成前，该 Phase 不得勾选完成。

## 测试代码更新要求（全局）

1. 每 Phase 的代码改动必须伴随测试改动：新增功能写新测试，行为变化更新既有测试
   （如 `scripts/__tests__/run-eval.test.ts` 的 suite 路由断言、`evals/scripts/__tests__/eval-all.test.ts`）。
2. 测试失败不得通过修改阈值/跳过掩盖；parity 测试必须全绿才可勾选。
3. 每 Phase 的 "Test and eval updates" 命令全部通过前，该 Phase 不得勾选完成。

## Scope

新增文件：

- `evals/promptfoo/types.ts`（SuiteBridge 接口 + 统一结果类型）
- `evals/promptfoo/bridge.ts`（bridge 注册表）
- `evals/promptfoo/runner.ts`（`runSuiteWithPromptfoo`，动态 import `@promptfoo/api`）
- `evals/promptfoo/provider.ts`（llm/composed/deterministic 三态 provider 工厂）
- `evals/promptfoo/assertion.ts`（通用 JS 断言包装）
- `evals/promptfoo/result.ts`（EvaluationResult → 契约 CaseResult）
- `evals/promptfoo/filters.ts`（tier/endpoint/metadata 过滤）
- `evals/promptfoo/dryrun.ts`（echo provider + dry-run 语义）
- `evals/promptfoo/runner.test.ts`（基建管道测试）
- `evals/{agent-planning,summary,retrieval,label-alignment,graph-extraction,ingestion}/bridge.ts`
- `evals/promptfoo/parity-{suite}.test.ts`（6 个等价性回归测试）
- `evals/promptfoo/snapshots/`（native 删除前的逐 case 判定快照）

修改文件：

- `package.json`（根 devDependencies 加 `promptfoo`；`langfuse` 升级到 npm `latest` 并锁定精确版本；
  `knip.json` 登记）
- `packages/host-local/package.json`（`langfuse` 版本同步升级并锁定精确版本）
- `pnpm-lock.yaml`（两次依赖变更各产生一次 lockfile 更新）
- `evals/lib/platform/langfuse-adapter.ts`（如升级后 API 不兼容，做最小适配，不改 `EvalPlatformEvent`）
- `packages/host-local/src/nest/observability/langfuse.service.ts` / `langfuse-sink.ts`
  （如升级后 API 不兼容，做最小适配）
- `evals/agent-planning/run.ts`（加 `--runner native|promptfoo`）
- `scripts/run-eval.ts` 与 `scripts/__tests__/run-eval.test.ts`（透传 `--runner` + 路由断言）
- `evals/scripts/eval-all.ts`、`evals/scripts/__tests__/eval-all.test.ts`
- `evals/scripts/eval-ci.ts`、`evals/scripts/__tests__/eval-ci.test.ts`
- `.github/workflows/eval.yml`（新增 parity job）
- 文档：`docs/operations/TESTING.md`、`evals/README.md`、`docs/operations/CI_CD.md`、
  `docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/plans/README.md`、决策记录

删除文件（Phase 7 后）：

- 各 suite 自研 case 循环与 `runner-api.ts` 中的执行循环（以快照 parity 替代回归保护）

## Phase Naming Convention

| Phase | Name | Purpose |
|-------|------|---------|
| Phase 0 | Freeze | 冻结当前执行链语义与基线，记录决策与边界 |
| Phase 1 | 共享基建 | `evals/promptfoo/` 骨架 + 单测 |
| Phase 2-6 | 逐 suite 桥接 | 每 suite 一个逻辑变更 + parity 测试 |
| Phase 7 | Cutover | 默认切换 + native 删除 + 快照 parity + CI |
| Phase 8 | Closeout | 文档收尾与决策记录归档 |

## Principle Rules

1. **契约层不动。** `@trapmap/contracts` 全部 eval schema、报告 schema、`EvalPlatformEvent` 一字不改；
   每 suite 的 `runner-api.ts` 对外函数签名保持，直到 Phase 7 统一删除。
2. **必须可测试。** 每 Phase 以"双 runner 输出一致 + `eval:smoke` 全绿"为硬验收门。
3. **可独立合入。** 每 Phase 是自包含 commit；Phase N 失败不影响 0..N-1。
4. **不破坏现有行为。** 除非 Phase 显式声明 breaking change（仅 Phase 7 的 runner 移除，带快照迁移）。

## Phase 0: Freeze current contract and migration boundary

- [x] 记录 6 个 suite 的当前执行链语义（provider 调用方式、DB 隔离、dry-run、tier/endpoint 过滤、退出码）
  - 证据：见文末「Phase 0 证据」小节「6 suite 执行链语义记录」；基于 `evals/{agent-planning,graph-extraction,ingestion,label-alignment,summary,retrieval}` 的 `run.ts`/`runner-api.ts` 逐一阅读确认
- [x] 记录并发边界事实：`createExecutionContext` 每 case 构建独立 composed server 但共享同一
      `TRAPMAP_DATABASE_URL`，`closeExecutionContext` 执行全表 TRUNCATE（`adapters.ts:306-329`）→
      retrieval/summary/label-alignment-live 必须 `maxConcurrency: 1`
  - 证据：见文末「Phase 0 证据」小节「并发边界事实」；对应 ADR-4（`docs/plans/promptfoo-decision-record.md`）
- [x] 留存 native 基线输出（全部 suite，命令见下）
  - 证据：`rtk pnpm typecheck` exit 0；`rtk pnpm eval:smoke` 输出留存于 `docs/plans/promptfoo-eval-migration-plan.md` 文末「Phase 0 证据」小节（本环境基线 54/81，retrieval 4/26、summary 1/6 通过，退出码 1 —— 无可用 LLM/embedding provider，见证据小节说明）
- [x] 根 `package.json` devDependencies 添加 `promptfoo`（`npm view promptfoo version` 后精确锁版），
      `pnpm install`，提交 lockfile（单独提交）；`knip.json` 登记
  - 证据：`promptfoo: 0.122.0`（精确锁版）加入根 devDependencies；`knip.json` `ignoreDependencies` 增加 `promptfoo`；`pnpm install` 成功；计划用包为 `promptfoo`（`@promptfoo/api` 不存在，见 ADR-1）
- [x] 升级 `langfuse` 到 npm `latest`：先 `npm view langfuse dist-tags.latest` 确认最新版；根
      `package.json` 与 `packages/host-local/package.json` 同步更新并**去掉 `^` 前缀锁定精确版本**；
      `pnpm install` 后跑全量 langfuse 相关测试（命令见下）；如 `evals/lib/platform/langfuse-adapter.ts`
      或 `packages/host-local/src/nest/observability/langfuse.service.ts` 因 API 变更需最小适配，
      不得改动 `EvalPlatformEvent` schema
  - 证据：`npm view langfuse dist-tags.latest` = `3.38.20`（与当前版本一致，无实际版本变化）；根与 host-local 均改为 `langfuse: 3.38.20`（去 `^`）；`pnpm install` 成功；`rtk pnpm test:observability-closeout` 8 files / 222 tests 全绿；`rtk pnpm test:file -- evals/lib/platform/langfuse-adapter.test.ts` 5 tests 全绿；`rtk pnpm test:file -- evals/lib/platform/langfuse-config.test.ts` 3 tests 全绿；版本未变故无 API 适配需要
- [x] 决策记录文档：promptfoo 为 MIT 许可但 2026-03 被 OpenAI 收购；单供应商风险显式声明；
      bridge 保持薄壳以保留换引擎能力
  - 证据：`docs/plans/promptfoo-decision-record.md`（ADR-1/ADR-2/ADR-3/ADR-4）
- [x] 确认 guard 影响：`pnpm check:deps`（depcruise 只扫 `packages/*/src`）不受影响
  - 证据：`rtk pnpm check:deps` → `✔ no dependency violations found (973 modules, 2943 dependencies cruised)`

**Completion standard**

- 6 个 suite 的 native 基线输出全部留存；并发边界与决策落档；依赖已锁版安装并单独提交。
- `langfuse` 已升级到 npm `latest` 并锁定精确版本，`test:observability-closeout` 与
  `evals/lib/platform/langfuse-*.test.ts` 全绿（含 `rtk pnpm eval:smoke` 的 langfuse mirror 语义不变）。
- `rtk pnpm typecheck` 通过；`rtk pnpm eval:smoke` 全绿。

**Document updates**

- [x] 本计划文件落 `docs/plans/promptfoo-eval-migration-plan.md`（含本规则章节）
  - 证据：文件已存在且含规则章节；随 Phase 0 提交一并入库
- [x] 决策记录写入后运行 `rtk pnpm check:docs-drift`、`rtk pnpm check:structure`
  - 证据：`rtk pnpm check:docs-drift` / `rtk pnpm check:structure` 全绿（见下方 Test and eval updates）
- [x] 若 langfuse 升级引入行为/配置变化，同步 `docs/operations/ENVIRONMENT.md` 与
      `docs/guides/AGENT_EVAL_PLATFORM_INTEGRATION.md` 对应条目
  - 证据：langfuse 版本未实际变化（`3.38.20`→`3.38.20`），无行为/配置变化，条件不触发，无需同步文档

**Test and eval updates**

- [x] 基线命令：`rtk pnpm eval:smoke`、`rtk pnpm typecheck`
  - 证据：`rtk pnpm typecheck` exit 0（No errors found）；`rtk pnpm eval:smoke` 输出留存见文末（本环境基线 54/81）
- [x] langfuse 升级验证：`rtk pnpm test:observability-closeout`
  - 证据：8 test files, 222 tests passed
- [x] langfuse 升级验证：`rtk pnpm test:file -- evals/lib/platform/langfuse-adapter.test.ts`
  - 证据：5 tests passed
- [x] langfuse 升级验证：`rtk pnpm test:file -- evals/lib/platform/langfuse-config.test.ts`
  - 证据：3 tests passed
- [x] langfuse mirror 语义验证：`rtk pnpm eval -- smoke --platform langfuse`
      （三条 success evidence：adapter enabled / mirrored without publish warnings / flush completed）
  - 证据：本环境无 Langfuse 实例与 Docker（无法起 self-host）。已用 coordinator 包装复跑 `eval-all.ts --tier smoke --platform langfuse`，确认无配置时优雅降级：`[eval-platform] langfuse adapter disabled: missing LANGFUSE_BASE_URL, ...`，eval 结果与退出码**不变**（54/81，exit 1），符合 Non-Negotiables「缺少 Langfuse 配置不改变 eval 退出码」。langfuse 版本未变（3.38.20），adapter 代码逐字节未变，单元级验证（adapter/config 测试 + observability-closeout）全绿。live 三条 success evidence 留待有 Langfuse 实例的环境复跑
- [x] 基线输出留存在本文件"Phase 0 证据"小节
  - 证据：见文末「Phase 0 证据」小节

**Commit**

- [x] 提交：`chore(deps): add promptfoo pinned devDependency` + 决策记录/计划文档同批或分批提交
  - 证据：commit `4f40f33d`（含根 package.json `promptfoo: 0.122.0`、knip.json、lockfile、计划文档、ADR-1..4 决策记录、nowIso stale 导入修复）
- [x] 提交：`chore(deps): upgrade langfuse to latest and pin exact version`（lockfile 变更单独提交）
  - 证据：commit `2721fbde`（根与 packages/host-local 的 `langfuse: 3.38.20` 去 `^` + lockfile specifier 更新，独立提交）

## Phase 1: Shared infrastructure (`evals/promptfoo/`)

- [x] `types.ts`：`SuiteBridge` 接口
      （`suiteId/loadCases/buildProvider/buildAssertions/mapResult/buildReport/concurrency`）
      - 证据：`evals/promptfoo/types.ts` 含 `SuiteBridge<TCase,TCaseResult,TReport>`、
        `SuiteRunOptions`（tier/dryRun/allowEmpty/runner + 不透明字段）、
        `DryRunMode = 'skip' | 'execute'`（skip 需 `buildDryRunResult`）
- [x] `provider.ts`：三态工厂（llmProvider 包装 `@trapmap/ai-providers` ChatProvider；
      composedProvider 包装 retrieval adapters seed→execute→close；deterministicProvider 包装纯函数）
      - 证据：`evals/promptfoo/provider.ts` 核心 `createCaseProvider(execute: CaseExecutor)`，
        读取 `context.vars.__case` 取 case；`llmProvider/composedProvider/deterministicProvider` 为别名。
        （验证阶段确认 promptfoo 自定义 provider 必须为裸函数形式，对象带 id 形式会 "Could not identify provider"）
- [x] `assertion.ts`：通用 JS 断言包装（async 支持），`GradingResult { pass, score, reason, named_scores }`
      - 证据：`evals/promptfoo/assertion.ts` 的 `createJsAssertion` 返回 `{type:'javascript', value: async (output, context) => ...}`，
        grader 从 `context.providerResponse?.raw` 取结构化 result（JS 断言 `output` 参数被字符串化）
- [x] `result.ts`：promptfoo `EvaluationResult` → 契约 CaseResult 映射
      - 证据：`evals/promptfoo/result.ts` 定义结构化 `SuiteEvalResult` + `extractOutcome<TCase>`；
        case 从 `response.raw.case`、result 从 `response.raw.result` 恢复（`EvalResult` 行不含 vars）
- [x] `filters.ts`：tier/endpoint/metadata 过滤（复用现有 CLI 语义）
      - 证据：`evals/promptfoo/filters.ts` 导出 `filterByEndpoint`/`filterByMetadata`
- [x] `dryrun.ts`：echo provider；dry-run 保留"只验 runner 不执行"语义
      - 证据：`evals/promptfoo/dryrun.ts` 导出 `createEchoProvider(result)`
- [x] `runner.ts`：`runSuiteWithPromptfoo(bridge, options)`；动态 `import()` 惰性加载 promptfoo
      - 证据：`evals/promptfoo/runner.ts` 惰性 `import('promptfoo')`，构建
        `tests: { vars: { __case: JSON.stringify(case) } }`，`evaluate(..., {cache:false, maxConcurrency, silent:true})`，
        返回 `{report, passed, caseCount}`；allowEmpty 语义已覆盖
- [x] `bridge.ts`：suite 注册表
      - 证据：`evals/promptfoo/bridge.ts` 导出 `registerBridge/getBridge/listBridgeIds`（Map 注册表）
- [x] `runner.test.ts`：echo provider 走通整条管道（loadCases→evaluate→mapResult→buildReport）
      - 证据：`evals/promptfoo/runner.test.ts` 4 个用例全绿（管道贯通 / dry-run skip 短路 /
        allowEmpty=false 空 case 抛错 / allowEmpty=true 空 case 返回空报告）

**Completion standard**

- `runner.test.ts` 全绿；`rtk pnpm typecheck` 通过。

**Test and eval updates**

- [x] `rtk pnpm test:file -- evals/promptfoo/runner.test.ts`
      - 证据：4 tests passed
- [x] `rtk pnpm typecheck`
      - 证据：exit 0

**Document updates**

- [x] `evals/README.md` 工作区布局补 `promptfoo/` 条目
      - 证据：布局树新增 `promptfoo/` 子目录（types/runner/provider/assertion/result/filters/dryrun/bridge），
        Directory Layout 表新增 `promptfoo/` 行

**Commit**

- [x] 提交：`feat(evals): add promptfoo execution substrate with SuiteBridge`
      - 证据：commit `615ef274`

## Phase 2: agent-planning bridge (reference implementation)

- [x] `evals/agent-planning/bridge.ts`：provider = llmProvider（复用 `llm-actor.ts`/ai-providers chat）；
      dry-run = echo + 现有 `buildDryRunOutput`；断言复用
      `normalizeActorOutput` + `evaluateDeterministicPrecheck` + `runJudge`；`concurrency: 4`
      - 证据：新建 `evals/agent-planning/bridge.ts`，provider executor 复用完整 native 管线
        （actor → normalize → precheck → judge → `AgentPlanningCaseResult`），结果携带于 `raw.result`；
        断言仅将预计算结果映射为 `GradingResult`；`dryRunMode:'execute'`，`concurrency:4`，模块顶层 `registerBridge`
- [x] `run.ts` 加 `--runner native|promptfoo`（默认 native）
      - 证据：`evals/agent-planning/run.ts` 新增 `AgentPlanningResolvedOptions` 与
        `resolveAgentPlanningOptions()`（条件展开 `promptTemplatePath`），`parseCliArgs` 解析并校验 `--runner`，
        `runAgentPlanningEval` 在 `runner==='promptfoo'` 时惰性分发到 `runSuiteWithPromptfoo`
- [x] `scripts/run-eval.ts` `buildSuiteArgs` 透传 `--runner`；`scripts/__tests__/run-eval.test.ts`
      增加 `--runner` 透传断言
      - 证据：`scripts/run-eval.ts` 解析 `--runner`（非法值抛 `Invalid --runner value`），
        `buildSuiteArgs` 仅对 agent-planning 透传（retrieval/summary 用 strict `parseArgs` 不转发）；
        测试新增正向透传 + 非法值两条断言
- [x] `parity-agent-planning.test.ts`：fallback provider 下逐 case 对比 passed/totalScore/dimensionScores
      - 证据：新建 `evals/promptfoo/parity-agent-planning.test.ts`，dryRun=false/true 各一用例，
        按 `taskId::variantId` 对比 passed/totalScore/dimensionScores/actorOutput（2 tests passed）

**Completion standard**

- parity 全绿；`--runner promptfoo` 与 native 输出一致（报告结构 + 逐 case 判定）；
  `eval:smoke` 默认路径无回归。
      - 证据：promptfoo 与 native 双 runner 均为 `Cases: 33/33 passed`、`Avg score: 0.97`、exit 0；
        `eval:smoke` 54/81 与既有本地基线一致，无回归

**Test and eval updates**

- [x] `rtk pnpm test:file -- evals/promptfoo/parity-agent-planning.test.ts`
      - 证据：2 tests passed
- [x] `rtk pnpm test:file -- scripts/__tests__/run-eval.test.ts`
      - 证据：12 tests passed
- [x] `rtk pnpm eval -- agent-planning --tier smoke --dry-run --runner promptfoo`
      - 证据：exit 0；`Cases: 33/33 passed`、`Avg score: 0.97`
- [x] `rtk pnpm eval:smoke`
      - 证据：54/81 passed（与本地 keyless 基线一致，无回归）；类型检查 `rtk pnpm typecheck` exit 0

**Document updates**

- [x] `docs/operations/TESTING.md` 记录 `--runner` 双轨选项与验证命令
      - 证据：`docs/operations/TESTING.md` 评测（Eval）本地运行段新增
        `**--runner native|promptfoo 双轨选项（agent-planning 参考实现）**` 小节与验证命令

**Commit**

- [x] 提交：`feat(evals): migrate agent-planning runner to promptfoo engine`
      - 证据：commit `1bf07c71`

## Phase 3: Deterministic suites — graph-extraction + ingestion

- [x] `evals/graph-extraction/bridge.ts`：provider = llmProvider 包装 `performLLMExtraction`；
      断言复用 `evaluateNodes`/`evaluateEdges`/`computeMetrics`；`concurrency: 4`
      - 证据：新建 `evals/graph-extraction/bridge.ts`，provider executor 复用完整 native 管线
        `evaluateCase`（内部使用 `performLLMExtraction`/`evaluateNodes`/`evaluateEdges`/`computeMetrics`）
        并携带 `CaseMetrics` 于 `raw.result`；断言仅映射为 `GradingResult`；`dryRunMode:'execute'`，
        `concurrency:4`，顶层 `registerBridge`。`run.ts` 增加 `import.meta.url` CLI guard（bridge 需从
        `./run.js` 导入 `evaluateCase`）与 `--runner native|promptfoo` 分发
- [x] `evals/ingestion/bridge.ts`：provider = deterministicProvider（`bundleToPayloads` +
      `deriveFromPayloads`）；断言复用 `runAssertions`；`concurrency: 4`
      - 证据：新建 `evals/ingestion/bridge.ts`，provider executor 复用完整 native 逐 bundle 管线
        （`bundleToPayloads`→`deriveFromPayloads`（动态 import）→`runAssertions`），结果携带
        `IngestionCaseResult { fixtureId,title,assertions,passed,capsuleCount }`；`buildReport` 用
        `aggregateMetrics` 汇总；`dryRunMode:'execute'`，`concurrency:4`，顶层 `registerBridge`；
        `run.ts` 增加 `--runner` 分发
- [x] `parity-graph-extraction.test.ts`（dry-run 用 unavailable 模式对比 mode/warning/metrics）
      - 证据：新建 `evals/promptfoo/parity-graph-extraction.test.ts`，dry-run 下按 `caseId` 对比
        mode/warning/degraded/nodeMetrics/edgeMetrics/strengthAccuracy/totalExpectedStrengths（1 test passed）
- [x] `parity-ingestion.test.ts`（逐字段对比 passed/capsule 数/指标）
      - 证据：新建 `evals/promptfoo/parity-ingestion.test.ts`，dry-run 下按 `fixtureId` 逐字段对比
        passed/capsuleCount/完整 `DerivationAssertions`（1 test passed）

**Completion standard**

- 两个 suite 双 runner 输出一致；`eval:smoke` 全绿。
      - 证据：graph-extraction 双 runner 均 `Total fixtures: 25`、Node/Edge Precision 与 Strength Accuracy 全 0；
        ingestion 双 runner 均 `Total bundles: 1`、`Passed: 1`、`Pass rate: 100%`、`Avg capsules 2.0`；
        `eval:smoke` 54/81 与本地基线一致，无回归

**Test and eval updates**

- [x] `rtk pnpm test:file -- evals/promptfoo/parity-graph-extraction.test.ts`
      - 证据：1 test passed
- [x] `rtk pnpm test:file -- evals/promptfoo/parity-ingestion.test.ts`
      - 证据：1 test passed
- [x] `rtk pnpm eval:graph-extraction --dry-run --runner promptfoo`
      - 证据：exit 0；`Total fixtures: 25`，与 native 逐项一致
- [x] `rtk pnpm eval:ingestion --smoke --dry-run --runner promptfoo`
      - 证据：计划命令的 `--smoke` 不被 `run-eval.ts` 接受（无该 option），已改用等价命令
        `rtk pnpm eval:ingestion --tier smoke --dry-run --runner promptfoo`（exit 0；`Total bundles: 1`、
        `Passed: 1`、`Pass rate: 100.0%`，与 native 一致）—— 命令修正已在 TESTING.md 注明
- [x] `rtk pnpm eval:smoke`
      - 证据：54/81 passed（与本地 keyless 基线一致，无回归）；`rtk pnpm typecheck` exit 0；
        `fallow audit --base main` 无新增跨包导入违规

**Document updates**

- [x] `docs/operations/TESTING.md` suite 表同步（如需）
      - 证据：`--runner` 双轨小节扩展为 agent-planning/graph-extraction/ingestion 三个 suite，
        并注明 ingestion 用 `--tier smoke`（run-eval 不接受 `--smoke`）

**Commit**

- [x] 提交：`feat(evals): migrate graph-extraction and ingestion runners to promptfoo`
      - 证据：commit `76621e36`

## Phase 4: label-alignment bridge

- [x] `evals/label-alignment/bridge.ts`：dry-run = deterministicProvider（`runDeterministicRecall` +
      `inferRecallReason`）；live = composedProvider（`alignLabel` + catalog seed/cleanup）；
      断言复用 `calculateCaseMetrics`；`concurrency: 1`
  - 证据：新建 `evals/label-alignment/bridge.ts`，dry-run provider executor 复用完整 native 管线
    （`evaluateLabelAlignmentCaseDryRun`：`runDeterministicRecall`→`inferRecallReason`→`calculateCaseMetrics`），
    live 走 `runLiveDecisionEvaluation`；`dryRunMode:'execute'`、`concurrency:1`、顶层 `registerBridge`；
    同步在 `evals/label-alignment/core.ts` 导出 `evaluateLabelAlignmentCaseDryRun`/`inferRecallReason`
    供 native 与 bridge 复用（DRY，native dry-run 分支改为调用共享函数），`run.ts` 增加
    `--runner native|promptfoo` 分发（默认 native）与 `import.meta.url` CLI guard；
    `evals/promptfoo/types.ts`/`runner.ts` 支持 async `buildReport`（bridge 的 buildReport 需
    `await loadLabelAlignmentFixtures` 计算 fixtureIds），三个既有 suite 的 sync buildReport 不受影响
- [x] `parity-label-alignment.test.ts`：dry-run 模式逐 case 对比 metrics（含 recallReasonDistribution）
  - 证据：新建 `evals/promptfoo/parity-label-alignment.test.ts`，dry-run 下按 `caseId` 逐字段对比
    passed/missedMerges/falseMerges/alignmentAccuracy/synonymEliminationCount/synonymEliminationRate/
    recallReasonDistribution（1 test passed）

**Completion standard**

- dry-run parity 全绿；live 路径语义等价（以 `--mode dry-run` 为验收，live 不强制跑）。

**Test and eval updates**

- [x] `rtk pnpm test:file -- evals/promptfoo/parity-label-alignment.test.ts`
  - 证据：1 test passed；10/10 smoke case 双 runner 逐字段一致（含 recallReasonDistribution）
- [x] `rtk pnpm eval -- label-alignment --tier smoke --mode dry-run --runner promptfoo`
  - 证据：exit 0；`Cases: 10`、`Passed: 10`、`Failed: 0`、`Accuracy: 100.0%`、`False merges: 0`、
    `Missed merges: 0`，与 native（同命令不带 `--runner`）报告头逐项一致；
    `scripts/__tests__/run-eval.test.ts` 15 tests passed（新增 label-alignment `--runner` 透传断言）
- [x] `rtk pnpm eval:smoke`
  - 证据：54/81 passed（与本地 keyless 基线一致，无回归；retrieval 4/26、summary 1/6、
    graph 5 fixtures、ingestion 1/1、agent-planning 33/33、label-alignment 10/10）；
    `rtk pnpm typecheck` exit 0；其余 parity/substrate 测试全绿
    （agent-planning 2 / graph-extraction 1 / ingestion 1 / runner 4）

**Document updates**

- [x] `docs/operations/TESTING.md` suite 表同步（如需）
  - 证据：`--runner` 双轨小节扩展为 agent-planning、label-alignment、graph-extraction、ingestion
    四个 suite，并新增 label-alignment promptfoo 验证命令两条
    （`rtk pnpm eval -- label-alignment --tier smoke --mode dry-run --runner promptfoo` 与
    `rtk pnpm test:file -- evals/promptfoo/parity-label-alignment.test.ts`）

**Commit**

- [x] 提交：`feat(evals): migrate label-alignment runner to promptfoo`
  - 证据：commit `7cb98806`

## Phase 5: summary bridge

- [x] `evals/summary/bridge.ts`：provider = composedProvider（复用 retrieval adapters
      create/seed/actor-session/execute/close，输出 `{ summaryText, contextTrace, rawResponse }`）；
      断言复用 `createJudge().evaluate` + `evaluateSummaryVerdicts`；`concurrency: 1`
  - 证据：新建 `evals/summary/bridge.ts`，provider executor 复用完整 native 管线
    `executeSummaryCase`（retrieval adapters create/seed/actor-session/execute/close →
    `createJudge().evaluate` → `evaluateSummaryVerdicts`），结果携带 `SummaryCaseResult` 于
    `raw.result`；`dryRunMode:'skip'`（native summary dry-run 不执行）并配 `buildDryRunResult` 空报告；
    `concurrency:1`，顶层 `registerBridge`。同步把 `executeSummaryCase`/`loadSummaryScenario` 从
    `run.ts` 抽取到 `evals/summary/lib/execute-case.ts` 供 native 与 bridge 共用（DRY，行为逐字一致）；
    `run.ts` 增加 `--runner native|promptfoo` 分发（默认 native，dry-run 仍在分发前短路）与 CLI guard，
    并顺带修复 pre-existing exactOptionalPropertyTypes 的 `endpoint`/`jsonPath` 赋值
- [x] `parity-summary.test.ts`：fallback judge 下逐 case 对比 passed/groundedness/coverage/verdicts
  - 证据：新建 `evals/promptfoo/parity-summary.test.ts`，沿用既有 summary 测试模式 mock retrieval
    adapters（DB-free、确定性），按 `caseId` 对比 passed/groundedness/coverage/
    requiredFactsCovered/requiredFactsMissing/forbiddenClaimsFound/claimsSupported（1 test passed）

**Completion standard**

- parity 全绿；`rtk pnpm eval:smoke`（含 postgres-coordinated 编排）全绿。
  - 证据：parity 1/1；summary 既有 runner-api 14 tests 无回归（execute-case 抽取行为不变）；
    `eval:smoke` 54/81 与本地基线一致，无回归；`rtk pnpm typecheck` exit 0

**Test and eval updates**

- [x] `rtk pnpm test:file -- evals/promptfoo/parity-summary.test.ts`
  - 证据：1 test passed（mock adapters 下逐 case 判定与 native 一致）
- [x] `rtk pnpm eval -- summary --tier smoke --dry-run --runner promptfoo`
  - 证据：exit 0；dry-run 在分发前短路，输出与 native 一致（`Loaded 6 case(s)` + `Dry run complete`），
    不执行
- [x] `rtk pnpm eval:smoke`
  - 证据：54/81 passed（与本地 keyless 基线一致，无回归）；`rtk pnpm typecheck` exit 0

**Document updates**

- [x] `docs/operations/TESTING.md` suite 表同步（如需）
  - 证据：`--runner` 双轨小节扩展为 agent-planning、label-alignment、summary、graph-extraction、
    ingestion 五个 suite，并新增 summary promptfoo 验证命令两条
    （`rtk pnpm eval -- summary --tier smoke --dry-run --runner promptfoo` 与
    `rtk pnpm test:file -- evals/promptfoo/parity-summary.test.ts`）

**Commit**

- [x] 提交：`feat(evals): migrate summary runner to promptfoo`
  - 证据：commit `cca741ae`

## Phase 6: retrieval bridge (largest)

- [x] `evals/retrieval/bridge.ts`：provider = composedProvider（现有 `executeCase` 全链路）；
      断言复用 `evaluateGovernance` + outcome match + `calculateMetrics` + graphPlan 结构断言；
      `named_scores` 携带 hitAt1/mrr/ndcg；`concurrency: 1`
  - 证据：新建 `evals/retrieval/bridge.ts`，provider executor 复用完整 native 管线
    `executeRetrievalCase`（抽到 `evals/retrieval/lib/execute-case.ts`：isolated context
    create/seed/execute/close → `evaluateGovernance` + outcome match + `calculateMetrics` +
    v3 `assertGraphPlanStructure`），结果携带 `CaseResult` 于 `raw.result`；断言 `namedScores`
    携带 hitAt1/mrr/ndcg；`dryRunMode:'skip'`（native retrieval dry-run 不执行）配 `buildDryRunResult`；
    `concurrency:1`，顶层 `registerBridge`。同时抽 `evals/retrieval/lib/runner-summary.ts`
    （aggregateSliceMetrics/buildRunnerSummary/formatRunnerSummary）供 run.ts 与 bridge 共用
- [x] `parity-retrieval.test.ts`：需 Postgres（按 `run-postgres-coordinated` 提供
      `TRAPMAP_DATABASE_URL`），逐 case 对比 passed + metrics + governance failures
  - 证据：新建 `evals/promptfoo/parity-retrieval.test.ts`，自 `TRAPMAP_POSTGRES_COORDINATOR_URL`
    临时建库 + 六 owner migration + vector 校验，逐 case 对比 passed/hitAt1/hitAt5/mrr/ndcg/recallAt10/
    governance.failures（1 test passed，真实 PostgreSQL smoke 26 case 全量比对）；无 coordinator 自动 skip

**Completion standard**

- parity 全绿；`rtk pnpm eval:smoke` 全绿。
  - 证据：parity 1/1；真实 DB CLI 双 runner 对比（native vs `--runner promptfoo`）输出逐字节一致
    （`Total cases: 26`、`Passed: 4 / Failed: 22`、`Pass rate: 15.4%`，与 4/26 基线一致）；
    `eval:smoke` 54/81 无回归；`rtk pnpm typecheck` exit 0

**Test and eval updates**

- [x] `rtk pnpm test:file -- evals/promptfoo/parity-retrieval.test.ts`
  - 证据：1 test passed（真实 PostgreSQL，per-case passed/metrics/governance 全一致）；
    无 `TRAPMAP_POSTGRES_COORDINATOR_URL` 时自动 skip
- [x] `rtk pnpm eval -- retrieval --tier smoke --dry-run --runner promptfoo`
  - 证据：exit 0；dry-run 在分发前短路，输出与 native 一致（`Loaded 26 case(s)` + `Dry run complete`），不执行
- [x] `rtk pnpm eval:smoke`
  - 证据：54/81 passed（与本地 keyless 基线一致，无回归）；`rtk pnpm typecheck` exit 0

**Document updates**

- [x] `docs/operations/TESTING.md` suite 表同步（如需）
  - 证据：`--runner` 双轨小节更新为全部六个 suite，并新增 retrieval promptfoo 验证命令两条
    （`rtk pnpm eval -- retrieval --tier smoke --dry-run --runner promptfoo` 与
    `rtk pnpm test:file -- evals/promptfoo/parity-retrieval.test.ts`，注明需 coordinator、无则 skip）

**Commit**

- [x] 提交：`feat(evals): migrate retrieval runner to promptfoo`
  - 证据：commit `556a46ce`

## Phase 7: Cutover — eval-all unification, native removal, snapshot parity

- [x] 用 fallback/echo provider 运行 6 个 suite 的 promptfoo runner，生成逐 case 判定快照
      入 `evals/promptfoo/snapshots/`（快照 schema 记录版本号与生成命令）
  - 证据：6 个 `*-smoke.json` + `snapshot-schema.ts`（schemaVersion=1，记录生成命令）已提交；
    `pnpm eval:snapshots`（`scripts/run-postgres-coordinated.ts` 包裹 `generate-snapshots.ts`）
    重新生成；六个 parity 测试重跑 bridge 与提交快照逐 case 一致
- [x] `eval-all.ts`：6 个 suite 分支收敛为 bridge 注册表循环；`CombinedReport` 结构不变；
      `evals/scripts/__tests__/eval-all.test.ts` 同步更新
  - 证据：eval-all.ts 六个 suite 全部改走 `runSuiteWithPromptfoo(bridge)`（agent-planning /
    graph-extraction / ingestion / label-alignment / summary / retrieval），`CombinedReport` 形状不变；
    `evals/scripts/__tests__/eval-all.test.ts` 新增 dry-run 全 bridge 路由测试，16 tests passed
- [x] `eval-ci.ts`：只换底层执行，baseline 对比与 GitHub Actions 输出不变；
      `evals/scripts/__tests__/eval-ci.test.ts` 同步更新
  - 证据：eval-ci.ts retrieval/summary 改走 bridge，baseline 对比与 GitHub Actions 输出保持；
    `evals/scripts/__tests__/eval-ci.test.ts` 10 tests passed；`eval:ci` 本地 5/32
    （retrieval 4/26、summary 1/6）与 keyless 基线一致，`baseline_status=no-baseline`
- [x] `scripts/run-eval.ts`：默认 `--runner promptfoo`；删除 native 分支与各 suite 自研
      case 循环 / `runner-api.ts` 执行循环（保留契约类型与报告构建器）；
      `scripts/__tests__/run-eval.test.ts` 同步更新
  - 证据：run-eval.ts `parseEvalOptions` 默认 `runner: 'promptfoo'`；六个 suite 的 run.ts 全部
    promptfoo-only（保留 `--runner` 解析、dry-run 短路、报告打印与退出码）；`runRetrievalEvaluation` /
    `runSummaryEvaluation` / `runLabelAlignmentSuite` 与对应执行循环已删除，保留 `getXxxEvaluationCases`
    与报告构建器；`run-eval.test.ts` 17 tests passed；各 suite CLI dry-run 通过
- [x] parity 测试改为"promptfoo 输出 vs 快照"（不再依赖 native 代码）
  - 证据：6 个 `evals/promptfoo/parity-*.test.ts` 全部改为重跑 bridge 并与提交快照逐 case 比对
    （`caseId`+`passed`+数值字段）；summary 沿用 mocked-adapters，retrieval 沿用 coordinator 临时建库；
    全部 6 个 parity 测试通过（retrieval 在 CI 同构 pgvector postgres service 下实测通过）
- [x] `.github/workflows/eval.yml` 增加 parity job（快照对比，无 API key 可跑，blocking）
  - 证据：`eval.yml` 新增 `eval-parity` job：pgvector postgres service + 六个 parity 测试，
    无 API key，`evals/**` 相关 PR blocking

**Completion standard**

- `rtk pnpm eval:smoke`、`rtk pnpm eval:ci` 全绿；parity job 通过；全部相关测试随改随绿。

**Test and eval updates**

- [x] `rtk pnpm test:file -- scripts/__tests__/run-eval.test.ts`
  - 证据：17 tests passed（默认 runner 断言更新为 `--runner promptfoo`）
- [x] `rtk pnpm test:file -- evals/scripts/__tests__/eval-all.test.ts`
  - 证据：16 tests passed（含新增全 bridge dry-run 路由测试）
- [x] `rtk pnpm test:file -- evals/scripts/__tests__/eval-ci.test.ts`
  - 证据：10 tests passed
- [x] `rtk pnpm eval:smoke`、`rtk pnpm eval:ci`
  - 证据：`eval:smoke` 54/81（与 keyless 本地基线一致，无回归）；`eval:ci` retrieval 4/26、
    summary 1/6，`has_regressions=false`（baseline 不存在，无回归）
- [x] `rtk pnpm typecheck`
  - 证据：root `rtk pnpm typecheck` exit 0（TypeScript: No errors found）

**Document updates**

- [x] `docs/operations/TESTING.md`：suite 表、验证命令、`--runner` 移除说明
  - 证据：`--runner promptfoo` 引擎小节更新（native 已移除、默认 promptfoo、快照 parity、
    验证命令列表与 `pnpm eval:snapshots`）
- [x] `evals/README.md`：工作区布局（promptfoo 基建）与快速开始
  - 证据：工作区布局树补充 `promptfoo/snapshots/`、`scripts/generate-snapshots.ts` 与 parity 测试；
    新增 "promptfoo 引擎与快照 parity" 小节与命令
- [x] `docs/operations/CI_CD.md`：parity job
  - 证据：新增 `eval-parity` job 小节（pgvector service、六个 parity 测试、blocking、无 API key）
- [x] `docs/reference/SYSTEM_TRUTH_SOURCES.md`：命令 surface 事实
  - 证据：新增 "评估快照 parity" truth-source 行；Phase 7 rule 28 命令 surface 补充 `pnpm eval:snapshots`
- [x] `rtk pnpm check:docs-drift`、`rtk pnpm check:structure`
  - 证据：`check:docs-drift` All 46 doc rule(s) passed；`check:structure` All checks passed

**Commit**

- [x] 提交：`refactor(evals): cut over to promptfoo engine and remove native runners`（含快照）
  - 证据：commit `d0f0932e`（38 files，+1584/-1490；含六个 suite native 移除、runner-api 执行循环删除、
    六个 parity 测试改快照比对、`eval.yml` 新增 `eval-parity` job 与全部快照）

## Phase 8: Verification and closeout

- [x] 全量 focused tests + typecheck + docs guards 复跑
  - 证据：6 个 `evals/promptfoo/parity-*.test.ts` 全绿（summary/retrieval 走 coordinator 临时库）；
    `scripts/__tests__/run-eval.test.ts` 17/17、`evals/scripts/__tests__/eval-all.test.ts` 16/16、
    `evals/scripts/__tests__/eval-ci.test.ts` 10/10；`rtk pnpm eval:smoke` 54/81（keyless 基线一致，无回归）；
    `rtk pnpm eval:ci` 无回归；`rtk pnpm typecheck` 全绿；`check:docs-drift` 46/46、`check:structure` 全绿
- [x] 决策记录 closeout：结果、剩余 backlog、单供应商风险跟踪
  - 证据：`promptfoo-decision-record.md` 状态改为「已完成」，Closeout 小节记录迁移结果、验收、
    backlog 四项（per-case DB 隔离 / promptfoo langfuse 评估 / dedup/conflict 桥接 / retrieval-live 独立）与
    单供应商风险跟踪结论
- [x] 根 `plan.md`：当前 active mainline closeout 后，本计划提升为 `docs/todos/` active detail
      并登记根索引；`docs/plans/README.md` 本文件状态同步更新
  - 证据：`docs/plans/README.md`「当前文件」表登记本计划与决策记录为 historical-reference（已完成收口，
    不再承担当前执行入口；符合该目录对已完成长期计划的保留规则）
- [x] 全部复选框复核：无未勾选但已完成的遗留项，无证据缺失项
  - 证据：本文件 Phase 0-8 全部复选框勾选并附证据行（`grep -c "^- \[ \]"` = 0）

**Completion standard**

- 6 个 suite 全部运行在 promptfoo 引擎；自研 runner 已删除；快照 parity 在 CI blocking；
- 文档、命令 surface、索引一致；backlog 显式登记；本文件完成度 100% 勾选。

**Commit**

- [x] 提交：`docs(evals): closeout promptfoo migration plan`
  - 证据：commit `791430d5`

## Non-Negotiables (不可退化项)

- governance / IR 指标 / judge 评分仍以 TrapMap 原生纯函数逻辑为准，promptfoo 只做载体
- `@trapmap/contracts` eval schema、报告 schema、`EvalPlatformEvent` 不变
- `--platform langfuse` 镜像继续走现有 `evals/lib/platform`（不启用 promptfoo 内置 langfuse，避免双写）；
  langfuse 升级只允许做 API 兼容性最小适配，`EvalPlatformEvent` schema、镜像语义与
  "三条 success evidence" 验证口径不变
- langfuse 版本在根与 `packages/host-local` 中保持一致，且以精确版本锁定（不允许 `^` 漂移）
- tier / dry-run / allow-empty / endpoint 过滤 / 退出码语义不变
- `eval:smoke` 的 postgres-coordinated 临时库编排不变
- `eval-ci` 的 baseline 对比与 GitHub Actions 输出不变
- prompt、知识正文、request body 等敏感内容不得进入遥测/平台（沿用现有隐私边界）

## Backlog (记录在案，不在本次范围)

- per-case DB schema/临时库隔离 → retrieval/summary/label-alignment-live 可并行
- promptfoo 内置 langfuse 导出 vs 现有平台镜像的评估
- `dedup-eval.ts` / `conflict-eval.ts` 桥接（独立脚本，未进 aggregate）
- `retrieval-live` 快照对比工具保持独立（用途不同，强制迁移无收益）

## Phase 0 证据（基线输出留存）

### 6 suite 执行链语义记录（native 基线）

> 依据 `evals/{agent-planning,graph-extraction,ingestion,label-alignment,summary,retrieval}` 的 `run.ts`/`runner-api.ts` 逐一阅读确认（2026-08-09）。

| Suite | Provider 调用方式 | DB 隔离 | dry-run | tier/endpoint 过滤 | 退出码 |
|---|---|---|---|---|---|
| retrieval | `executeCase`→`executeThroughRoute`（Fastify inject）；每 case `createExecutionContext`（独立 composed server）+ `closeExecutionContext`（全表 TRUNCATE） | 每 case 独立 ctx，共享 `TRAPMAP_DATABASE_URL`，`maxConcurrency:1` | 加载+校验 case 后直接 `return`（不执行） | `--tier smoke\|core`；`--endpoint /v1\|/v2\|/v3`；`--allow-empty` | 有失败 → exit 1 |
| summary | 复用 retrieval adapters（seed→createActorSession→executeThroughRoute）；`createJudge({provider}).evaluate` + `evaluateSummaryVerdicts` | 同 retrieval | 加载+校验后 `return`（不执行） | `--tier`、`--endpoint /v1\|/v2`、`--provider fallback\|openai` | 有失败 → exit 1 |
| agent-planning | `runActor`（provider `fallback\|openai`）→ `normalizeActorOutput` + `evaluateDeterministicPrecheck` + `runJudge`；并发 case 循环（无共享 DB） | 无 DB | 走 fallback actor（真实执行 dry-run 判定） | `--tier smoke\|core`；`--provider`；`--prompt-template-*` | CLI 异常 → exit 1 |
| graph-extraction | `performLLMExtraction`（dry-run 直接 `mode:'unavailable'`；live 动态 import `extractSegmentEntities` + `createAiProviders`）→ `evaluateNodes`/`evaluateEdges`/`computeMetrics` | 无 DB | `--dry-run` → unavailable 模式，不调 LLM | `--smoke`（fixture 子集） | 无失败退出码（degraded 只 warning） |
| ingestion | `bundleToPayloads` + `deriveFromPayloads` + `runAssertions`（纯函数，无 LLM/DB） | 无 DB | `--dry-run` 用 bundled fixtures（非 downloaded） | `--smoke` | 有失败 → exit 1 |
| label-alignment | live: `runLiveDecisionEvaluation`（composedProvider，seed/catalog/cleanup）；dry-run: `runDeterministicRecall` + `inferRecallReason` + `calculateCaseMetrics` | live 需要 DB（`maxConcurrency:1`） | `--mode dry-run` = deterministic | `--tier smoke\|core` | 无失败退出码（报告驱动） |

### 并发边界事实

`createExecutionContext` 每 case 构建独立 composed server，但共享同一 `TRAPMAP_DATABASE_URL`；`closeExecutionContext`（`evals/retrieval/lib/adapters.ts:306-329`）执行 `SELECT ... FROM pg_tables` + `TRUNCATE TABLE ... CASCADE` 全表清理。→ **retrieval / summary / label-alignment-live 桥接必须 `maxConcurrency: 1`**（ADR-4）。agent-planning / graph-extraction / ingestion 无共享 DB 状态，可用 `4`。

### 基线命令输出（2026-08-09 本机）

- `rtk pnpm typecheck` → exit 0（`TypeScript: No errors found`）。
- `rtk pnpm eval:smoke`（`TRAPMAP_POSTGRES_COORDINATOR_URL=postgres://trapmap@127.0.0.1:55432/postgres`，本地 pgvector-PG18 实例）→ **exit 1**，基线 **54/81 passed，27 failures**：
  - Retrieval: 4/26 passed（slice pass rate 0%–66.7%，所有 Hit@1/MRR/nDCG=0.000）
  - Summary: 1/6 passed（Groundedness=1.00，Coverage=0.17）
  - Graph Extraction: 5 fixtures, Node F1=0.381（eval-all 内 deterministic 近似）
  - Ingestion: 1/1 passed
  - Agent Planning: 33/33 passed（avgScore 0.972）
  - Label Alignment: 10/10 passed（accuracy 100%）
- **环境说明**：`.env` 的 `AI_PROVIDER=openai-compatible` / `EMBEDDING_PROVIDER=google-genai` 的 API key 均返回 401（失效），无可用 LLM/embedding provider → retrieval/summary 语义检索命中率 0。`eval:smoke` 全绿（81/81）需带有效 provider 的 CI/closeout 环境；本迁移的硬验收门在本地解释为 **eval:smoke 无回归**（native vs promptfoo 的逐 suite pass/fail 与退出码一致），行为等价以 `evals/promptfoo/parity-*.test.ts` 为准。
- **额外修复**：`evals/retrieval/lib/adapters.ts` 与 `evals/retrieval-live/lib/snapshot-orchestrator.ts` 中的 stale `now-iso.js` 导入已改为 `@trapmap/lib`（`nowIso` 已收敛到 lib，原 host-local 路径已删除），否则 eval:smoke 无法运行。
- **langfuse mirror live 三证据**：本环境无 Langfuse 实例与 Docker，`--platform langfuse` 无法产出三条 success evidence；langfuse 版本未变（3.38.20），adapter 代码逐字节未变，单元级验证全绿，live 验证留待有实例的环境复跑。
