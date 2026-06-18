# Runtime Recomposition Plan 00: Baseline And Target Architecture

## 状态

- 状态：`active`
- 角色：本轮拆分计划的术语基线、包布局蓝图和总边界冻结文件

## 目标

把“CLI 抽共享层”和“后端更细粒度微服务化”收敛到一套统一叙事：TrapMap 以后不是 `cli + server` 两个大包各自生长，而是 `shared client core + backend core kernel + services + hosts` 的可装配体系。

## 当前事实

- `packages/cli/src/lib/http.ts` 已经只依赖标准 `fetch`、`URL` 和 CLI state，不再绑定 Node 专属 HTTP 客户端。
- CLI 正式接入模型已经固定为 `gateway-only`，配置入口是 `gatewayUrl`。
- Server 已具备 `deployment profile`、`runtimeMode`、`serviceUnit`、`task transport` 等运行时术语与基础实现。
- 仓库已经存在 `local-agent`、`team-monolith`、`distributed` 三种目标形态，但当前主要还集中在 `packages/server` 单包内实现。

## 核心问题

### 1. 客户端复用层仍埋在 CLI 包里

- 未来 Web 面板如果直接复用 CLI 文件，会被 CLI state、输出习惯和命令结构反向污染。
- 如果不先抽共享层，后续会复制一套 HTTP 调用、鉴权 header、错误处理和 session 续传逻辑。

### 2. 服务端仍以单包多角色为主

- 当前 `packages/server` 同时承载 gateway、route host、worker host、runtime wiring、业务编排和持久化接入。
- 这种结构适合早期快速演进，但不利于做“同核多宿主”的清晰装配。

### 3. 轻后端和重后端还缺少统一内核

- 如果直接在 `packages/server` 上继续切 gateway、read service、write service、worker service，容易演变成“拆 runtime，不拆内核”。
- 如果不先定义内核端口和 bounded context，就会出现多个服务重复持有路由语义、repo 装配语义和能力开关语义。

## 目标包布局

建议新增并逐步收敛到以下布局：

- `packages/client-core`
  - 客户端共享 HTTP gateway SDK、session handling、error model、request helpers、可被 CLI / Web / 其他客户端复用
- `packages/backend-core`
  - 后端核心内核，承载应用服务、端口、宿主无关 runtime capability model、bounded-context orchestration
- `packages/service-gateway`
  - 外部唯一 gateway service 的 host / transport / assembly
- `packages/service-identity-access`
  - auth、session、membership、team、RBAC decision service
- `packages/service-knowledge-read`
  - retrieval、只读投影、query trace、读缓存与查询优化
- `packages/service-knowledge-write`
  - knowledge / trap / skill / lifecycle / maintenance / decay 的 authoritative 写路径
- `packages/service-candidate-ingestion`
  - candidate intake、归一化、去重预处理、候选状态推进
- `packages/service-governance-review`
  - 人工介入队列、审核工作台、冲突解决、remediation 队列
- `packages/service-job-runtime`
  - task queue、workflow runs、outbox dispatch、shared jobs 执行
- `packages/host-local`
  - 轻量宿主，面向 `local-agent` 和 `team-monolith`，按需内嵌多个逻辑服务
- `packages/host-distributed`
  - 重型宿主，面向多个 service package 的分布式装配
- `packages/cli`
  - 保留命令行交互、参数解析、输出渲染、本地配置；不再持有通用 HTTP SDK
- `packages/server`
  - 迁移期兼容壳层，逐步瘦身；最终作为历史过渡包或被新宿主替代

## 术语冻结

### Package Roles

- `client core`：客户端共享访问层，不关心 CLI / Web 的 UI 形态。
- `backend core kernel`：服务端领域编排与运行时能力模型，不关心进程如何启动。
- `host`：把核心内核装配为可执行进程、HTTP 服务或 worker 的壳层。

### Deployment Roles

- `light host`：单机、本地或单实例装配，强调最小依赖和低运维。
- `heavy host`：分布式装配，强调独立扩缩容、读写隔离和服务边界。

### Service Roles

- `gateway`：唯一外部入口，负责请求聚合、限流、外部认证边界和稳定 API surface。
- `identity-access`：负责 auth、session、access-keys、membership、team 与 RBAC decision。
- `knowledge-read`：负责 retrieval、query trace、只读投影、status read model 与读缓存。
- `knowledge-write`：负责 knowledge / trap / skill / lifecycle / maintenance / decay 的 authoritative 写路径。
- `candidate-ingestion`：负责候选提交、归一化、去重预处理、候选状态推进。
- `governance-review`：负责人工介入队列、审核工作流、冲突解决与 remediation 队列。
- `job-runtime`：负责 task queue、workflow runs、outbox dispatch、shared jobs、投影 follow-up。

## 架构原则

- 所有客户端只对 gateway SDK / gateway API 编程。
- 所有宿主都对 `backend core` 编程，不直接复制业务逻辑。
- 微服务边界先按 authoritative ownership、读写路径和故障域划分，再考虑物理进程数。
- 首期可以保留共享数据库，但不能把共享数据库当作“服务边界不需要定义”的借口。

## 数据库原则

- 首期重后端继续采用共享 PostgreSQL，避免在服务边界还未稳定时同步引入拆库复杂度。
- 即使共享数据库，也必须有明确的表级 ownership、写入 ownership 和投影 ownership。
- authoritative write 必须由 owning service 发起，其他服务不能绕过它直接改同一域的真相表。
- 跨服务一致性首选 `outbox + queue + projection`，而不是依赖分布式事务。
- 只有当某个服务长期需要独立扩容、独立故障域、独立数据生命周期时，才进入拆库评估。

## 非目标

- 不在本计划中规定前端页面或组件实现。
- 不把单个服务继续立刻裂成过细的技术层服务，例如单独的 `role-service`、`permission-service`、`queue-service`。
- 不在首期要求每个 bounded context 独立数据库。
- 不在首期引入跨库分布式事务或两阶段提交。

## 输出要求

- 后续所有子计划必须显式说明：
  - 自己服务于哪个包角色或宿主角色
  - 依赖哪个前置子计划
  - 是否改变 gateway API surface
  - 对 `local-agent`、`team-monolith`、`distributed` 的影响
