# Deployment Flexibility Plan 04: Build, Deploy, Docs And Tests

## 状态

- 状态：`active`
- 审计结论：脚本、compose、env、README 和测试矩阵已经显著前进，本文件当前最大问题是“当前事实”仍停留在改造前。

## 目标

把新的部署模型收敛到脚本、compose、环境变量模板、文档索引和测试矩阵，确保实现结束后仓库是可构建、可部署、可验证的。

## 当前事实

- 根 `package.json` 已存在 profile 命名的开发入口：
  - `dev:local-agent`
  - `dev:team-monolith`
  - `dev:distributed:gateway`
  - `dev:distributed:candidate-worker`
  - `dev:distributed:governance-worker`
  - `dev:distributed:outbox-worker`
  - 同时仍保留 `dev:server*` 兼容脚本
- 根 `package.json` 已存在面向本计划的测试入口：
  - `test:deployment-smoke`
  - `test:runtime-foundations`
- `packages/server/package.json` 已同时暴露：
  - 基于 `RUNTIME_MODE` 的兼容脚本
  - 更贴近 profile / service identity 的 `dev:local-agent`、`dev:team-monolith`、`dev:gateway`、`dev:candidate-worker`、`dev:governance-worker`
- `docs/architecture/DEPLOYMENT.md`、README、`docs/README.md` 已在推进 profile 词汇对齐
- 当前工作区已有 `docker-compose.yml` 相关改动在进行中，后续实现时要谨慎与用户现有变更并行。

## 已完成

- profile 命名脚本已进入根 `package.json`。
- 最小 deployment smoke 测试入口已被加入脚本。
- 文档主入口已开始按 `local-agent` / `team-monolith` / `distributed` 组织。

## 剩余收口

- 已补齐根脚本与 `packages/server` 的 distributed script alias 对齐。
- 已把 `.env.example` / `.env.production.example` / DEPLOYMENT / TESTING 的 profile、compose profile、task transport 叙事对齐。
- 已将最小验证矩阵正式回写到 `docs/operations/TESTING.md`。

## 详细改动内容

- 重新梳理顶层与 `@trapmap/server` 脚本：
  - 本地轻模式启动
  - team-monolith 启动
  - distributed/gateway/worker 启动
- 更新 `docker-compose.yml` 及其 profile：
  - 单体模式
  - distributed 模式
  - 可选 MQ 模式
- 更新环境变量示例：
  - profile 选择
  - gateway 地址
  - task transport
  - 与旧 preset/env 的兼容说明
- 回写文档索引：
  - `README.md`
  - `docs/README.md`
  - `docs/plans/README.md`
- 统一测试矩阵和最小 smoke 命令，至少覆盖：
  - config / runtime
  - gateway-only CLI
  - profile-based route exposure
  - deployment smoke

## 建议分步

### Step 1. 重命名和补充脚本语义

- 根 `package.json`
  - 保留现有脚本做兼容
  - 已增加以 profile 命名的开发入口：
    - `dev:local-agent`
    - `dev:team-monolith`
    - `dev:distributed:gateway`
    - `dev:distributed:candidate-worker`
    - `dev:distributed:governance-worker`
    - `dev:distributed:outbox-worker`
- `packages/server/package.json`
  - 保留 `dev` / `dev:api` / `dev:task-worker` / `dev:outbox-worker`
  - 已新增更贴近 profile/service identity 的脚本；剩余工作是校准命名和文档引用

### Step 2. 收敛环境变量叙事

- 在 `.env.example` / `.env.production.example` / 部署文档中统一说明：
  - deployment profile 选择项
  - 与旧 `TRAPMAP_DEPLOYMENT_PRESET` 的兼容关系
  - `RUNTIME_MODE` / `TRAPMAP_SERVICE_UNIT` 何时仍需要显式设置
  - `TRAPMAP_TASK_TRANSPORT` 在不同 profile 下的默认建议

### Step 3. 收敛 compose 与部署示例

- `docker-compose.yml` / 部署文档至少明确两类推荐入口：
  - `team-monolith`
  - `distributed`
- `local-agent` 如不走 compose，也要在 README/DEPLOYMENT 中说明推荐启动方式。
- MQ profile 文档应改成：
  - 是 distributed 的可选强化，而不是另一套产品形态

### Step 4. 固化测试与 smoke matrix

- 至少定义一套“实现完成后必须跑”的最小命令：
  - `rtk pnpm test:deployment-smoke`
  - `rtk pnpm test:runtime-foundations`
  - `rtk pnpm typecheck`
  - 如涉及部署文档调整，补 `rtk pnpm check:docs-drift`
- 若新增 profile-based route exposure，文档中要给出最小 smoke 步骤：
  - 启动 gateway
  - CLI 登录/检索
  - 对应 worker/health 检查

## 涉及代码与配置入口

- `package.json`
- `packages/server/package.json`
- `docker-compose.yml`
- `.env.example`
- `.env.production.example`
- `docs/architecture/DEPLOYMENT.md`
- `docs/README.md`
- `README.md`
- `docs/operations/TESTING.md`

## 需要同步更新的文档

- `README.md`
- `docs/README.md`
- `docs/architecture/DEPLOYMENT.md`
- `docs/operations/TESTING.md`
- `docs/plans/README.md`

## 需要补充或更新的测试

- `packages/server/src/config.test.ts`
- `packages/server/src/app.test.ts`
- `packages/server/src/bootstrap/startup.test.ts`
- `packages/cli/src/lib/http.test.ts`
- 必要时扩展根脚本相关 smoke 测试或文档中的复现命令

建议补充的具体场景：

- 新的脚本名和文档示例命令完全一致。
- `distributed` 文档示例能清楚说明 gateway 与 worker 的启动组合。
- `local-agent` 的 smoke 步骤只要求最小能力，不强迫完整治理链路。
- 若旧脚本仍保留，测试或文档要标明其兼容性质，避免新老叙事混用。
- `test:deployment-smoke` 覆盖 config、app、startup、deployment-profile、service-topology、CLI gateway-only 关键切片。

## 验收标准

- 开发者只看 README 与 DEPLOYMENT 就能启动三种目标形态中的任意一种。
- 文档中的环境变量、脚本名、compose profile 与代码完全一致。
- 实现 PR 可以直接引用本文件列出的测试矩阵完成自检。

## 交付要求

- 任一新增启动命令、compose profile 或 env 变量都必须在部署文档和测试文档里出现。
- 文档示例命令必须与实际脚本名称一致，不能继续保留过时命令。
