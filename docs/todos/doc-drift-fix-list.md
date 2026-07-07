# 文档漂移与翻译修复清单

> 更新于 2026-07-07。本轮按子包和文档域分区核验：基础包 README、宿主 README、service README、`docs/architecture`、`docs/guides`、`docs/operations`、`docs/reference`、根入口文档。核验基线以源码、`package.json`、`.github/workflows/ci.yml`、[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md)、[`docs/reference/REPO_STRUCTURE.md`](../reference/REPO_STRUCTURE.md) 为准。

## 本轮目标

- 用分区子代理逐个子包核验 README 和关键文档是否仍与代码一致。
- 汇总当前明确存在的文档漂移、断链、术语偏差和中文化缺口。
- 给出只涉及文档层的修复顺序，作为当前活跃配套清单。

## 执行方案

### 分区方式

1. 基础包 README：`cli`、`client-core`、`contracts`、`server`、`backend-core`
2. 宿主与运行时 README：`host-local`、`host-distributed`、`runtime-infra`
3. service 包 README：六个 `packages/service-*`
4. 架构文档：`docs/architecture/*`
5. 指南与运维文档：`docs/guides/*`、`docs/operations/*`
6. 事实源与入口文档：根 `README.md`、`docs/README.md`、`docs/reference/*`

### 校验口径

- 事实是否与当前代码一致
- 链接和路径是否仍存在
- 命令、环境变量、Node/pnpm 基线是否与当前脚本/CI 一致
- 文档语言是否符合“简体中文优先”

### 交付要求

- 高优先级先修断链、错误事实、错误命令、错误环境变量
- 中优先级修目录/数量/阶段描述漂移
- 低优先级统一处理中英文混写和局部表述不规范

## 汇总结果

### 范围结论

- `packages/service-*` 六个 README：本轮未发现与源码或 truth source 冲突的明确漂移
- `packages/cli/README.md`、`packages/client-core/README.md`：本轮未发现明确漂移
- 其余文档存在 25 个明确问题，其中 `high` 9 个、`medium` 13 个、`low` 3 个

### 高优先级问题

| ID | 文件 | 问题 | 修复动作 |
|---|---|---|---|
| H-01 | `packages/host-distributed/README.md` | 仍把 `host-distributed` 写成仅承载 `knowledge-read` 的薄宿主，但当前包实际负责 `gateway + identity-access + knowledge-read + knowledge-write + candidate-ingestion + governance-review + job-runtime` 多服务入口 | 改写职责段，明确它是分布式宿主装配层和多服务入口 owner |
| H-02 | `docs/architecture/ARCHITECTURE.md` | 仍写“当前实现仍以 Fastify 宿主为主”，与 `host-local` 默认 Nest 主线和 `server` 仅为 compatibility shell 的现状冲突 | 把默认主线改成 `packages/host-local/src/nest/**`，把 Fastify 收口为兼容壳 |
| H-03 | `docs/architecture/DEPLOYMENT.md` | 前置条件仍写 `Node.js 20+` / `pnpm 10+`，与当前 CI 和根脚本冻结的 `Node 24 + pnpm 10.33.0` 不一致 | 统一到 Node 24 / pnpm 10.33.0 |
| H-04 | `docs/reference/DOCS_TRUTH_MATRIX.md` | 仍引用不存在的 `docs/todos/trapmap-architecture-remediation-plan.md` | 改为真实归档路径或当前有效事实源路径 |
| H-05 | `docs/guides/GETTING_STARTED.md` | 前置要求仍写 `Node.js ≥ 20`，与当前 CI 基线不一致 | 统一到 Node 24，并同步快速开始前置说明 |
| H-06 | `docs/guides/MIGRATION_GUIDE.md` | 服务树和验收构建步骤漏掉 `@trapmap/service-knowledge-read` | 补进目录树和 build 列表 |
| H-07 | `docs/guides/MIGRATION_GUIDE.md` | 仍提到不存在的 `pnpm dev:server:compat*` 脚本 | 删除过时入口，改成当前真实兼容入口说明 |
| H-08 | `docs/operations/CI_CD.md` | `fallow-push-audit` 文案仍包含 `--fail-on-regression`，与当前 `ci.yml` 不一致 | 删掉过时 flag，改成当前 workflow 命令 |
| H-09 | `docs/operations/OBSERVABILITY-OPERATIONS.md` | 仍使用过时的 `OTEL_ENABLED` / `OTEL_SAMPLING_RATE` / `OTEL_TRACES_EXPORTER` / `OTEL_LOGS_EXPORTER` 变量名，和当前实现冲突 | 改成 `OTEL_DISABLED`、`OTEL_SAMPLE_RATE`、`OTEL_EXPORTER_OTLP_ENDPOINT`、`LOKI_HOST` 等现行变量 |

### 中优先级问题

| ID | 文件 | 问题 | 修复动作 |
|---|---|---|---|
| M-01 | `packages/contracts/README.md` | 仍引用不存在的 `src/types/` | 把导航改为 `src/domain/` / `src/index.ts` |
| M-02 | `packages/server/README.md` | 仍列出不存在的 `src/types/` | 删除该路径或替换为真实目录 |
| M-03 | `packages/server/src/routes/README.md` | “Current Route Groups” 漏掉 `routes/feedback-admin/` | 补充路由组和职责说明 |
| M-04 | `docs/reference/SYSTEM_TRUTH_SOURCES.md` | “Schema 数量”清单漏掉 `labels.ts` | 将 `labels.ts` 纳入，或改成不枚举单文件的稳态写法 |
| M-05 | `docs/README.md` | 仍两处写“57 张表”，与当前 `DATABASE_SCHEMA.md` 的 `63 张表` 不一致 | 两处同步改成 `63 张表` |
| M-06 | `docs/architecture/ARCHITECTURE.md` | 仍把 Nest 试点描述为 `gateway + knowledge-read` 阶段，和当前六个 bounded context 已注册的现状不一致 | 改成历史叙述，或更新为当前完整模块图 |
| M-07 | `docs/architecture/OBSERVABILITY.md` | 仍把 `OTEL_ENABLED` 当作总开关，而实际实现使用 `OTEL_DISABLED` | 全文改为 `OTEL_DISABLED` 语义，并同步 profile 说明 |
| M-08 | `docs/architecture/SERVICE-DISCOVERY.md` | 将服务注册实现归属到 `packages/host-distributed/src/service-discovery/`，但真实实现位于 `packages/host-local/src/nest/service-discovery/` | 修正目录归属和宿主所有权描述 |
| M-09 | `docs/architecture/SERVICE_BOUNDARIES.md` | 仍写“前五个物理 `service-*` 拆分”，但仓库已有六个 `service-*` 包 | 将计数改为 6，或说明统计口径 |
| M-10 | `docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md` | 重复出现两次 `Blocking gaps:` 标题 | 合并重复标题，保留单一结构 |
| M-11 | `docs/guides/GETTING_STARTED.md` | 把 PostgreSQL 写成“默认”，但当前仍存在未配置数据库 URL 时回退 `JsonStore` 的姿态 | 改成“推荐 PostgreSQL，未配置时仍可 JSON fallback” |
| M-12 | `docs/operations/CI_CD.md` | `coverage` 产物“保留 7 天”在当前 workflow 中没有对应 `retention-days` 配置 | 改成真实描述，或补充说明当前未显式设置保留期 |
| M-13 | `docs/operations/CI_CD.md` | “所有 job 都是 Node 24” 的表述与 `eval.yml` 仍使用 Node 20 的现状冲突 | 明确区分不同 workflow，或统一版本后再写单一口径 |
| M-14 | `docs/operations/OBSERVABILITY-OPERATIONS.md` | retention 期限和 override 变量未在当前配置文件中落地 | 改成“当前未配置 retention”或补齐配置事实 |
| M-15 | `docs/operations/OBSERVABILITY-OPERATIONS.md` | 故障排查中仍写 `LOKI_URL`，且 `/live` / `health` 行号引用过期 | 改成 `LOKI_HOST`，并刷新源码引用 |

### 低优先级问题

| ID | 文件 | 问题 | 修复动作 |
|---|---|---|---|
| L-01 | `packages/server/README.md` | `run-startup-sequence.ts` 被写成“5 阶段”，源码枚举实际为 6 个步骤 | 改准确计数，或改成不写死阶段数 |
| L-02 | `README.md` | `TL;DR` 标题仍为英文 | 改成简体中文标题，如“简要说明” |
| L-03 | `docs/operations/ENVIRONMENT.md` | `TRAPMAP_EVAL_PLATFORM` 被写成当前变量，但当前实现仍依赖 `--platform` 参数 | 标成规划/占位变量，或移出当前生效变量区 |

## 简体中文翻译处理清单

以下文件本轮没有发现明确事实漂移，但仍属于应纳入后续中文化收口的目标：

- `packages/server/README.md`
- `packages/server/src/lib/README.md`
- `packages/backend-core/README.md`
- `docs/architecture/MODULE_STRUCTURE.md`

处理规则：

1. 先修事实漂移，再做翻译
2. 翻译时不得引入第二套术语
3. 若暂时保留英文，应显式标注“英文保留件”并说明原因

## 建议修复批次

### 批次 1：事实与入口真相

- 修 `packages/host-distributed/README.md`
- 修 `docs/architecture/ARCHITECTURE.md`
- 修 `docs/architecture/DEPLOYMENT.md`
- 修 `docs/reference/DOCS_TRUTH_MATRIX.md`

最小验证：

```bash
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

### 批次 2：源码路径与事实源同步

- 修 `packages/contracts/README.md`
- 修 `packages/server/README.md`
- 修 `packages/server/src/routes/README.md`
- 修 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- 修 `docs/README.md`

最小验证：

```bash
rtk pnpm check:docs-drift
rtk pnpm check:links
```

### 批次 3：架构术语与中文化

- 修 `docs/architecture/OBSERVABILITY.md`
- 修 `docs/architecture/SERVICE-DISCOVERY.md`
- 修 `docs/architecture/SERVICE_BOUNDARIES.md`
- 修 `docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md`
- 翻译 `packages/server/README.md`、`packages/server/src/lib/README.md`、`packages/backend-core/README.md`、`docs/architecture/MODULE_STRUCTURE.md`

最小验证：

```bash
rtk pnpm check:md-lint
rtk pnpm check:links
rtk pnpm check:docs-drift
```

### 批次 4：指南与运维事实同步

- 修 `docs/guides/GETTING_STARTED.md`
- 修 `docs/guides/MIGRATION_GUIDE.md`
- 修 `docs/operations/ENVIRONMENT.md`
- 修 `docs/operations/CI_CD.md`
- 修 `docs/operations/OBSERVABILITY-OPERATIONS.md`

最小验证：

```bash
rtk pnpm check:docs-drift
rtk pnpm check:links
rtk pnpm check:md-lint
```

## 本轮未发现明确漂移的包

- `packages/cli/README.md`
- `packages/client-core/README.md`
- `packages/host-local/README.md`
- `packages/runtime-infra/README.md`
- `packages/service-identity-access/README.md`
- `packages/service-knowledge-read/README.md`
- `packages/service-knowledge-write/README.md`
- `packages/service-governance-review/README.md`
- `packages/service-candidate-ingestion/README.md`
- `packages/service-job-runtime/README.md`

## 备注

- `docs/guides` / `docs/operations` 分区结果已补齐，并已并入本清单。
- 本清单只记录当前已被代码和 truth source 证实的问题，不把“可改进但不构成漂移”的建议混入待修事实。
