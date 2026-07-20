# Server 路由布局

路由是 server 的 `interfaces/http` 层。它们是轻量 Fastify 模块，负责解析请求、检查认证与权限，并把工作委托给 `lib/`。

## 归属规则

路由只允许做这些事情：

- 解析传输层输入，并映射成命令/查询 payload
- 执行 schema 校验，以及认证/权限 gate
- 解析下游服务所需的 actor/request 上下文
- 委托给应用服务、读侧组装器或 operator helper
- 把结果或错误映射回 HTTP 响应

路由不拥有这些职责：

- 多步骤写入编排
- bootstrap、runtime 或进程监管
- 队列恢复或 worker 生命周期
- 写侧工作流的读模型组装

## 目录规则

- 单文件路由保留为 `routes/<domain>.ts`
- 带多个子操作的路由组使用 `routes/<domain>/`
- 路由测试默认与路由文件同目录，跨路由冒烟测试除外

## 当前路由组

| 路径 | 职责 |
|---|---|
| `routes/candidates/` | 候选提交、查询、重复项查找与 resolution |
| `routes/operations/` | status、migrate、audit、artifact import/export/activate 等 operator/admin 操作 |
| `routes/*.ts` | 不需要子操作拆分的扁平路由模块 |

## 按重点上下文的分层映射

| 上下文 | 路由职责 |
|---|---|
| `knowledge` | 校验 knowledge/trap/review/decay 请求、执行授权，并委托共享应用服务 |
| `candidate ingestion` | 接收提交与 operator 决策后委托给 candidate 服务；recovery/re-enqueue 不属于 HTTP 职责 |
| `operations/runtime` | 暴露 runtime/admin 接口，但 runtime 状态计算仍来自基础设施模块 |
