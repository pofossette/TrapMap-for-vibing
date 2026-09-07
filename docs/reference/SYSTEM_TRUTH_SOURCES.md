# 系统权威事实源

> 状态：Active。核对日期：2026-09-08。你在二级文档里看到冲突说法时，以本页表格为准，不要信复述。

每个架构事实只认一个权威来源。二级文档不重复事实细节，只给链接。复述即漂移。

> packages/server（Wave-10 已删除）。你不再把它当入口。唯一入口是 `packages/host-local`、`packages/host-distributed` 加 6 个 service owner 包和 `packages/backend-core`。历史追溯见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`。
>
> 历史 closeout 证据（如文档校验与可观测性平台主线 `docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md`）只作背景参考，不作执行入口。

| 主题 | 权威来源 | 二级文档 |
|---|---|---|
| Light 默认宿主 | `packages/host-local/src/nest/app.module.ts` + `packages/host-local/src/nest/main.ts` + `apps/light/package.json` | `README.md`、`docs/README.md`、`docs/architecture/DEPLOYMENT.md` |
| Distributed 宿主 | `packages/host-distributed/src/` + `apps/distributed/package.json` | `docs/architecture/DEPLOYMENT.md`、`packages/host-distributed/README.md` |
| 启动序列 | `packages/host-local/src/nest/main.ts`（light）+ `packages/host-distributed/src/`（distributed） | `docs/architecture/ARCHITECTURE.md` |
| 数据库 schema | `packages/db/src/schema/` + 各 `packages/service-*/src/schema.ts` | `docs/reference/DATABASE_SCHEMA.md` |
| Experience Gene 契约与存储 | `packages/contracts/src/domain/experience-gene.ts` + `packages/db/src/schema/experience-genes.ts` + `packages/backend-core/src/ports/experience-gene-ports.ts` | `docs/reference/DATA_MODEL.md` |
| 六服务归属边界 | `packages/backend-core/src/ports/internal-ports.ts` + `packages/service-*/src/index.ts`（各包 `create*RouteDefs`） | `docs/architecture/ARCHITECTURE.md`、`packages/backend-core/README.md` |
| Go 读服务 | `packages/contracts/src/domain/knowledge-read-go.ts`（读侧 Go 契约） | `docs/architecture/GO-ACCELERATOR.md` |
| HTTP 路由契约 | `packages/backend-core/src/http/route-contract.ts` + 各 `packages/service-*/src/routes.ts` + `packages/host-distributed/src/gateway/route-defs/` | `docs/reference/api-surface.md`、`docs/architecture/BOUNDARIES.md` |
| 轻量网关装配 | `packages/host-local/src/nest/gateway/gateway.route-defs.ts` + `packages/host-local/src/nest/runtime/monolith-route-defs.ts` | `docs/reference/api-surface.md` |
| Assembly 组装中心 | `packages/assembly`（`@trapmap/assembly`，见 `apps/light/package.json` 依赖） | `docs/architecture/ARCHITECTURE.md` |
| 持久化姿态 | `packages/db/src/schema/`（42 张 `pgTable`，唯一真源） | `docs/architecture/components/PERSISTENCE.md` |
| 异步 substrate | `packages/service-job-runtime/src/` + `packages/contracts/src/domain/async.ts` + `packages/contracts/src/domain/task-queue.ts` | `docs/architecture/components/ASYNC_MODEL.md` |
| 检索系统 | `packages/service-knowledge-read/src/`（含 `experience-gene-routes.ts`） | `docs/architecture/components/RETRIEVAL.md` |
| AI 提供商统一入口 | `packages/ai-providers/src/providers.ts` + `packages/ai-providers/src/provider-config.ts`（`AI_PROVIDER`、`OPENAI_API_KEY`、`GEMINI_API_KEY`） | `docs/architecture/components/AI_PROVIDER.md`、`packages/ai-providers/README.md` |
| 提示词槽位默认值 | `docs/reference/system-prompt-slots.default.json`（运行期实时默认，不搬移）+ `packages/ai-providers/src/prompt-builder.ts` | `docs/architecture/components/AI_PROVIDER.md` |
| 工件系统 | `packages/service-knowledge-write/src/` + `packages/db/src/schema/artifacts.ts` | `docs/architecture/components/ARTIFACTS.md` |
| 治理面 | `packages/service-governance-review/src/` | `docs/architecture/components/GOVERNANCE.md` |
| 可观测性 | `packages/host-local/src/nest/` + `packages/host-distributed/src/gateway/` + `packages/contracts/src/domain/observability.ts` | `docs/architecture/OBSERVABILITY.md` |
| 服务发现 | `packages/host-distributed/src/config/service-config.ts` + 网关 `internal-client` | `docs/architecture/SERVICE-DISCOVERY.md` |
| 运行时健康 | `packages/host-distributed/src/gateway/routes.ts`（`/health`、`/live`、`/ready`）+ `packages/host-distributed/src/gateway/server.ts`（`/metrics`） | `docs/architecture/DEPLOYMENT.md` |
| 环境配置 | `packages/host-local/src/nest/config/config.ts` + `packages/host-distributed/src/config/service-config.ts` | `docs/reference/ENVIRONMENT.md` |
| 仓库布局 | `docs/reference/REPO_STRUCTURE.md` | `README.md`、`docs/guides/CODE_GUIDE.md` |
| 根计划治理 | 根 `plan.md` + `docs/guides/DOCUMENTATION_GOVERNANCE.md` | `docs/README.md`、`docs/todos/README.md` |

> 跨文档主题矩阵见 [文档真相矩阵](DOCS_TRUTH_MATRIX.md)。

## 规则

1. **权威优先。** 二级文档冲突时你改二级文档，不改权威表。
2. **PG-first。** 主事实全部落在 PostgreSQL 结构化表；`packages/db/src/schema/` 为唯一真源。
3. **路由是适配器。** 路由层只做验证、鉴权与 actor 解析，然后把调用委托给应用服务；多步持久化与生命周期归应用层和仓库层。
4. **运行时属基础设施。** 启动、迁移、worker 与就绪判定归 host 包和 `service-job-runtime`。
5. **读模型归读侧。** 写侧不静默组装检索或审核投影；例外需要文档显式声明。
6. **packages/server（Wave-10 已删除）。** `backend-core` 是无框架内核，`host-local/nest` 是 light 默认入口，`host-distributed` 是 heavy 真实宿主。

## 文件行号锚点（2026-09-08 实测）

- `packages/backend-core/src/http/route-contract.ts:51`：`RouteDef` 的 `method` 与 `path` 字段定义。
- `packages/host-local/src/nest/runtime/monolith-route-defs.ts:26`：`serviceRouteDefsForMonolith` 过滤掉 `/internal/*`。
- `packages/host-distributed/src/gateway/route-defs/index.ts:11`：6 组网关路由合并为一个 `RouteDef[]`。
- `packages/contracts/src/domain/common.ts:38`：`lifecycleStateSchema` 七态枚举。
- `packages/ai-providers/src/prompt-builder.ts:40`：默认模板文件指向 `docs/reference/system-prompt-slots.default.json`。
- `packages/ai-providers/src/provider-config.ts:65`：`AI_PROVIDER`、`OPENAI_API_KEY`、`GEMINI_API_KEY` 选择逻辑。
- `packages/host-distributed/src/gateway/routes.ts:268`：`/health` 注册点。
- `packages/service-identity-access/src/routes.ts:106`：`/internal/auth/login` 内部登录路由。

## CI 守卫

```bash
pnpm check:docs        # doc-drift / mermaid / md-lint（阻断）+ truth / references / links（可见）
pnpm check:structure   # structure / arch-freeze / stale-package-refs
pnpm check:table-schema
pnpm check:complexity
pnpm typecheck
```

规则见 `scripts/complexity-budgets.json`；矩阵见 [文档真相矩阵](DOCS_TRUTH_MATRIX.md)。
