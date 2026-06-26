# NestJS 服务演进 Phase 0

## 角色

- 状态：`completed`
- 目标：冻结长期目标架构、边界、命名和迁移策略
- 当前实现说明：现有开发与运行入口仍由 `packages/host-local`、`packages/host-distributed` 和 `packages/server` 上的 Fastify 装配承载；NestJS 只作为后续宿主替换目标，不反写领域真相源。

## 交付物

- [x] 新后端目标形态图：`Nest host + framework-free domain core + gradual service extraction`
- [x] 三档运行模型：`embedded/local-agent`、`team-monolith`、`distributed`
- [x] 包级迁移矩阵：保留、拆分、重命名、退役
- [x] `contracts`、HTTP contract、internal contract、event contract 的主线方案
- [x] 单体优先、服务后拆的判据
- [x] distributed 成熟度基线评估与分级标准
- [x] 第一批成熟服务样板组与后续优先级

## 冻结结论

### 长期目标主线

- 唯一长期后端叙事固定为：`Nest host + framework-free domain core + gradual service extraction`。
- `backend-core` 继续承担框架无关的业务内核、运行时能力模型和 internal port；Nest 只接管宿主、HTTP transport、配置装配、进程内 DI 和生命周期。
- 迁移顺序固定为：先把轻后端与 modular monolith 收口成唯一主实现面，再把物理服务拆分视为部署展开；不平行重写第二套业务内核。
- `packages/server` 从 Phase 0 起只允许继续缩成 compatibility shell 与迁移窗口，不再新增 authoritative orchestration。

### 三档运行模型

| 档位 | 当前 profile / 入口 | 事实边界 | 默认调用方式 | Phase 0 冻结结论 |
|---|---|---|---|---|
| `embedded/local-agent` | `local-agent` / `pnpm dev:local-agent` | 单用户、单端口、轻量 gateway，可接受 JSON store | `in-process` | `embedded` 不是第四种 profile，而是当前 `local-agent` 的长期产品语义；未来 Nest 嵌入式宿主必须保留同等轻量体验 |
| `team-monolith` | `team-monolith` / `pnpm dev:team-monolith` | 小团队、单进程/单实例、完整治理、PostgreSQL | `in-process` 优先 | 默认开发与单机部署主线先切到这里，再考虑物理拆分 |
| `distributed` | `distributed` / `pnpm dev:distributed:*` | gateway + 六个 bounded-context owner + runtime worker 展开 | `remote` 只在确有边界收益时启用 | 作为可选部署展开，当前成熟度冻结为 `Level 2 / transitional-microservice` |

### 包迁移矩阵

| 包 / 目录 | Phase 0 冻结决策 | 说明 |
|---|---|---|
| `packages/backend-core` | 保留为单包 | 继续按模块收口，不在 Phase 0 预拆成多个 `domain-*` workspace package |
| `packages/contracts` | 保留并加强 | 继续作为 HTTP、internal、event contract 的共享事实源 |
| `packages/client-core`、`packages/cli`、`packages/web-panel` | 保留 | 所有客户端继续只面向统一 gateway surface 编程，不直连内部服务 |
| `packages/host-local` | 保留 | 作为轻宿主入口持续演进，后续可内部替换为 Nest，但不改变 `local-agent` / `team-monolith` 语义 |
| `packages/host-distributed` | 保留 | 作为 distributed 重宿主与 service assembly 的主要部署展开点；gateway 保持宿主拥有的外部适配面 |
| `packages/service-identity-access`、`packages/service-knowledge-read`、`packages/service-knowledge-write`、`packages/service-candidate-ingestion`、`packages/service-governance-review`、`packages/service-job-runtime` | 保留 | 继续作为明确 bounded-context owner 的 service assembly；新建物理服务包必须以 modular-monolith 边界先收口为前提 |
| `packages/server` | 逐步退役 | 保留 compatibility shell、runtime/status 和迁移窗口，不再接纳新的 authoritative write path |
| `packages/service-gateway` | 不创建 | gateway 在当前主线中是宿主拥有的外部适配层，不作为独立 `service-*` 包推进 |
| `packages/skills` | 保留 | 不受宿主迁移影响，继续承载项目级 Skill 工作流 |

命名冻结：

- 业务 shorthand `review` 对应当前 package/runtime 名称 `governance-review`；Phase 0 不做重命名，只在文档中明确“bounded-context owner”与“package/runtime label”的映射。
- `embedded/local-agent -> team-monolith -> distributed` 是三档长期运行模型，不新增第四种常驻 profile。

### Contract 主线方案

- HTTP / 外部 contract：继续以 `packages/contracts` 和统一 gateway API 为事实源；Fastify route 或未来 Nest controller 只做 transport adapter，不拥有 API shape。
- Internal contract：继续以 `packages/backend-core/src/ports/internal-ports.ts` 和 `packages/backend-core/src/invocation/*` 为事实源；同一 capability 必须同时支持 `in-process` 与 `remote` adapter。
- Event contract：继续以 `packages/contracts/src/domain/async.ts` 的事件名与 payload schema，以及 `packages/contracts/src/domain/operations.ts` 的 operator-visible async semantics 为事实源；底层 transport 可以切换，但业务事件术语和 payload 不能再发明第二套。
- Contract-first 约束：不把 Nest DTO、route-local schema 或 service-local shadow type 提升为主事实源；需要框架装饰器时，只能包裹共享 contract。

### 单体优先、服务后拆判据

- 物理拆分之前，bounded context 必须已经在 `backend-core` 或 service assembly 内部具备清晰 owner，而不是只存在于 route 命名。
- 同一业务用例必须能通过 `in-process` 与 `remote` 两套 adapter 访问，而不是把 distributed hop 变成唯一实现面。
- CLI、web-panel 和未来外部 SDK 都继续只面向 gateway；内部服务拆分不得把客户端重新绑定到多个 URL。
- `local-agent` / `team-monolith` 的启动负担不能因为 distributed 目标而上升到必须依赖 MQ、多进程或远端调用。
- 数据 owner、超时/重试/幂等语义、故障边界、观测面必须先文档化，再进入成熟服务拆分。
- 第一批成熟服务样板固定为 `knowledge-write + governance-review`；第二优先级为 `candidate-ingestion + knowledge-write`。

### 证据入口

- `packages/backend-core/src/runtime/capability-model.ts`
- `packages/backend-core/src/runtime/topology.ts`
- `packages/backend-core/src/ports/internal-ports.ts`
- `packages/contracts/src/domain/async.ts`
- `packages/host-local/src/config/host-config.ts`
- `packages/host-distributed/src/config/service-config.ts`
- `docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`

## 关键决策

- [x] 保留 `backend-core` 作为单包，先做模块边界收口，不预拆成多个 `domain-*` 包
- [x] 采用 contract-first 主线统一外部 SDK、internal port 和 event contract，Nest/Fastify 都只是 adapter
- [x] Nest 只负责宿主/transport/DI，领域规则不依赖 Nest
- [x] 默认轻量开发模式仍保留单进程主入口
- [x] 轻后端默认使用 `in-process` invocation，远端 hop 只属于 `distributed`

## 文档回写

- [x] `README.md`
- [x] `docs/README.md`
- [x] `docs/PACKAGES.md`
- [x] `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [x] `docs/reference/REPO_STRUCTURE.md`
- [x] `architecture.md`
- [x] `docs/architecture/ARCHITECTURE.md`

## 最小验证

- [x] `pnpm check:docs-drift`
- [x] `pnpm check:structure`

## 完成定义

- 仓库内不再同时存在两套互相竞争的长期后端叙事。
- 所有后续阶段都能明确落到具体包与具体 owner。
- “轻后端优先，微服务为部署选项”的原则已经冻结，不再回到“先拆服务再补轻模式”。
- 当前 distributed 的定位已经冻结为可验证的成熟度等级，而不是模糊口径。
