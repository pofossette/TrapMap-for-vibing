# 系统权威事实源

每个架构事实都有一个权威来源。当 secondary docs 漂移时，以权威来源为准。

> `packages/server` 已于 Wave-10 删除；唯一事实源为 `host-local / host-distributed + 6 service owners + backend-core`。历史追溯见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`。

| 主题 | 权威来源 | Secondary Docs |
|---|---|---|
| Light 默认宿主 | `packages/host-local/src/nest/app.module.ts` + `packages/host-local/src/nest/main.ts` + `apps/light/package.json` | `README.md`, `docs/README.md`, `docs/architecture/DEPLOYMENT.md` |
| Distributed 宿主 | `packages/host-distributed/src/` + `apps/distributed/package.json` | `docs/architecture/DEPLOYMENT.md`, `packages/host-distributed/README.md` |
| 启动序列 | `packages/host-local/src/nest/main.ts` + `packages/host-distributed/src/` | `docs/architecture/ARCHITECTURE.md` |
| 数据库 schema | `packages/db/src/schema/` + 各 `packages/service-*/src/schema.ts` | `docs/reference/DATABASE_SCHEMA.md` |
| Experience Gene 契约/存储 | `packages/contracts/src/domain/experience-gene.ts` + `packages/db/src/schema/experience-genes.ts` + `packages/backend-core/src/ports/experience-gene-ports.ts` | `docs/reference/DATA_MODEL.md` |
| 六服务归属边界 | `packages/backend-core/src/ports/internal-ports.ts` + `packages/backend-core/src/<context>/{domain,application,module.ts,index.ts}` + `packages/service-*/src/index.ts` | `docs/architecture/ARCHITECTURE.md`, `packages/backend-core/README.md` |
| Go 读服务 | `services/knowledge-read-go` (`chi+pgx+lru+singleflight`) + `packages/contracts/src/domain/knowledge-read-go.ts` → `contracts/json-schema/knowledge-read-go/*` | `docs/architecture/GO_TECH_STACK.md`, `docs/architecture/GO-ACCELERATOR.md` |
| HTTP 路由契约 | `packages/backend-core/src/http/route-contract.ts` + `packages/backend-core/src/http/adapters/{nest,fastify}.ts` + 各 `packages/service-*/src/routes.ts` | `docs/architecture/ARCHITECTURE.md`, `docs/architecture/BOUNDARIES.md` |
| Assembly 组装中心 | `packages/assembly` (`@trapmap/assembly`, cordis) + `packages/host-*/src/**/assembly/**` | `docs/architecture/ARCHITECTURE.md` |
| Assembly 契约 | `packages/assembly/src/contracts/judgment-contracts.ts` + `packages/backend-core/src/ports/*-ports.ts` | `docs/architecture/components/*` |
| 持久化姿态 | `packages/db/src/schema/` + 各 `packages/service-*/drizzle/` | `docs/architecture/components/PERSISTENCE.md` |
| 异步 substrate | `packages/service-job-runtime/src/` + `packages/contracts/src/domain/async.ts` | `docs/architecture/components/ASYNC_MODEL.md` |
| 检索系统 | `packages/service-knowledge-read/src/` | `docs/architecture/components/RETRIEVAL.md` |
| 工件系统 | `packages/service-knowledge-write/src/` + `packages/db/src/schema/artifacts.ts` | `docs/architecture/components/ARTIFACTS.md` |
| 治理/评测 | `packages/service-governance-review/src/` + `evals/` | `docs/architecture/components/GOVERNANCE.md`, `docs/architecture/components/EVALUATION.md` |
| 可观测性 | `packages/host-local/src/nest/` + `packages/host-distributed/src/gateway/` + `packages/contracts/src/domain/observability.ts` | `docs/architecture/OBSERVABILITY.md` |
| 服务发现 | `packages/host-distributed/src/gateway/internal-client.ts` + `consul` 配置 | `docs/architecture/SERVICE-DISCOVERY.md` |
| 运行时健康 | `packages/host-local/src/nest/` + `packages/host-distributed/src/` | `docs/architecture/ARCHITECTURE.md` |
| 环境配置 | `packages/host-local/src/nest/config/config.ts` + `packages/host-distributed/src/config/service-config.ts` | `docs/operations/ENVIRONMENT.md` |
| 仓库布局 | `docs/reference/REPO_STRUCTURE.md` | `README.md`, `docs/guides/CODE_GUIDE.md` |
| 根计划治理 | `plan.md` + `docs/guides/DOCUMENTATION_GOVERNANCE.md` | `docs/README.md`, `docs/todos/README.md` |

> 完整事实矩阵见 [DOCS_TRUTH_MATRIX.md](DOCS_TRUTH_MATRIX.md)。

## 规则

1. **权威优先。** 二级文档冲突时以本表为准。
2. **PG-first。** 所有主事实为 PostgreSQL 结构化表；`packages/db/src/schema/` 为唯一真源。
3. **路由是适配器。** 验证/鉴权/actor 解析后委托应用服务；多步持久化与生命周期属应用/仓库层。
4. **运行时属基础设施。** 启动、迁移、worker、就绪判定属 host / `service-job-runtime`。
5. **读模型归读侧。** 写侧不静默组装检索/审核投影，需文档显式声明才允许。
6. **`packages/server` 已删除。** `backend-core` 为 framework-free 内核，`host-local/nest` 为 light 默认入口，`host-distributed` 为 heavy 真实宿主。

## CI 守卫

```bash
pnpm check:docs        # doc-drift / mermaid / md-lint (阻断) + truth / references / links (可见)
pnpm check:structure   # structure / arch-freeze / stale-package-refs
pnpm check:table-schema
pnpm check:complexity
pnpm typecheck
```

规则见 `scripts/complexity-budgets.json`；矩阵见 [DOCS_TRUTH_MATRIX.md](DOCS_TRUTH_MATRIX.md)。
