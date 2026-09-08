# 评估框架

> 真源：`evals/`（runner、datasets、scenarios）。状态：Active。

## 概述

你用两层验证系统正确性：smoke（快速）与 core（全面），覆盖检索质量、摘要生成、治理执行。CI 门禁是 `eval:smoke`。

> **设计灵感：** Experience Gene 的评测门控直接汲取 *From Procedural Skills to Strategy Genes*（https://arxiv.org/html/2604.15097v2）的实证范式——Gene 在 45 scenarios / 4590 trials 上以 ~230 tokens 取得 +3.0pp 增益，而文档型 Skill 以 ~2500 tokens 反而 -1.1pp。本仓据此冻结 `evals/experience-gene/` 的 `smoke(3) / core(10)` 分层与 `safety=0、precision≥0.80、quality≥-2pp、pitfall不回退、overconstraint不增、cost≤+10%` 六门槛，并在 `docs/archived/archived-plans/experience-gene-governance-evaluation-rollout-archived.md（已归档，路径冻结）` 中规定 live `baseline/shadow/serve` 同 seed 对比与 20-Gene 治理抽样方可 promotion。

## 跑法

前置条件：目标服务器运行中（runner 对活服务执行）。

```bash
pnpm --filter @trapmap/evals eval:smoke
pnpm --filter @trapmap/evals eval:core
pnpm --filter @trapmap/evals eval:smoke -- --verbose
pnpm --filter @trapmap/evals eval:retrieval:smoke
```

统一入口由 `scripts/run-eval.ts` 提供；完整选项执行 `pnpm --filter @trapmap/evals eval -- --help` 查看。

## 评估类型

### 检索评估

用例结构见 `evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts`（`RetrievalTestCase`：`id / description / query / tier / expected`），场景见 `evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts`。指标：Hit@K、MRR、nDCG。datasets 与 scenarios 下各有 `smoke/` 与 `core/` 分层。

### 摘要评估

指标：Groundedness、Coverage、Hallucination。

### 治理评估

指标：等级检查、RBAC 检查、作用域检查。

## 性能阈值

`docs/architecture/performance/` 下三文件已完成并归档（2026-09-08）；毫秒阈值与实测耗时属易变数字，本页不收录。你看现网值时以 CI 压测输出（`benchmarks/results/`）为准。

## 常见用法

### 你跑 smoke 门禁

前置条件：Docker 可用；脚本自带 PG 编排。

```bash
pnpm --filter @trapmap/evals eval:smoke
```

CI 门禁是 `eval:smoke`，见本页「概述」节。

### 你列全量评估选项

前置条件：离线可跑。

```bash
pnpm --filter @trapmap/evals eval -- --help
```

统一入口由 `scripts/run-eval.ts` 提供。

### 你跑检索冒烟

前置条件：目标服务器运行中。

```bash
pnpm --filter @trapmap/evals eval:retrieval:smoke
```
