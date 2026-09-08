# 文档真相矩阵

> 状态：Active。核对日期：2026-09-08。本矩阵把每个跨文档主题映射到唯一权威来源。你改架构、CI、部署或持久化文档时，先查本矩阵再动手。

本矩阵补充 [系统权威事实源](SYSTEM_TRUTH_SOURCES.md)。那份管运行时架构事实（入口、归属边界、持久层）；本矩阵把治理扩展到跨文档主题（CI、部署、测试、护栏、Schema 归属）。

| 主题 | 权威来源 | 辅助文档 | 漂移类型 |
|---|---|---|---|
| 宿主入口 | [系统权威事实源](SYSTEM_TRUTH_SOURCES.md)「Light 默认宿主」行 | `docs/guides/CODE_GUIDE.md`、`docs/architecture/ARCHITECTURE.md` | 描述性 |
| 启动序列 | `packages/host-local/src/nest/main.ts`（light）+ `packages/host-distributed/src/`（distributed） | `docs/architecture/ARCHITECTURE.md`、`docs/guides/CODE_GUIDE.md` | 描述性 |
| 持久化策略 | `README.md` + [系统权威事实源](SYSTEM_TRUTH_SOURCES.md) + `packages/db/src/schema/*.ts` | `docs/README.md`、`docs/guides/GETTING_STARTED.md`、`docs/architecture/DEPLOYMENT.md` | 描述性 |
| 数据库 Schema | `packages/db/src/schema/` + 各 `packages/service-*/src/schema.ts` | `docs/reference/DATABASE_SCHEMA.md` | 描述性 |
| Schema 数量 | `packages/db/src/schema/*.ts`（42 张，守卫 `scripts/check-table-schema.ts`） | `docs/reference/DATABASE_SCHEMA.md`、`docs/README.md` | 描述性 |
| 持久化迁移状态 | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`、`docs/architecture/ARCHITECTURE.md` | 描述性 |
| 数据访问归属 | 各 service owner 的 ports 与 `SYSTEM_TRUTH_SOURCES.md`「六服务归属边界」行 | `docs/PACKAGES.md`、`docs/reference/DATA_MODEL.md` | 描述性 |
| CI 作业 | `.github/workflows/ci.yml` | `docs/operations/CI_CD.md`、`docs/operations/TESTING.md` | 描述性 |
| 护栏命令 | `scripts/complexity-budgets.json` + `.github/workflows/ci.yml` | `docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/operations/TESTING.md`、`docs/operations/CI_CD.md` | 描述性 |
| 启动命令 | 根 `package.json` 的 scripts 段 | `docs/README.md`、`docs/guides/GETTING_STARTED.md` | 描述性 |
| 评估入口 | 根 `package.json` 的 scripts 段 | `docs/operations/TESTING.md`、`docs/operations/CI_CD.md` | 描述性 |
| 部署默认配置 | `docker-compose.yml` + `packages/host-local/Dockerfile` + `packages/host-distributed/Dockerfile` | `docs/architecture/DEPLOYMENT.md`、`README.md` | 描述性 |
| 根工作区命令 | 根 `package.json`（scripts 段） | `README.md`、`docs/README.md`、`docs/operations/TESTING.md` | 描述性 |
| DB 迁移归属 | 各 `packages/service-*/src/migrations.ts`（按包归属） | `docs/guides/GETTING_STARTED.md`、`docs/architecture/DEPLOYMENT.md` | 描述性 |
| 运行时环境默认值 | `packages/host-local/src/nest/config/config.ts`（light 宿主 owner）+ `packages/host-distributed/src/config/service-config.ts` | `docs/reference/ENVIRONMENT.md`、`docs/architecture/ARCHITECTURE.md`、`docs/guides/GETTING_STARTED.md` | 描述性 |
| AI 提供者默认值 | `packages/ai-providers/src/provider-config.ts` + 两宿主 config | `docs/reference/ENVIRONMENT.md`、`docs/architecture/components/AI_PROVIDER.md` | 描述性 |
| 评估工作流 | `.github/workflows/eval.yml` | `docs/operations/TESTING.md`、`docs/operations/CI_CD.md` | 描述性 |
| 深层架构持久化文档 | `packages/db/src/schema/*.ts` + 各 service owner 源码 | `docs/architecture/components/PERSISTENCE.md`、`docs/reference/DATABASE_SCHEMA.md` | 描述性 |
| 健康与就绪端点 | `packages/host-distributed/src/gateway/routes.ts`（`/health`、`/live`、`/ready`）+ `packages/host-distributed/src/gateway/server.ts`（`/metrics`） | `docs/architecture/DEPLOYMENT.md`、`docs/guides/GETTING_STARTED.md` | 描述性 |
| 深层架构组件文档 | `packages/db/src/schema/*.ts` + 各 service owner 源码 | `docs/architecture/components/*.md` | 描述性 |
| 仓库根 Markdown 白名单 | `docs/reference/REPO_STRUCTURE.md` | `README.md`、根 `plan.md`、`docs/README.md` | 结构性 |
| 归档目录策略 | `docs/reference/REPO_STRUCTURE.md` + `docs/archived/README.md（已归档，路径冻结）` | `docs/archived/**`、`docs/plans/**` | 结构性 |
| 评估目录布局 | `docs/reference/REPO_STRUCTURE.md` + `evals/README.md` | `docs/operations/TESTING.md`、`docs/architecture/components/EVALUATION.md` | 结构性 |

## 规则

1. **权威来源优先。** 辅助文档与权威来源冲突时，你更新辅助文档。
2. 本矩阵是你查找文档主题归属的唯一位置。
3. 你改架构、CI、部署或持久化文档的 PR 必须对照本矩阵验证一致性。
4. 你新增文档主题时，先在本矩阵加一行，再更新辅助文档。

## 与 SYSTEM_TRUTH_SOURCES.md 的关系

[系统权威事实源](SYSTEM_TRUTH_SOURCES.md) 管辖运行时架构事实（入口、数据访问边界、持久层）。本矩阵把同一治理扩展到跨文档主题（CI、部署、测试、护栏、Schema 归属）。

两份文件都是权威来源。同一主题在两处出现时适用同一权威来源。
