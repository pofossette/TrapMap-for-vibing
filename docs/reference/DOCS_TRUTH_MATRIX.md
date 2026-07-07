# 文档真相矩阵

每个文档主题映射到一个权威来源。当辅助文档与权威来源冲突时，更新辅助文档。

本矩阵补充 `SYSTEM_TRUTH_SOURCES.md`（侧重运行时架构事实）。下方矩阵涵盖跨文档主题（CI、部署、测试、护栏），横跨多个文档。

| 主题 | 权威来源 | 辅助文档 | 漂移类型 |
|---|---|---|---|
| 服务器入口 | `packages/server/src/app.ts` (`buildServer()`) | `docs/guides/CODE_GUIDE.md`, `docs/architecture/ARCHITECTURE.md` | 描述性 |
| 启动序列 | `packages/server/src/bootstrap/run-startup-sequence.ts` | `docs/architecture/ARCHITECTURE.md`, `docs/guides/CODE_GUIDE.md` | 描述性 |
| 持久化策略 | `README.md` + `docs/reference/SYSTEM_TRUTH_SOURCES.md` + `packages/server/src/lib/persistence/schema/*.ts` | `docs/README.md`, `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` | 描述性 |
| 数据库 Schema | `packages/server/src/lib/persistence/schema/index.ts`（barrel，重新导出所有领域表模块） | `docs/reference/DATABASE_SCHEMA.md` | 描述性 |
| Schema 数量 | `packages/server/src/lib/persistence/schema/*.ts`（artifacts.ts, knowledge.ts, candidates.ts, auth.ts, retrieval.ts, queue.ts, index.ts） | `docs/reference/DATABASE_SCHEMA.md`, `docs/README.md` | 描述性 |
| 持久化迁移状态 | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md` | 描述性 |
| Phase 2 store-snapshot / PG-first 策略冻结 | `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `docs/reference/SYSTEM_TRUTH_SOURCES.md` + `packages/server/src/__tests__/snapshot-usage-guard.test.ts` + `packages/server/src/__tests__/pg-first-compat.test.ts` | `docs/PACKAGES.md`, `docs/architecture/components/PERSISTENCE.md`, `docs/operations/TESTING.md` | 描述性 |
| 服务器数据访问边界 | `packages/server/src/lib/actors/lookup.ts`（actor 查找）, `packages/server/src/lib/repos/index.ts` (`SkillShareerRepos`) | `docs/PACKAGES.md`, `docs/reference/DATA_MODEL.md` | 描述性 |
| CI 作业 | `.github/workflows/ci.yml` | `docs/operations/CI_CD.md`, `docs/operations/TESTING.md` | 描述性 |
| 护栏命令 | `scripts/complexity-budgets.json` + `.github/workflows/ci.yml` | `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` | 描述性 |
| 启动命令 | `package.json` scripts 部分 | `docs/README.md`, `docs/guides/GETTING_STARTED.md` | 描述性 |
| 评估入口 | `package.json` scripts 部分 | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` | 描述性 |
| 部署默认配置 | `docker-compose.yml` + `packages/host-local/Dockerfile` + `packages/host-distributed/Dockerfile` | `docs/architecture/DEPLOYMENT.md`, `README.md` | 描述性 |
| 根工作区命令 | `package.json`（scripts 部分） | `README.md`, `docs/README.md`, `docs/operations/TESTING.md` | 描述性 |
| 服务器独占 DB 命令 | `packages/server/package.json`（db:generate, db:migrate, db:push） | `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` | 描述性 |
| 运行时环境默认值 | `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` | 描述性 |
| AI 提供者/模型默认值 | `packages/server/src/lib/ai/provider-config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` | 描述性 |
| 评估工作流 | `.github/workflows/eval.yml` | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` | 描述性 |
| 深层架构持久化文档 | `packages/server/src/lib/persistence/schema/*.ts` | `docs/architecture/components/PERSISTENCE.md`, `docs/reference/DATABASE_SCHEMA.md` | 描述性 |
| 健康/就绪端点 | `packages/server/src/app.ts`（`/health`, `/ready`, `/meta/routes`） | `docs/architecture/DEPLOYMENT.md`, `docs/guides/GETTING_STARTED.md` | 描述性 |
| 深层架构组件文档 | `packages/server/src/lib/persistence/schema/*.ts` + 组件源码 | `docs/architecture/components/*.md` | 描述性 |
| 仅运维的内部 API | `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/components/RETRIEVAL.md` | 已解决-内部 |
| 仓库根目录 Markdown 白名单 | `docs/reference/REPO_STRUCTURE.md` | `README.md`, 根目录 `plan.md`, `docs/README.md` | 结构性 |
| 归档目录策略 | `docs/reference/REPO_STRUCTURE.md` + `docs/archived/README.md` | `docs/archived/**`, `docs/plans/**` | 结构性 |
| 评估目录布局 | `docs/reference/REPO_STRUCTURE.md` + `evals/README.md` | `docs/operations/TESTING.md`, `docs/architecture/components/EVALUATION.md` | 结构性 |

## 规则

1. **权威来源优先。** 当辅助文档与权威来源冲突时，更新辅助文档。
2. 本矩阵是查找给定文档主题对应文件的唯一位置。
3. 修改架构、CI、部署或持久化文档的 PR 必须对照本矩阵验证一致性。
4. 添加新文档主题时，先在此矩阵添加一行，再更新辅助文档。

## 与 SYSTEM_TRUTH_SOURCES.md 的关系

`SYSTEM_TRUTH_SOURCES.md` 管辖运行时架构事实（入口、数据访问边界、持久层）。本矩阵将该治理扩展到跨文档主题（CI、部署、测试、护栏、Schema 归属）。

两个文件均为权威来源。对于同时出现在两个表中的主题，适用同一权威来源。
