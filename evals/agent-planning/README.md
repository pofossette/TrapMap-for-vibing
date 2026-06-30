# Agent Planning Eval

首版脚手架提供独立的 `agent-planning` eval suite，用于比较 `skill-set` 和 `plan-graph-set` 在相同任务上的路径规划表现。

当前能力：

- smoke fixture 校验与加载
- 无 provider 环境下的 deterministic dry-run
- deterministic precheck：缺失步骤、缺失关键动作、命中禁止动作、空输出、不可解析输出
- case/group/slice 三层聚合报表

目录：

- `run.ts`：运行入口
- `smoke.ts` / `core.ts`：tier 导出
- `datasets/`：case 数据
- `scenarios/`：任务与上下文场景
- `lib/`：prompt、context、actor、judge、normalizer、scoring、report、format

手动运行：

```bash
rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/agent-planning/run.ts --tier smoke --dry-run
```
