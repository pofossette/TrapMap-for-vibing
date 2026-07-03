# Server 三分类清理清单设计

> 日期：2026-06-27
> 对应计划：[`docs/archived/archived-plans/backend-build-targets-plan.md`](../../archived/archived-plans/backend-build-targets-plan.md) Phase 2
> 根索引：[`plan.md`](../../../plan.md)

## 背景

`packages/server` 当前是混合包：同时承担 Fastify compatibility shell、shared runtime/status seam、legacy authoritative write route 和默认 light 宿主入口聚合。Phase 0 已冻结其归类为 `compatibility shell`，Phase 1 已冻结 `light` 默认主入口终局为 `host-local/src/nest/**`。

本文档是 Phase 2 的执行细则：对 `packages/server` 及其关联文件/职责做三分类（可直接删 / 先迁后删 / 必须保留），并冻结 connector 与 host seam 结论、删除顺序、风险点和最小验证清单。

## 三分类清单

### 可直接删

以下对象不拥有真实业务、不持有默认入口、删除只需 import/caller 切换：

| 对象 | 原因 |
|---|---|
| `packages/server/src/routes/compatibility-shell.ts` | 仅是 501 `capability_unsupported` 响应 helper，不拥有真实业务 |
| `packages/server` 内所有"只为 compatibility shell 返回 501"的写入口外壳 | 典型如 decay batch 写入口；同类若只做 auth/schema 后直接 `sendCompatibilityShellUnsupported()`，可在调用方切走后直接删 |
| `packages/backend-core/src/modules/*.ts` 纯 re-export facade | 已冻结的 compatibility facade，不应继续扩写；替换 import 后可删 |

### 先迁后删

以下对象仍承担真实职责，必须先迁到 `host-local` Nest、共享 seam 或 backend-core port，再删旧路径：

| 对象 | 当前职责 | 迁移目标 | 阻塞条件 |
|---|---|---|---|
| `packages/server/src/app.ts` 的 `buildServer()` | Fastify app 聚合、runtime deployment 解析、request/trace header 回写、runtime routes 注册、capability route wiring | `host-local` 或共享 runtime seam | `host-local/src/bootstrap/server.ts` 仍直接依赖它 |
| `packages/server/src/config.ts` | env schema truth source | `host-local` owned config seam 或共享 runtime seam | `host-local/src/nest/config/config-bridge.ts` 仍把它当 env schema truth source |
| `packages/server/src/lib/runtime/**` 与 `registerRuntimeRoutes()` / `handleRuntimeError()` | shared runtime/status seam | 共享 seam 或 `host-local` 明确模块 | 还挂在 `server` 名下 |
| `packages/server/src/routes/review.ts` | `POST /v1/knowledge/review` authoritative write | `host-local` Nest 主路径或 `backend-core`/service seam | 仍是 authoritative write |
| `packages/server/src/routes/candidates/resolution.ts` | manual-result 和 apply-resolution 真实写侧流程 | `host-local` Nest 或共享 port 驱动路径 | 仍执行真实写侧 |
| `packages/server/src/routes/maintenance.ts` | 读侧 list 为真功能，batch 写侧若已 shell 化可单独删 | 先拆读写，读侧保留，写侧迁移后删 | 读写混合文件 |
| `packages/host-local/src/bootstrap/server.ts` | Fastify rollback path 真实入口 | 默认脚本与 smoke 全切到 Nest 后删除 | 直到 Nest 全切前只能保留 |
| `packages/host-local/src/nest/config/config-bridge.ts` | 把 `server/config.ts` 当 env schema truth source | 等 server/config ownership 迁走后一起替换 | 本身不是长期终局 |
| `packages/server/src/routes/operations/**` legacy route pack | 混合读面、写面、纯 501 | 逐个区分后分别处理 | 不能整包删除 |

### 必须保留

以下对象是核心架构 seam，不得删除：

| 对象 | 理由 |
|---|---|
| `packages/backend-core/src/ports/internal-ports.ts` | in-process / remote 双 adapter 的统一 port seam，唯一业务调用契约 |
| `packages/backend-core/src/invocation/invocation-model.ts` | `InvocationError` taxonomy，统一失败语义基础 |
| `packages/host-local/src/nest/adapters/*` | `adapter-factory.ts`、`in-process.adapter.ts`、`remote.adapter.ts`，light/heavy 共用 seam 的宿主装配 |
| `packages/host-local/src/nest/runtime/request-context.*` | request/trace header 提取与传播，host runtime seam |
| `packages/host-distributed/src/gateway/internal-client.ts` | remote transport、timeout、503/504 映射、header 传播 |
| `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` | 把 remote HTTP 状态收敛为 `InvocationError`，owner 边界闭环 |
| `packages/service-governance-review` / `packages/service-knowledge-write` / `packages/service-knowledge-read` 路由与 README 中冻结的 owner 叙事 | heavy 路径的 authoritative service seam |

## Connector 与 Host Seam 冻结结论

### 统一边界

- **Port 边界**冻结为 `packages/backend-core/src/ports/internal-ports.ts`。host-local 的 in-process adapter 与 remote adapter 都只能实现这些 port，不能再各自长业务规则。
- **Adapter 选择权**冻结在 host assembly。`adapter-factory.ts` 明确声明"adapter selection is the host assembly's responsibility"。业务模块不得根据 profile/runtime 自己判断 local/remote。

### 失败语义

- **InvocationError taxonomy** owner 冻结在 `backend-core`。transport 层只负责把 HTTP/Abort/network 错误映射成 `InvocationError`；业务 owner 不再传播裸 HTTP status。

### 超时与重试

- **超时** owner 冻结在 remote adapter / internal client。host-local remote adapter 与 host-distributed internal client 都持有 `timeoutMs` 和 `AbortController`；业务 port 不拥有 transport timeout 逻辑。
- **重试** owner 冻结在 async runtime / operator 流程，不在 sync connector。sync path 不做"retry-and-hope"；outbox / queue retry 才是正式重试层。

### 幂等与传播

- **幂等** owner 冻结在 command owner service。knowledge-write 与 governance-review README 已冻结 canonical idempotency key 语义；adapter 不生成业务幂等键，只透传。
- **Trace/header 传播** owner 冻结在 host runtime + remote transport。`RequestContextMiddleware` 提取/回写 requestId 与 trace header；host-distributed acceptance test 已验证 gateway 到内部服务的 header 传播。业务 port 只消费上下文，不拼 header。

### Status/Readiness

- **Status/readiness** owner 冻结在 host 或 service process，而不是 `packages/server`。distributed 已按 service 自带 `/internal/health|readiness|ownership`；light 终局也应由 host-local 提供同类 surface。server 只能作为迁移期 shared helper。

## 删除顺序与依赖关系

```text
1. 先冻结"不准新增"的边界并停止回流
   └─ packages/server 不再接收新的主实现、host concern、legacy write

2. 先迁 buildServer 依赖
   └─ host-local 默认启动、smoke、文档从 src/bootstrap/server.ts -> @trapmap/server/buildServer()
      切向 src/nest/main.ts 主路径

3. 再迁 runtime/config owner
   └─ 从 server/config.ts + server/lib/runtime/** 抽出到 host-local owned config/runtime seam
   └─ 完成前不能删 server/config

4. 再迁 status/readiness owner
   └─ 把 light 的 /health /ready /meta/routes authoritative surface 固定在 host-local

5. 再迁 legacy authoritative write 路径
   └─ 先迁 review、candidate apply-resolution/manual-result、maintenance 真读写真相
   └─ 迁完后删对应 Fastify route

6. 最后删纯 compatibility shell 与 501 route
   └─ 包括 compatibility-shell.ts 和所有仅转发/仅 501 的 route pack

7. 最后收缩 packages/server
   └─ 只剩 shared runtime/status helper 时，决定继续薄保留还是整体并入共享 seam
   └─ Phase 2 不应再让它保有 host 入口身份
```

### 步骤间依赖

- **buildServer 删除** → 依赖 host-local 默认脚本、deployment smoke、文档 truth source 全部切换
- **server/config 删除** → 依赖 host-local Nest 不再 import `@trapmap/server/config.js`
- **review/candidate Fastify 写入口删除** → 依赖 Nest 或 service seam 已有等价 route/port，并通过最小测试
- **501 shell 删除** → 依赖外部调用方与 rollback 文档都已切走

## 风险点

| 风险 | 缓解 |
|---|---|
| 误删 `packages/server` 里仍被 Fastify rollback path 使用的 runtime/config/bootstrap 真实职责 | 严格按"先迁后删"顺序，每步验证测试通过 |
| host-local Nest 当前有 stub provider 默认 wiring；"切默认入口"和"补真实 provider wiring"混成一个任务导致回归面大 | 拆成独立步骤，先切入口再补 wiring |
| `review.ts` 和 `candidates/resolution.ts` 被误判为 compatibility route 直接删 | 这两个是 authoritative write，必须先迁再删 |
| `maintenance.ts` 被当成纯写侧整文件删除 | 读写混合文件，必须先拆读写 |
| `server/config.ts` 过早复制到 host-local 制造第二套配置真相 | 先确定 ownership 再迁移，不复制 |
| host-local 与 host-distributed 允许 remote adapter 但业务规则分叉到 adapter 内 | adapter-specific payload shaping 视为越界 |
| distributed 路径已冻结的 403/404/409/503/504 语义被 light 路径重新定义 | 统一 InvocationError taxonomy，不允许 host-specific failure contract 漂移 |

## 最小验证清单

### Connector seam

- `rtk pnpm --filter @trapmap/host-local test --run src/nest/adapters/adapter-factory.test.ts`
- 必要时补 remote adapter 单测，确认 InvocationError 映射不漂移

### Request/trace 传播

- `rtk pnpm --filter @trapmap/host-local test --run src/nest/runtime/request-context.test.ts`
- `rtk pnpm test:distributed-acceptance`

### Light host cutover / rollback

- `rtk pnpm --filter @trapmap/host-local test --run src/bootstrap/server.test.ts`
- `rtk pnpm --filter @trapmap/host-local test --run src/nest/app.test.ts`

### Server legacy route 删除前

- 对应文件级测试：`review.test.ts`、`candidates.test.ts`、`maintenance.test.ts`、`decay.test.ts`
- 删除 501 route 时，补/改为显式 absence 或新 owner route 测试

### Runtime / deployment surface

- `rtk pnpm test:deployment-smoke`
- 如改 runtime foundations：`rtk pnpm test:runtime-foundations`

### 文档与结构

- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

## 各包禁止新增的内容

### packages/server

- 禁止新增 authoritative host bootstrap
- 禁止新增真实写侧 route
- 禁止新增 config/runtime/status 的长期 owner 逻辑
- 禁止新增 light 默认入口相关事实

### packages/host-local

- 禁止再造一套独立于 backend-core ports 的业务接口
- 禁止在 in-process/remote adapter 里埋业务分支
- 禁止复制 `server/config.ts` 成第二套 env truth

### packages/host-distributed

- 禁止把 gateway 扩成业务 owner
- 禁止在 internal client 里写业务 fallback 或 aggregate mutation
- 禁止把 service-specific failure semantics 发散成不同 taxonomy

### packages/backend-core

- 禁止引入 HTTP/Fastify/Nest/fetch 等 host-specific transport 细节
- 禁止把 adapter 选择逻辑、header 拼装、timeout/retry 定义塞进业务模块
- 禁止为 local/distributed 维护两套业务规则实现

## 弱能力 Agent 委托提示词

### 任务边界

1. 只执行以下类型的改动：
   - import path 替换
   - facade / shim 清理
   - 已确认仅返回 501 `capability_unsupported` 的 compatibility route 删除
   - 文档同步
   - 测试补齐或测试路径更新
2. 不得新增任何 authoritative 主实现到 `packages/server`。
3. 不得让 `host-local` 和 `host-distributed` 长出两套业务规则分叉。
4. 任何"先迁后删"的对象都不能直接删除。

### 执行规则

- 先读当前计划与冻结结论，再动手。
- 只删除满足以下条件的对象：
  - 该对象不拥有 bootstrap / config / runtime / status / readiness
  - 该对象不执行真实写侧业务
  - 该对象只做 re-export、import shim，或只返回 501 `capability_unsupported`
- 做 import 替换时，优先把调用方切到已存在的 host-local Nest、backend-core port、service-* 或明确共享 seam。
- 做文档同步时，只回写已冻结事实，不补自己的判断。

### 必须停止并回交强能力 Agent 的条件

- 发现某个 route 仍在执行真实写侧逻辑（review、candidate apply-resolution/manual-result、maintenance 真实读写）
- 发现某个文件仍被 host-local 默认启动链路、deployment smoke、runtime/config/status/readiness 依赖
- 发现需要设计新的 port、adapter contract、失败语义、timeout/retry/idempotency 规则
- 发现需要在 server、host-local、host-distributed、backend-core 之间重新划 owner
- 发现删除某文件会影响 `buildServer`、`server/config`、runtime routes、request/trace propagation、distributed acceptance
- 发现同一路径在 light/heavy 下行为不一致，且修复需要业务判断
- 发现测试失败暴露的是架构 owner 问题，而不是纯 import/路径/断言更新问题

### 输出要求

- 列出改了哪些 import / facade / 501 route / doc / test
- 列出没动的高风险对象
- 列出是否触发了"停止并回交强能力 agent"条件

## 与现有计划的关系

- 本文档是 `backend-build-targets-plan.md` Phase 2 的执行细则
- 本文档覆盖 Phase 2 中"兼容壳清理"和"connector / 装配边界"的全部内容
- Phase 2 中"轻重路径 connector / invocation / transport glue 收敛"的实现策略参照本文档的 connector seam 冻结结论
- 与 `nestjs-service-evolution-04-data-runtime-and-cutover.md` 中 compatibility shell 关闭条件对齐
