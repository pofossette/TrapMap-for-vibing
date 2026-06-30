# NestJS 服务演进 Phase 2

## 角色

- 状态：`active`
- 目标：冻结 modular-monolith 切换时的六个 bounded context 边界、共享主实现面和 legacy compatibility boundary，并给出后续机械迁移的单一事实源
- 说明：本文件补齐的是 `Phase 2` 的边界与迁移模板，不等于默认开发入口已经切换完成；真正 closeout 仍以代码、测试和文档回写为准

## 当前已冻结的 Phase 2 内容

- [x] 六个 bounded context 的 owner、入站 surface、跨 context 依赖和非目标
- [x] `backend-core` 中必须保持 framework-free 的目录与禁止项
- [x] `embedded/local-agent` 与 `team-monolith` 共用同一主实现面的规则
- [x] 旧 `packages/server` / `packages/host-*` 的 compatibility boundary
- [x] 面向后续执行者的机械迁移提示词
- [x] 主要 bounded context 完成代码级 `domain/application/module` 收口
- [ ] 默认本地开发入口切到新的 Nest modular monolith
- [ ] 旧 Fastify 宿主降级为 rollback-only compatibility shell

## Phase 2 拍板结论

### 1. 六个 bounded context 边界

> `gateway` 仍然是宿主拥有的外部 transport shell，不算第七个 bounded context。业务 owner 只固定为下表六个 context。`governance-review` 是对外/包级名称；`backend-core` 现有模块 descriptor 中保留 `review` 作为兼容 shorthand。

| Context | Authoritative owner | 入站 surface | 允许同步依赖 | 明确不拥有 | Phase 2 目标落点 |
|---|---|---|---|---|---|
| `identity-access` | auth、session、access-key、team、membership、RBAC、actor lookup | gateway auth/team/member/access-key routes；其他 context 的 auth / permission check | 仅共享 `ports` / `invocation` / `audit` seam | retrieval、knowledge lifecycle、candidate pipeline、queue/outbox runtime | `packages/backend-core/src/identity-access/` + `packages/host-local/src/nest/identity-access/` |
| `knowledge-read` | retrieval query、read projection、projection-status、query trace、cache/index metadata | gateway read routes；distributed internal read routes | 只读 projection seam；不得依赖 knowledge-write 的事务对象 | authoritative knowledge write、review queue、candidate 状态真相 | `packages/backend-core/src/knowledge-read/` + `packages/host-local/src/nest/knowledge-read/` |
| `knowledge-write` | knowledge / trap / evidence / artifact / lifecycle authoritative writes；review / maintenance / decay / candidate publish 的最终 aggregate mutation | gateway write routes；`governance-review` review/maintenance/decay 命令；`candidate-ingestion` publish result | `identity-access`（鉴权前提）、`job-runtime`（outbox / async follow-up substrate） | retrieval projection、review queue/workbench、candidate pipeline state | `packages/backend-core/src/knowledge-write/` + `packages/host-local/src/nest/knowledge-write/` |
| `governance-review` | review queue、review decision workflow、feedback、remediation、operator-facing maintenance/decay command semantics | gateway review / operator routes；必要的 runtime operator trigger | `KnowledgeWritePort` 仅用于最终 aggregate mutation；可读自己的治理投影 | knowledge authoritative tables、retrieval index、candidate 事实、queue/outbox runtime | `packages/backend-core/src/governance-review/` + `packages/host-local/src/nest/governance-review/` |
| `candidate-ingestion` | candidate intake、normalize、dedup、analysis、manual result、resolution、lineage | gateway candidate routes；job handler / worker 入口 | `KnowledgeWritePort`（publish result）、`JobRuntimePort`（schedule / workflow） | knowledge authoritative tables、review workbench、gateway auth session truth | `packages/backend-core/src/candidate-ingestion/` + `packages/host-local/src/nest/candidate-ingestion/` |
| `job-runtime` | task queue、workflow runs、outbox dispatch、retry / reclaim / dead-letter / worker status | host bootstrap、worker process、operator status/query seam | handler registry 由其他 context 注入，但业务判断不回流到本 context | 任意业务 aggregate 决策、knowledge/review/candidate authoritative tables | `packages/backend-core/src/job-runtime/` + `packages/host-local/src/nest/job-runtime/` |

边界规则：

- 任何跨 context 同步调用都必须走 `packages/backend-core/src/ports/internal-ports.ts` 定义的 Port，不允许直接跨目录 import repo 或 route helper。
- `knowledge-write` 是唯一能落最终 knowledge aggregate truth 的 owner；`governance-review` 和 `candidate-ingestion` 只能通过 `KnowledgeWritePort` 委托。
- `knowledge-read` 可以保留被文档显式点名的 query/projection exception，但这些显式例外仍属于 `knowledge-read` 自己的 read-side debt，不得变回 route-local 拼装。
- `job-runtime` 只拥有 runtime substrate，不拥有任何业务 state machine；handler 中出现的业务判断必须下沉回业务 context。

### 2. `backend-core` 必须保持 framework-free 的范围

`backend-core` 在 Phase 2 继续保留单包，不预拆成多个 workspace package；但其内部边界必须按 bounded context 收口。以下内容必须保留在 `backend-core`，且必须保持 framework-free：

- `packages/backend-core/src/ports/**`
- `packages/backend-core/src/invocation/**`
- `packages/backend-core/src/runtime/capability-model.ts`
- `packages/backend-core/src/runtime/route-surface.ts`
- `packages/backend-core/src/runtime/topology.ts`
- 各 context 的 `domain/`：实体、值对象、状态机、policy、只依赖共享 contract 的 domain helper
- 各 context 的 `application/`：use-case orchestration、projection status builder、port composition、仅返回 Port contract 的 module factory
- 各 context 的 `module.ts` / `index.ts`：module descriptor、factory、barrel
- `packages/backend-core/src/testing/**`
- `packages/backend-core/src/use-cases/**` 中仍可复用的 host-agnostic pattern；若某个 use case 只服务单一 context，则迁回对应 context 的 `application/`

以下内容不得进入 `backend-core`：

- `@nestjs/*`、`fastify`、`express`、controller、guard、filter、pipe、decorator
- `process.env`、`ConfigModule`、startup/bootstrap、`FastifyReply` / `Request` / `Response`
- PostgreSQL / Drizzle / RabbitMQ / HTTP client / filesystem 的 concrete adapter
- `packages/server`、`packages/host-*`、`packages/service-*` 的实现细节
- profile-specific route registration、timeout header 映射、remote transport fallback

判据只有一个：如果某段代码拿掉 Nest/Fastify/PG 之后仍然应该继续存在，它就属于 `backend-core`；否则它属于 host、service assembly 或 compatibility shell。

### 3. `embedded/local-agent` 与 `team-monolith` 共用同一主实现面

Phase 2 冻结的共享主实现面是：

- `packages/host-local/src/nest/app.module.ts`
- `packages/host-local/src/nest/gateway/`
- `packages/host-local/src/nest/<context>/` 六个 bounded-context Nest module
- 这些 Nest module 所消费的同一套 `backend-core` `domain/application/module` factory

两档 profile 的共用规则：

| 维度 | `embedded/local-agent` | `team-monolith` | 共同规则 |
|---|---|---|---|
| 调用模式 | `in-process` | `in-process` | 不把 remote hop 变成默认热路径 |
| 宿主 | 同一 `AppModule` / 同一 bounded-context module graph | 同一 `AppModule` / 同一 bounded-context module graph | 不允许再做两套平行 monolith 主实现 |
| 存储 | 可选 JSON store；允许最小依赖启动 | PostgreSQL authoritative path | provider 差异只发生在 host wiring，不发生在业务模块实现 |
| 鉴权 | single-user / local governance capability | team auth / membership / RBAC | 鉴权差异由 capability + provider 决定，不复制业务规则 |
| 路由暴露 | 允许 capability-gated 最小 surface | 完整 team-monolith surface | route gating 走 runtime capability model，不分叉 controller 语义 |
| worker / outbox | 可在同进程内最小化拥有 | 同进程完整拥有 | async ownership 通过 capability 和 provider 裁剪，不复制 job logic |

禁止项：

- 不新增 `app.local-agent.module.ts` 和 `app.team-monolith.module.ts` 两套长期并行主实现面。
- 不在 `local-agent` 分支里复制一份 `knowledge-*` / `review` / `candidate` 业务逻辑。
- 不因为 capability 不同就在 route-local helper 中发明第二套 DTO / schema / error vocabulary。

如果某能力只在 `team-monolith` 可用，处理方式是 “同一模块图 + capability gate / provider override / route surface trim”，而不是“新建另一套实现面”。

### 4. 旧 `server/host-*` compatibility boundary

| 兼容层 | 允许保留到 Phase 2 closeout 的职责 | 从现在起禁止新增的内容 | 关闭窗口条件 |
|---|---|---|---|
| `packages/server` | legacy Fastify rollback path、runtime/status/readiness、operator compatibility route、旧测试与显式迁移窗口 | 新 authoritative orchestration、新 context 级 `domain/application` 逻辑、新 shared contract、新 route-local shadow type | `dev:local-agent` / `dev:team-monolith` 默认切到 Nest，docs/testing/deployment 入口完成切换 |
| `packages/host-local/src/bootstrap/**`、`src/http/**`、`src/runtime/**` 中的旧 Fastify 路径 | 启动兼容、parity fix、回退保障 | 新的 bounded-context 实现、新 controller / schema、新业务写路径 | Nest 主线覆盖默认开发链路后只保留 rollback-only |
| `packages/host-distributed` | distributed profile 的 process bootstrap、remote adapter、service registration、deployment-specific config | shadow business logic、第二套 internal contract、绕过 `backend-core` Port 的跨服务 repo 调用 | Phase 3 以后继续保留为部署展开点，但必须消费同一主实现面 |
| `packages/service-*` | distributed internal route / deps / server thin assembly | framework-free business fork、跨 service 直接 repo write、context-local contract 重定义 | 可长期保留，但只作为 transport adapter 和 process entry |

一句话规则：

- `packages/server` 和旧 Fastify host 只保留“兼容壳”和“回退路径”职责。
- `packages/host-distributed` 不是兼容壳，它是部署展开层；但它也不是第二套业务真相。
- 真正的主实现面只能是 `backend-core` + `packages/host-local/src/nest/**` 这条 modular-monolith 主线。

### 5. 目标目录布局

Phase 2 的机械迁移不先拆 workspace package，只先把单包内核和 Nest host 目录收口到以下形态：

```text
packages/backend-core/src/
  identity-access/
    domain/
    application/
    module.ts
    index.ts
  knowledge-read/
    domain/
    application/
    module.ts
    index.ts
  knowledge-write/
    domain/
    application/
    module.ts
    index.ts
  governance-review/
    domain/
    application/
    module.ts
    index.ts
  candidate-ingestion/
    domain/
    application/
    module.ts
    index.ts
  job-runtime/
    domain/
    application/
    module.ts
    index.ts
  modules/
    *.ts            # 迁移窗口内仅保留 compatibility re-export
  ports/
  invocation/
  runtime/
  testing/
  use-cases/        # 只保留跨 context 可复用且 framework-free 的模式

packages/host-local/src/nest/
  app.module.ts
  gateway/
  identity-access/
  knowledge-read/
  knowledge-write/
  governance-review/
  candidate-ingestion/
  job-runtime/
  adapters/
  config/
  runtime/
```

目录规则：

- `backend-core/src/modules/*.ts` 在迁移窗口内退化为 re-export façade，目的是让 import 改造可以分批完成。
- `packages/service-*` 继续保留 `deps.ts` / `routes.ts` / `server.ts` / `index.ts` 四类薄装配文件；业务规则不再留在这些包里。
- `packages/host-local/src/nest/<context>/` 只放 Nest module、token、provider wiring、controller；`domain/application` 归 `backend-core`。

## 机械迁移任务提示词

下面的提示词面向后续执行者，目标是按已冻结边界做机械迁移，不再重开架构讨论：

```text
你在 Trap-Map 仓库执行 NestJS 服务演进 Phase 2 的机械迁移。先读取 `plan.md`、`docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`，严格按已冻结边界做实现，不要重新设计 owner 或 profile。

执行要求：
1. 在 `packages/backend-core/src/` 下为六个 bounded context 建立目标目录：
   - `identity-access/`
   - `knowledge-read/`
   - `knowledge-write/`
   - `governance-review/`
   - `candidate-ingestion/`
   - `job-runtime/`
   每个目录至少拆出 `domain/`、`application/`、`module.ts`、`index.ts`。把现有 `src/modules/*.ts` 中的业务实现迁过去；`src/modules/*.ts` 和 `src/modules/index.ts` 在迁移窗口内只保留 compatibility re-export。
2. 迁移时保持 `backend-core` framework-free：
   - 不引入 `@nestjs/*`、`fastify`、`process.env`、PG/MQ/HTTP concrete client。
   - 端口、invocation、runtime capability/topology、testing utilities 继续留在 `backend-core`。
3. 改所有直接受影响的 import：
   - `packages/service-*`
   - `packages/host-local/src/nest/**`
   - `packages/host-distributed/**`
   - 任何直接引用 `@trapmap/backend-core/modules/*` 或旧 `src/modules/*` 的测试
   优先改到新的 context barrel；只在 compatibility 窗口需要时保留旧 re-export。
4. 在 `packages/host-local/src/nest/` 下补齐六个 bounded-context Nest module，并在 `packages/host-local/src/nest/app.module.ts` 注册：
   - `identity-access`
   - `knowledge-read`
   - `knowledge-write`
   - `governance-review`
   - `candidate-ingestion`
   - `job-runtime`
   要求 `embedded/local-agent` 与 `team-monolith` 共用同一 `AppModule` 和同一 bounded-context module graph；profile 差异只能通过 capability / provider wiring / route surface gating 体现。
5. 不要把新业务逻辑继续放回：
   - `packages/server`
   - `packages/host-local/src/bootstrap/**`
   - `packages/host-local/src/http/**`
   - `packages/host-distributed` 的 host bootstrap 以外位置
   这些地方只允许保留 compatibility shell、rollback path、remote adapter 或 process bootstrap。
6. 补文档索引与事实源：
   - `docs/README.md`
   - `docs/todos/README.md`
   - `docs/PACKAGES.md`
   - `docs/architecture/ARCHITECTURE.md`
   - `docs/reference/REPO_STRUCTURE.md`
   - `docs/reference/SYSTEM_TRUTH_SOURCES.md`
   如果 package 角色发生可见变化，再补对应 package README。
7. 跑最小验证并修直观报错，只处理这次迁移直接导致的问题：
   - `rtk pnpm --filter @trapmap/backend-core test --run src/modules/boundary-import-guard.test.ts src/modules/boundary-ownership.test.ts src/modules/knowledge-read.test.ts`
   - `rtk pnpm --filter @trapmap/host-local test --run src/nest/app.test.ts src/nest/adapters/adapter-factory.test.ts src/nest/runtime/exception-filter.test.ts src/nest/runtime/request-context.test.ts`
   - 对你实际改到的 `service-*` 包分别跑 `rtk pnpm --filter <pkg> test --run <touched-test-path>`
   - `rtk pnpm typecheck`
   - `rtk pnpm check:docs-drift`
   - `rtk pnpm check:structure`
8. 如果测试或 typecheck 失败，只顺手修 import path、barrel export、Nest module registration、token/provider wiring、文档索引漂移、显而易见的类型错误；不要顺手做额外重构。

交付要求：
- 最终说明中按“边界保持不变、迁移已完成的目录、仍保留的 compatibility shell、跑过的验证”四项汇报。
```

## 文档回写

- [x] `docs/README.md`
- [x] `docs/todos/README.md`
- [x] `docs/PACKAGES.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `docs/reference/REPO_STRUCTURE.md`
- [x] `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] 代码切换完成后再补 `README.md`、`docs/operations/TESTING.md`、受影响 package README

## 推荐的最小验证集合

- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`
- 若继续执行代码迁移，再追加：
  - `rtk pnpm --filter @trapmap/backend-core test --run <touched-test-path>`
  - `rtk pnpm --filter @trapmap/host-local test --run <touched-test-path>`
  - `rtk pnpm typecheck`

## 完成定义

- 六个 bounded context、framework-free 范围、shared main implementation surface 与 legacy compatibility boundary 已经不再依赖口头说明。
- 后续执行者可以直接按本文件的目录布局和提示词推进机械迁移。
- `Phase 2` 是否完成，仍取决于默认开发入口切换、代码落地、最小测试和文档 truth-source closeout，而不是仅凭本文件存在。
