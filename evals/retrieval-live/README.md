# Live Retrieval Evaluation

你用这个套件对运行中的真实后端做检索评测，命名 snapshot 钉住数据变量。

## 跑法

```bash
pnpm --filter @trapmap/evals eval:retrieval:live:smoke --snapshot-version 2026-07-baseline --base-url http://localhost:3000
pnpm --filter @trapmap/evals eval:retrieval:live --snapshot-version 2026-07-baseline --base-url http://localhost:3000 --endpoint /v2/retrieval/search
pnpm --filter @trapmap/evals eval:retrieval:live --snapshot-version 2026-07-baseline --base-url http://localhost:3000 --dry-run
pnpm --filter @trapmap/evals eval:retrieval:live:compare --baseline ./reports/live-baseline.json --current ./reports/live-current.json
```

入口为 `evals/retrieval-live/run.ts`，版本对比见 `evals/retrieval-live/compare.ts`，用例见 `evals/retrieval-live/datasets/`，命名 snapshot 见 `evals/retrieval-live/snapshots/` 下的版本子目录。运行前你准备可访问的 TrapMap 实例、PostgreSQL（`TRAPMAP_LIVE_EVAL_DATABASE_URL` 或 `TRAPMAP_DATABASE_URL`）与 token（`TRAPMAP_LIVE_EVAL_TOKEN`）。snapshot 分 frozen 与 rebuild 两档，rebuild 只存源数据，由流水线重推导。

## 结果读法

你读同一 snapshot 下的检索质量，跨版本对比读 `compare.ts` 的差异输出。本套件不进默认 CI，你只拿它回答真实服务在给定语料上的表现。
