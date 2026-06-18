# Deployment Flexibility Plan 02: Gateway And CLI Integration

## 目标

固定 CLI 的接入模型为 `gateway only`，让后端是否单体或微服务对 CLI 保持透明。

## 当前事实

- `packages/cli/src/lib/http.ts` 的所有请求都基于一个 base URL。
- `packages/cli/src/lib/config.ts` 只存储一个 `serverUrl`。
- `packages/cli/src/index.ts` 和各命令模块不感知多服务地址。
- `docs/architecture/CLI.md` 已说明：
  - 只有 `login` 支持 `--server <url>`
  - CLI 没有全局 `--url`
- 当前 CLI 事实层面已经是 gateway-only，但文档尚未把这一点定义成正式约束。

## 详细改动内容

- 定义 gateway 的职责：
  - 统一认证和会话入口
  - 对外稳定 API surface
  - 路由到内部 retrieval / governance / candidate 等服务或本地实现
- 定义 CLI 的约束：
  - 默认只读取一个 `serverUrl` / gateway URL
  - 不按命令类别直接拼接不同服务地址
  - 不把微服务拓扑暴露为用户必须理解的配置项
- 对 `local-agent` 的最小 gateway 形态做约束：
  - 可以是单进程 Fastify surface
  - 只开放 retrieval/activate/import-export 的最小命令所需接口
- 明确 API 兼容策略：
  - 现有 CLI 使用中的核心路径优先兼容
  - 若必须裁剪本地模式的路由，需通过 capability 显式说明

## 建议分步

### Step 1. 冻结 CLI 接入约束

- 明确 CLI 的正式模型为：
  - 一个 `serverUrl`
  - 一个 gateway
  - 由 gateway 负责把命令请求路由到内部实现
- 明确不支持：
  - `TRAPMAP_RETRIEVAL_URL`
  - `TRAPMAP_GOVERNANCE_URL`
  - `TRAPMAP_CANDIDATE_URL`
  - 类似按命令类型切远端的多 URL 方案

### Step 2. 定义 gateway 的对外边界

- gateway 对外至少继续承载：
  - auth/session
  - retrieval/search/load
  - activate/export/import
  - 需要保留的 knowledge/review/operations surface
- `local-agent` 下 gateway 允许裁剪：
  - team/member/access-key
  - feedback-admin
  - decay/maintenance/admin benchmark
  - 其他非 retrieval-first 所需面

### Step 3. 定义内部路由策略

- `team-monolith`
  - gateway 与内部实现同进程
- `distributed`
  - gateway 调用内部 bounded-context services
  - CLI 不感知这些服务是否远程
- `local-agent`
  - gateway 为最小 Fastify surface
  - 内部仍可直连现有 application services

### Step 4. 锁定 CLI 不需要改的部分

- 不为 CLI 新增按服务拆分的 base URL 配置。
- 不为 CLI 命令暴露“直连 retrieval service”或“直连 governance service”参数。
- 如需调试微服务，使用 gateway 配置或 operator/internal tool，而不是污染正式 CLI surface。

## 涉及代码入口

- `packages/cli/src/lib/http.ts`
- `packages/cli/src/lib/config.ts`
- `packages/cli/src/index.ts`
- `packages/cli/src/commands/auth.ts`
- `packages/server/src/app.ts`
- `packages/server/src/routes/*.ts`
- 如需新增 gateway 内部转发层，则落在 `packages/server/src/lib/` 对应 runtime 或 application seam

## 需要同步更新的文档

- `README.md`
- `docs/architecture/CLI.md`
- `docs/architecture/API.md`
- `docs/architecture/DEPLOYMENT.md`

## 需要补充或更新的测试

- `packages/cli/src/lib/http.test.ts`
  - 验证 CLI 仍以单一 base URL 工作。
- `packages/cli/src/commands/*.test.ts`
  - 至少补检索、激活、登录等典型命令在 gateway-only 模型下的约束。
- `packages/server/src/routes/*.test.ts`
  - 验证本地轻模式下的路由暴露裁剪不会破坏核心 CLI 路径。

建议补充的具体场景：

- `login --server` 仍然只写入一个 gateway 地址。
- `search` / `load` / `activate` 在 `local-agent` 与 `distributed` 下都使用同一 CLI 通信模型。
- 若 `local-agent` 裁剪了 review/governance 路由，CLI 报错信息应清晰表达 capability 不支持，而不是表现为随机 404。

## 验收标准

- CLI 文档、代码、配置三者一致地表达“单 gateway 接入”。
- 后端服务如何拆分，不会要求用户修改 CLI 命令用法。
- `local-agent` 与 `distributed` 只是 gateway 背后实现不同，而不是 CLI 接入协议不同。

## 交付要求

- 文档中不得出现“CLI 按命令直连不同服务”的建议。
- gateway 作为唯一正式入口，要在 README 和部署文档里明确写清楚。
