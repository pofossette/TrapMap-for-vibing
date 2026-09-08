# Agent Planning Eval

你用这个套件比较 `skill-set` 与 `plan-graph-set` 在相同任务上的路径规划表现。

## 跑法

```bash
pnpm --filter @trapmap/evals eval:agent-planning:smoke
pnpm --filter @trapmap/evals eval:agent-planning:dry-run
pnpm --filter @trapmap/evals eval:agent-planning:core
```

smoke 为 CI 门禁 tier，core 数据已归档到 `evals/agent-planning/archived/`，`--tier core` 只供手动运行。入口为 `evals/agent-planning/run.ts`，tier 定义见 `evals/agent-planning/smoke.ts` 与 `evals/agent-planning/core.ts`，用例见 `evals/agent-planning/datasets/` 与 `evals/agent-planning/scenarios/`，实现见 `evals/agent-planning/lib/`。

## 结果读法

你读 native JSON report 的三层聚合（case / group / slice）与 deterministic precheck（缺失步骤、缺失关键动作、命中禁止动作、空输出、不可解析输出）。改 case / scenario 后若判定变化，你同步重跑 parity 快照（`pnpm --filter @trapmap/evals eval:snapshots`）并提交。
