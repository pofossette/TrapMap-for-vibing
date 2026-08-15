# NestJS 服务演进 Phase 1

## 角色

- 状态：`in_progress`
- 目标：建立第一条可运行的 Nest 宿主与 contract 基础
- 本阶段当前已完成的是方案拍板，不等于宿主切换完成；交付项仍以代码、测试和文档 closeout 为准。

## 交付物

- [ ] 一个可运行的 Nest 宿主主入口，能装配现有核心模块
- [ ] 统一配置加载、异常映射、认证上下文和生命周期钩子
- [ ] 统一外部 SDK 与 internal client 生成/维护方式
- [ ] 为 internal port 提供 `in-process` / `remote` 双 adapter
- [ ] 明确旧 `host-local` / `service-*` 的兼容窗口

## Phase 1 拍板结论

### 1. Nest host 装配方案

- 首个 Nest 宿主不新增 `service-gateway` 或第四种常驻 profile；稳定入口继续是 `packages/host-local`，对外语义仍是 `local-agent` / `team-monolith`。
- Nest HTTP 底座固定采用 `FastifyAdapter`，Phase 1 只替换宿主、DI、中间件、过滤器和校验管线，不同时切换 transport 语义。
- 第一批 Nest 代码落点固定在 `packages/host-local/src/nest/`，建议目录职责如下：
  - `bootstrap.ts` / `main.ts`：`NestFactory`、Fastify adapter、生命周期钩子
  - `app.module.ts`：根 module graph
  - `gateway/`：外部 controller、guard、response mapper
  - `knowledge-read/`：首个样板 bounded-context module/provider/controller
  - `adapters/`：`in-process` / `remote` provider factory
  - `config/`：Nest `ConfigModule` bridge
  - `runtime/`：request context、trace、exception filter、validation pipe
- `packages/backend-core` 与 `packages/service-*` 继续是业务内核和 bounded-context 装配面；Nest controller 只注入 `Port` 接口或 service-assembly factory，不重写业务规则。
- `packages/server` 在 Phase 1 继续保留 runtime/status/compatibility shell 身份；可复用其 `config.ts`、`lib/runtime/*` 与启动辅助模块，但不把 `buildServer()` 包进 Nest 再套一层宿主。

### 2. 首个样板服务选择

- 首个试点固定为 `gateway + knowledge-read`。
- 要打通的真实链路固定为以下 surface 中至少一条，从外部 gateway 入口一路走到 `KnowledgeReadPort`：
  - `/v1/retrieval/search`
  - `/v1/knowledge/:entryId`
  - `/v1/knowledge/mine`
  - `/v1/knowledge/projection-status`
- 选择 `knowledge-read` 的原因：
  - 读链路不承接 authoritative write，Phase 1 可以先验证宿主、contract 和 adapter，不把风险叠到写侧迁移。
  - `packages/service-knowledge-read` 已有独立 service assembly、projection-status 契约和真实 distributed route 语义，足够代表 bounded-context host wiring。
  - 它同时覆盖 “temporary direct-backed read” 与 “derived retrieval search” 两类读面，能更早暴露 request context、timeout、freshness 和 error mapping 问题。
- `identity-access` 延后，不作为首个样板。延后原因：
  - 当前 `packages/contracts/src/domain/auth.ts` 与 CLI 已固定 access-key / system-admin-key 登录叙事，但现有 host/service 路由仍残留 `handle/password`、body-carried `sessionToken` 等旧形态，auth surface 仍有 contract drift。
  - 先把 identity-access 放进 Nest 试点，会把宿主迁移和 auth contract 清理绑成一个大任务，增加 Phase 1 失败面。
- 暂不纳入本轮样板的 bounded context：
  - `knowledge-write`、`governance-review`：留给 Phase 3 的成熟服务样板，不在 Phase 1 提前承担写侧 owner closeout。
  - `candidate-ingestion`：依赖 queue / publish / recovery 语义，适合在 dual adapter 与 runtime 规则稳定后推进。
  - `job-runtime`：横切 runtime owner，Phase 1 只消费其现有能力，不拿它做首个业务样板。

### 3. contract-first / OpenAPI 路线

- 外部 HTTP 主事实源继续固定为 `packages/contracts` 的 Zod schema；Nest DTO、class-validator class、controller-local interface 都不能成为真相源。
- Phase 1 新增或补齐的 HTTP 契约应先落在 `packages/contracts`，再在其上建立 `gateway` route manifest（method/path/request/response/status），由 Nest controller 和 `@trapmap/client-core` 共用。
- OpenAPI 不是新的主事实源。冻结路线为：`contracts/Zod -> route manifest -> generated OpenAPI artifact`。
- OpenAPI 产物只承担三类用途：
  - 文档与对外说明
  - smoke / contract diff
  - 后续给非 TypeScript 外部消费者导出时的派生格式
- Phase 1 不采用 “先写 OpenAPI，再 codegen 回 TypeScript SDK / internal client” 路线。原因：
  - 仓库当前消费者主要在同一个 TypeScript monorepo 内
  - `docs/PACKAGE_STACK_RATIONALE.md` 已明确 `contracts` 选择 Zod 是为了避免额外 OpenAPI/codegen 往返
  - internal port 需要表达 `in-process` 调用语义，OpenAPI 只能覆盖 remote transport，不能替代 `backend-core` port 合约
- `@trapmap/client-core` 继续作为 hand-maintained thin SDK；internal remote client 继续是 hand-written adapter，但必须消费同一份 route manifest / shared schema，而不是 route-local shadow type。
- Phase 1 closeout 前，若 pilot surface 仍缺共享 schema，必须先补 contract，再接 controller。

### 4. `in-process` / `remote` 双 adapter 语义

- 选择 adapter 的唯一地方是宿主装配层，不是业务代码。
- `embedded/local-agent` 与 `team-monolith` 默认只绑定 `in-process` adapter；它们不能为了“未来可拆”而把跨进程 hop 变成热路径前提。
- `distributed` profile 下：
  - owner-local dependency 仍优先 `in-process`
  - 只有跨 owner 调用才绑定 `remote`
  - gateway 面向 owner service 的调用可以是 `remote`
- 同一 `Port` 的 `in-process` 与 `remote` 实现必须满足同一方法签名、返回 shape、timeout budget 输入和 `InvocationError` taxonomy。
- `remote` adapter 允许增加 transport concern，但这些 concern 只能体现在装配与 observability 上：
  - 传播 `requestId` / `traceId`
  - 配置 timeout / retry policy
  - 打点 `mode=remote`
  - 映射 HTTP 非 `2xx` 到 `InvocationError`
- `remote` adapter 不得把 `fetch Response`、URL、HTTP header 解析结果或 status-code switch 泄漏给调用方；业务调用方只看 `Port` 返回值或 `InvocationError`。
- `in-process` adapter 不是“测试专用 stub”；它是轻后端与 modular-monolith 的默认主实现面。

建议以 `KnowledgeReadPort` 作为 Phase 1 样板 port，先实现：

| 调用场景 | adapter | 语义 |
|---|---|---|
| `host-local` gateway -> knowledge-read | `in-process` | 单进程直接注入 `KnowledgeReadPort` |
| `host-distributed` gateway -> knowledge-read | `remote` | HTTP 转发到 `packages/service-knowledge-read` |
| knowledge-read service 内部 | `in-process` | 直接装配 `createKnowledgeReadServiceModule()` |

### 5. 异常映射

- internal contract 层继续以 `packages/backend-core/src/invocation/invocation-model.ts` 的 `InvocationError` 为唯一错误 taxonomy。
- `401` 不扩写进 `InvocationErrorKind`；它属于 gateway/auth guard 的 transport concern。也就是说：
  - 会话缺失/过期 -> Nest guard 直接返回 `401`
  - 进入 port 之后的领域错误 -> 统一转成 `InvocationError`
- Nest 全局异常过滤器输出一套 canonical envelope：
  - `code`：机器可读错误码
  - `message`：用户/客户端可读消息
  - `kind`：`InvocationError.kind` 的兼容字段，供现有 internal remote adapter 继续解析
  - `requestId`：必填
  - `traceId`：可选
  - `details`：仅对 validation 等可安全暴露场景输出
- 在兼容窗口内，pilot internal route 额外保留 `error` 字段作为 `message` 的别名，避免现有 remote client 立即失配。

映射表固定为：

| 来源 | HTTP | `code` | `kind` |
|---|---|---|---|
| validation | `400` | `validation_error` | `validation` |
| forbidden | `403` | `forbidden` | `forbidden` |
| not-found | `404` | `not_found` | `not-found` |
| conflict | `409` | `conflict` | `conflict` |
| capability gated | `501` | `capability_unsupported` | `internal` |
| unavailable | `503` | `unavailable` | `unavailable` |
| timeout | `504` | `timeout` | `timeout` |
| unexpected internal error | `500` | `internal_error` | `internal` |
| missing / invalid session | `401` | `auth_required` / `auth_invalid` | `auth`（gateway-only alias） |

- Zod / validation-pipe 错误不能直接把原始 `ZodError` 暴露给外部路由；统一落到 `400 validation_error`。
- remote adapter 读取失败响应时，优先解析 `kind`，其次 fallback 到 `code` / status，最终转回 `InvocationError`。

### 6. 兼容窗口

- 兼容窗口固定覆盖 `Phase 1` 到 `Phase 2` 默认主线切换完成之前。
- `Phase 1` 窗口规则：
  - 默认启动入口仍是现有 Fastify 主线；Nest host 通过单独 opt-in 启动命令或 feature flag 暴露，不直接替换 `dev:local-agent` / `dev:team-monolith`
  - 只有 pilot surface 允许在 Nest 中先行实现；非 pilot route 继续由旧宿主承载
  - legacy host 只允许做 parity fix、compat shim、回退保障，不再为 pilot surface 新长 authoritative logic
- `Phase 2` 窗口规则：
  - 当 Nest 宿主已覆盖默认开发主链路后，`host-local` 默认实现切到 Nest
  - `packages/server` 与旧 Fastify host 仅保留 runtime/status、operator compatibility 和显式 rollback path
- 关闭窗口的前提：
  - 至少一条真实开发链路已通过 Nest 跑通
  - docs/testing/deployment 入口已经切换
  - rollback 说明和例外路径已在 `README`、`docs/architecture/DEPLOYMENT.md`、`docs/operations/TESTING.md` 写清
- 未关闭窗口前，不允许删除 legacy host，也不允许继续扩张它的业务真相边界。

## 范围

- [ ] `gateway` 宿主
- [x] 首个样板固定为 `knowledge-read`
- [ ] 配置模块、HTTP 过滤器、验证管线、日志/trace 中间件
- [ ] 轻后端单进程 worker/outbox 与远端 transport 的切换边界
- [ ] `identity-access` 的 auth contract drift closeout（作为 pilot 之后的前置工作）

## 剩余工程任务

- [x] 补 `packages/host-local/src/nest/` 脚手架，建好 bootstrap、root module、gateway controller、knowledge-read module 和 adapter factory
- [x] 把现有配置真相从 `packages/server/src/config.ts` 与 `packages/host-local/src/config/host-config.ts` 收口成可被 Nest `ConfigModule` 消费的共享装配面
- [x] 接 request context、auth guard、exception filter、validation pipe、logging/trace middleware
- [x] 回写 `README`、`docs/architecture/*`、`docs/operations/*`、package README
- [x] 补 pilot 最小测试、deployment smoke 与 docs/structure 守卫

## 文档回写

- [x] `plan.md`
- [x] `README.md`
- [x] `docs/README.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `docs/architecture/DEPLOYMENT.md`
- [x] `docs/operations/ENVIRONMENT.md`
- [ ] `docs/operations/TESTING.md`
- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] `docs/reference/api-surface.md`
- [ ] 受影响 package README

## 最小验证

- [x] `pnpm --filter @trapmap/host-local test --run <nest-related-test-path>`
- [ ] `pnpm --filter @trapmap/service-knowledge-read test --run <path>`
- [x] `pnpm typecheck`
- [ ] `pnpm test:deployment-smoke`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 证据入口

- `packages/backend-core/src/invocation/invocation-model.ts`
- `packages/service-knowledge-read/src/routes.ts`
- `packages/service-knowledge-read/src/deps.ts`
- `packages/host-distributed/src/gateway/internal-client.ts`
- `packages/host-distributed/src/shared/internal-knowledge-write-client.ts`
- `packages/server/src/config.ts`
- `packages/server/src/lib/runtime/request-context.ts`
- `docs/PACKAGE_STACK_RATIONALE.md`

## 完成定义

- 新宿主已能作为真实开发入口运行至少一条 `gateway + knowledge-read` 主链路。
- 共享 HTTP/contract 方案已经替代继续手写 route-local shadow type 的路径。
- 轻后端主链路在默认模式下不需要跨进程 HTTP hop。
- `Phase 1 -> Phase 2` 所需的兼容窗口、异常映射和 dual adapter 语义已经写成统一规则，而不是隐含知识。
