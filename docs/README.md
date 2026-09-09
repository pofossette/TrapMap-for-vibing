# TrapMap 文档

> 状态：Active（2026-09-08）。本文档是 thin index，只做导航；事实细节以权威页为准。

## 当前状态

当前无 active mainline（2026-09-08）：依赖升级与 AI SDK 统一已完成并归档（2026-09-08）。排队项见根 [plan.md](../plan.md)。微服务平台能力增强细则已完成并归档（2026-09-08），历史背景输入，不再作为当前根计划执行面，仅作 background 或 deferred reference。

## 文档地图

- [reference/](reference/) — 真相源：目录结构、表结构、API 表面、术语、环境变量。先读 [系统权威事实源](reference/SYSTEM_TRUTH_SOURCES.md)。
- [architecture/](architecture/) — 架构说明：宿主、内核、服务边界、部署。入口见 [TrapMap 架构](architecture/ARCHITECTURE.md)。
- [guides/](guides/) — 上手与集成：[快速上手指南](guides/GETTING_STARTED.md)、[TrapMap 代码导读](guides/CODE_GUIDE.md)、[投稿指南](guides/CONTRIBUTING.md)、[代码风格指南](guides/CODE_STYLE.md)、[开发工作流](guides/DEV_WORKFLOW.md)。
- [operations/](operations/) — 运行与质量：[测试指南](operations/TESTING.md)、[CI/CD 流水线](operations/CI_CD.md)、[安全指南](operations/SECURITY.md)。
- [todos/](todos/README.md) — 执行面：当前主线、债务登记、排队 spec。
- [PACKAGES.md](PACKAGES.md) — 包总表：全包一行一条，细节链各包 README。
- [superpowers/](superpowers/README.md) — Superpowers 生成物沉淀区。

## 验证

全量门禁是 `pnpm run ci`；评测 core 层用 `pnpm --filter @trapmap/evals eval:ci:core`。

```bash
pnpm run ci
pnpm --filter @trapmap/evals eval:ci:core
```

### 评测命令速查

| 命令 | 说明 |
|------|------|
| `pnpm --filter @trapmap/evals eval -- smoke` | smoke 层统一评测（PG 协调，需 Docker） |
| `pnpm --filter @trapmap/evals eval -- retrieval` | 仅检索评估 |
| `pnpm --filter @trapmap/evals eval -- summary` | 仅摘要评估 |
| `pnpm --filter @trapmap/evals eval -- agent-planning --tier smoke` | 路径规划评估（core 已归档，见 TESTING.md） |
| `pnpm --filter @trapmap/evals eval -- label-alignment --tier smoke --mode live` | 标签对齐评估（`--mode dry-run` 离线可跑） |
| `pnpm --filter @trapmap/evals eval:ci` | baseline-aware CI runner（默认 smoke） |
| `pnpm --filter @trapmap/evals eval:ci:core` | baseline-aware CI runner（core 入口） |
| `pnpm run ci` | 仓库聚合 CI 本地入口 |

### deployment 最小验证（8 行）

```bash
pnpm test:observability-closeout
pnpm test:observability-benchmark
pnpm test:discovery-closeout
pnpm test:distributed-closeout
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm typecheck
pnpm check:docs
```

运行与质量三页：[测试指南](operations/TESTING.md) · [CI/CD 流水线](operations/CI_CD.md) · [安全指南](operations/SECURITY.md)。

轻宿主是 `Nest modular monolith`；事实冲突时以 `reference/` 为准。
