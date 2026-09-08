# 开发工作流

> 状态： Active（2026-09-08）。本页定动手顺序，任务路由以 `AGENTS.md` 为准，事实冲突以 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 为准。

## 目标

你 接到任务后先读对文档，再动手，再回写。你 用最小验证闭环改动。你 不跳过回写。

## 前置

你 动手前通读 `AGENTS.md` 与 `docs/README.md` 。你 确认事实冲突时的裁决源为 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 。你 确认目录归属为 `docs/reference/REPO_STRUCTURE.md` 。你 在仓库根执行命令，你 先完成依赖安装：

```bash
pnpm install --frozen-lockfile
```

## 步骤

### 按任务查表阅读

你 按任务类型读完对应行再动手：

| 任务类型 | 必读文档 | 入口命令 |
| --- | --- | --- |
| CLI 变更 | `AGENTS.md` 、 `apps/cli/src/index.ts` 、 `apps/cli/README.md` | `pnpm --filter @trapmap/cli test --run` |
| Server / API 变更 | `packages/backend-core/src/http/route-contract.ts` 、 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 、 `docs/architecture/CLI.md` | `pnpm test:deployment-smoke` |
| Contracts 变更 | `packages/contracts/src/index.ts` 、 `docs/reference/api-surface.md` 、 `docs/reference/DATA_MODEL.md` | `pnpm --filter @trapmap/contracts test --run` |
| 检索 / 摘要 / Eval 变更 | `docs/operations/TESTING.md` 、 `evals/retrieval/README.md` 、 `evals/summary/README.md` | `pnpm --filter @trapmap/evals eval:smoke` |
| 安全 / 权限 / 配置变更 | `docs/operations/SECURITY.md` 、 `docs/operations/ENVIRONMENT.md` 、 `docs/architecture/components/GOVERNANCE.md` | `pnpm typecheck` |
| Skill 工作流变更 | `packages/skills/README.md` 、 `packages/skills/workflow-with-trapmap/SKILL.md` 、 `docs/guides/CLIENT_INTEGRATION.md` | `pnpm check:skills` |
| 文档 / 目录规则变更 | `docs/guides/DOCUMENTATION_GOVERNANCE.md` 、 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 、 `docs/reference/REPO_STRUCTURE.md` | `pnpm check:docs` |
| 可观测性 / 服务发现变更 | `docs/architecture/OBSERVABILITY.md` 、 `docs/architecture/SERVICE-DISCOVERY.md` 、 `packages/contracts/src/domain/health.ts` | `pnpm typecheck` |

需外部服务的命令先满足前置： `pnpm test:deployment-smoke` 需本地构建产物， `pnpm --filter @trapmap/evals eval:smoke` 需对应包脚本与数据就绪。

### 动手规则

- 你 取与改动直接相关的最小验证集合，你 只在必要时扩大范围。约定见 `AGENTS.md` :24-25 。
- 你 不跑根级全量 `pnpm test` 筛选失败，你 不拼接管道截断输出。禁令见 `AGENTS.md` :35-39 。
- 你 单文件验证走 `package.json` 所载单文件脚本，包级验证走包过滤器。
- 你 跨包改动先跑 `pnpm exec fallow audit --base main` 确认边界，规则见 `docs/architecture/BOUNDARIES.md` 。
- 你 触及检索、摘要、治理、反馈链路时补对应 eval 烟雾验证。

```bash
pnpm check
pnpm typecheck
pnpm check:structure
```

### 收尾回写

你 按回写顺序 权威 → 说明 → 索引同轮改完：

1. 你 先更新权威事实源或源码真相。
2. 你 再更新二级说明文档。
3. 你 最后更新入口索引，即 `README.md` 、 `AGENTS.md` 、 `docs/README.md` 。

你 派活前先读 `plan.md` 确认执行入口，主线状态变化时同步更新它。

你 按变更类型落到对应文档：

| 变更内容 | 回写落点 |
| --- | --- |
| 启动、开发、测试、评测命令变化 | `README.md` 、对应权威页 |
| 目录、包职责、落点、归档规则变化 | `docs/reference/REPO_STRUCTURE.md` 、对应权威页 |
| API 、共享契约、状态枚举、数据模型变化 | `packages/contracts/src/index.ts` 所在契约源、 `docs/reference/api-surface.md` 、 `docs/reference/DATA_MODEL.md` |
| 环境变量、权限、安全等级、部署默认值变化 | `docs/operations/ENVIRONMENT.md` 、 `docs/operations/SECURITY.md` 、对应 `architecture/` 页 |
| 工程强约束变化 | `docs/guides/CODE_STYLE.md` 或本页、对应权威页 |
| 架构边界与运行时行为变化 | `docs/architecture/ARCHITECTURE.md` 、 `docs/architecture/BOUNDARIES.md` |

顺序与沉淀依据见 `docs/guides/DOCUMENTATION_GOVERNANCE.md` :37-48 。同类漂移复发时，你 优先补守卫而非只补文字。

## 验证

你 改完后按改动类型取命令：

```bash
pnpm check:docs
pnpm check:structure
```

契约与类型改动追加：

```bash
pnpm typecheck
```

## 排错

- 文档守卫失败时，你 先读输出中的定位行，再改对应权威页，不改守卫预期绕行。
- 引用断裂时，你 跑 `pnpm exec tsx scripts/check-doc-references.ts` 定位断链，再补齐索引。
- 边界失败时，你 跑 `pnpm exec fallow audit --base main` 确认越界边，再收敛导入。
- 验证命令本身报错时，你 参考 `docs/operations/REGRESSION-COMMANDS.md` 取回归命令。
