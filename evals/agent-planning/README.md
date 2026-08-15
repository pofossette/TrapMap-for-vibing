# Agent Planning Eval

首版脚手架提供独立的 `agent-planning` eval suite，用于比较 `skill-set` 和 `plan-graph-set` 在相同任务上的路径规划表现。

当前能力：

- smoke fixture 校验与加载
- 无 provider 环境下的 deterministic dry-run
- deterministic precheck：缺失步骤、缺失关键动作、命中禁止动作、空输出、不可解析输出
- case/group/slice 三层聚合报表
- suite 侧 platform event 构建：基于 native report 镜像 `run` / `case` / `score` / `assertion` / `trace` 事件

目录：

- `run.ts`：运行入口
- `smoke.ts` / `core.ts`：tier 导出（`core.ts` re-export `archived/` 数据）
- `datasets/smoke/`、`scenarios/smoke/`：smoke case 与场景
- `archived/datasets/core/`、`archived/scenarios/core/`：Wave 8 归档的 core 数据（手动 tier）
- `lib/`：prompt、context、actor、judge、normalizer、scoring、report、format、platform event builder

平台集成边界：

- `agent-planning` native JSON report 仍是 truth source
- `lib/platform-events.ts` 负责把 report 投影成统一 platform events
- `evals/scripts/eval-all.ts` 只消费这些事件并交给 adapter 发布，不再反向解析 suite 内部结构

手动运行：

```bash
pnpm exec tsx --tsconfig tsconfig.base.json evals/agent-planning/run.ts --tier smoke --dry-run
```

## Owner 与变更门禁

- **Owner**：agent-planning eval owner
- **Tier 状态**：smoke 是 CI 门禁 tier；core 已归档到 `archived/`（`--tier core` 仍可手动运行，不进 CI）
- **变更必跑**：`pnpm test:file -- evals/promptfoo/parity-agent-planning.test.ts`（快照 parity）+ `pnpm test:file -- evals/agent-planning/runner.test.ts`（数据集自洽与 dry-run）
- 修改 case/scenario 后若判定发生变化，需同步重新生成并提交 parity 快照（`pnpm eval:snapshots`）
