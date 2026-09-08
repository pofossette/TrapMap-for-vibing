# 摘要评测

你用这个套件以法官验证方式给检索上下文中 LLM 生成摘要打分。

## 跑法

```bash
pnpm --filter @trapmap/evals eval:summary:smoke
pnpm --filter @trapmap/evals eval:summary:core
pnpm --filter @trapmap/evals eval:summary:dry-run
pnpm --filter @trapmap/evals eval:summary --tier smoke --endpoint /v2/retrieval/search
pnpm --filter @trapmap/evals eval:summary --tier smoke --provider fallback
pnpm --filter @trapmap/evals eval:summary --tier core --json --json-path ./reports/summary.json
```

入口为 `evals/summary/run.ts`，核心实现见 `evals/summary/core.ts`，用例见 `evals/summary/datasets/`。`evals/summary/lib/platform-events.ts` 把 native report 投影成统一 platform events，aggregate runner 只消费这些事件。`--platform` 参数只对 aggregate 套件（`pnpm --filter @trapmap/evals eval -- smoke|core|all`）生效。

## 结果读法

你读可 grounding 性等三方面分数与 suite 侧 report，native JSON report 为真相源。`--provider fallback` 适合作无 key 基线，你不拿它当质量证据。
