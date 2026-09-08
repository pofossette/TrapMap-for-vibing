# 检索评测数据集（离线）

你用这个套件在进程内评测检索端点，它与 `evals/retrieval-live/` 互补。

## 跑法

```bash
pnpm --filter @trapmap/evals eval:retrieval:smoke
pnpm --filter @trapmap/evals eval:retrieval:core
pnpm --filter @trapmap/evals eval:retrieval:dry-run
pnpm --filter @trapmap/evals eval:retrieval --tier smoke --endpoint /v2/retrieval/search
```

离线 eval 用进程内组合服务加 `app.inject()` 执行，需要 PostgreSQL 连接（`TRAPMAP_DATABASE_URL`），每个 case 独立隔离，不依赖外部服务。入口为 `evals/retrieval/run.ts`，核心实现见 `evals/retrieval/core.ts`，用例见 `evals/retrieval/datasets/`。你需要真实后端评测时改用 `evals/retrieval-live/`。

| 端点 | 响应形状 |
| --- | --- |
| `/v1/retrieval/search` | 分桶（`globalConstraints`、`projectKnowledge`） |
| `/v1/retrieval/skills/search-by-content` | artifact-first（`matches`） |
| `/v2/retrieval/search` | 胶囊优先（`capsules`、`profileHints`） |
| `/v3/retrieval/search` | 图规划包装（`plan` 或治理 `fallback`，含路由追踪） |

## 结果读法

你按端点读召回与排序指标，v1 / v2 / v3 的响应契约不同，你不跨端点直接对比分数。离线 smoke 纳入 CI，core 加宽覆盖。
