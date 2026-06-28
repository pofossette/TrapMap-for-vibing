# TrapMap 架构问题整改细则

## 状态

- 状态：`进行中`
- 日期：`2026-06-28`
- 对应根索引：[`../../plan.md`](../../plan.md)
- 本文件角色：当前主线唯一执行细则，承接单一问题池、阶段复选框、冻结边界、文档矩阵、测试矩阵与 deferred 规则

## 目标

- 把 30 个架构问题收口到单一整改主线，避免继续在多份迁移/closeout 文档中并行定义现状与目标态
- 先完成 Phase 0 的盘点冻结与计划归并，再进入后续代码整改
- 把“统一适配器”写成本轮显式整改目标，而不是 `store_snapshot` 迁移的隐含副产物
- 为后续阶段建立统一的关闭条件、文档回写要求、最小验证集合与 deferred 入口

## 总体约束

- 所有复选框都以“结构结论或代码整改 + 测试证据 + 文档回写 + `rtk pnpm check:docs-drift` + `rtk pnpm check:structure`”同时完成为关闭条件
- 根 `plan.md` 只保留目标、阶段索引与当前关键路径；本文件保留执行细节、问题池、冻结边界、历史输入角色、文档矩阵与测试矩阵
- 涉及架构事实冲突时，以 [`../reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md) 和对应源码入口为准
- 不允许再新增与本主题平行的 Phase 文档；新增细化任务应落在本文件对应章节，或转入被本文件直接链接的单一专题文档
- 文档不得把未来态写成当前态；若整改尚未落地，必须明确区分“现状 / 目标 / 过渡态 / deferred”

## Phase 0 已冻结结论

### 单一问题池与治理主题

30 个问题按 5 个治理主题冻结，后续整改不得再以零散点状 patch 重新定义优先级：

| 主题 | 优先级 | 关闭方式 | 覆盖问题 |
|---|---|---|---|
| G1 `server` / `backend-core` / `service-*` / `host-*` 边界收口 | P0 | 代码整改 + 文档回写 | `#1-#10` |
| G2 `store_snapshot`、InMemory、PG-first 现状与迁移口径 | P0 | 代码整改 + 文档回写 | `#11-#16` |
| G3 统一适配器范围、装配边界、环境变量与 target 策略 | P0 | 先冻结文档边界，再分阶段代码整改 | `#17`、`#18`、`#19`、`#21`、`#23`、`#29`、`#30` 中的适配器相关项 |
| G4 distributed 当前过渡态成熟度、运行隔离与 deferred 平台能力 | P1 | 现状冻结 + 部分代码整改 + deferred 条件 | `#20-#24` |
| G5 文档真相、历史计划角色、测试矩阵与可维护性治理 | P0 | 文档冻结 + 守卫/后续代码整改 | `#25-#30` 与跨主题治理项 |

### 30 个问题映射与冻结优先级

| # | 问题 | 治理主题 | 优先级 | Phase 0 关闭方式 |
|---|---|---|---|---|
| `#1` | `packages/server` 兼容壳仍承担主应用事实 | G1 | P0 | 必须代码整改 |
| `#2` | `server` 与 `backend-core` 运行/导入边界断联 | G1 | P0 | 必须代码整改 |
| `#3` | 路由与主业务编排仍滞留 `server` | G1 | P0 | 必须代码整改 |
| `#4` | repository 接口归属不清 | G1 | P0 | 必须代码整改 |
| `#5` | schema / migration owner 不清 | G1 | P0 | 必须代码整改 |
| `#6` | `backend-core` 空心化 | G1 | P0 | 必须代码整改 |
| `#7` | 算法/复杂业务规则留在 compatibility shell | G1 | P0 | 必须代码整改 |
| `#8` | AI/provider/prompt/caching 边界未冻结 | G1 | P0 | 必须代码整改 |
| `#9` | persistence 实现复用路径不清 | G1 | P0 | 必须代码整改 |
| `#10` | `service-*` 包角色与约束不清 | G1 | P0 | 先冻结文档事实，再按需代码整改 |
| `#11` | `store_snapshot` JSONB God Object 风险 | G2 | P0 | 必须代码整改 |
| `#12` | `store.snapshot()` / `store.transact()` 使用面过大 | G2 | P0 | 必须代码整改 |
| `#13` | 运维/管理入口绕过抽象直接触达 God Object | G2 | P0 | 必须代码整改 |
| `#14` | InMemory / PG 双轨语义漂移 | G2 | P0 | 先冻结测试与运行口径，再代码整改 |
| `#15` | `store_snapshot` 退役/保留条件不清 | G2 | P0 | 先冻结文档事实，再代码整改 |
| `#16` | 双写一致性 owner 与验收缺失 | G2 | P0 | 必须代码整改 |
| `#17` | shared PG 隔离不足 | G4 | P1 | 先冻结现状与 deferred 条件 |
| `#18` | 服务发现现状与目标混写 | G4 | P1 | 先冻结现状与非目标 |
| `#19` | 熔断/降级缺失 | G3 | P1 | 先冻结目标归属与 deferred 条件 |
| `#20` | gateway 薄转发定位未写清 | G4 | P1 | 先冻结文档事实 |
| `#21` | 同步 RPC 缺少统一 internal client / retry 保障 | G3 | P1 | 先冻结整改目标，后代码整改 |
| `#22` | 无分布式 tracing 的事实未冻结 | G4 | P1 | 先冻结现状与 deferred 条件 |
| `#23` | queue/outbox 与业务查询共池 | G3 | P1 | 先冻结优先级与边界，后代码整改 |
| `#24` | `docker-compose` 编排限制被误写为成熟编排 | G4 | P1 | 先冻结现状与非目标 |
| `#25` | 文档与代码状态脱节 | G5 | P0 | Phase 0 文档冻结可先关闭 |
| `#26` | contracts 膨胀边界不清 | G5 | P1 | 先冻结问题池，后代码整改 |
| `#27` | 历史计划过多、执行入口并行 | G5 | P0 | Phase 0 文档冻结可先关闭 |
| `#28` | Dockerfile / host 同步风险 | G5 | P1 | 先归入问题池或 deferred |
| `#29` | 配置/target/能力矩阵过度工程 | G3 | P1 | 先冻结优先域与入口判据 |
| `#30` | 测试仍依赖旧路径语义 | G5 | P0 | 先冻结优先域与入口判据 |

### 关闭方式分类

#### 必须通过代码整改关闭

- G1 的核心边界问题：`#1-#9`
- G2 的核心持久化/一致性问题：`#11-#13`、`#16`
- G3 中直接涉及共享 adapter seam 或 internal client 实装的问题：`#21`

#### 允许先通过文档冻结与 deferred 条件关闭 Phase 0

- 角色/边界先行冻结：`#10`、`#14`、`#15`
- distributed 现状、成熟度与平台化问题：`#17-#24`
- 文档、计划、测试矩阵与治理问题：`#25-#30`

## 历史输入角色冻结

以下文档在本轮中不再作为并行执行面，只保留为背景输入或 deferred 落点：

| 文档 | Phase 0 冻结角色 |
|---|---|
| `docs/todos/nestjs-service-evolution-*.md` | 服务演进背景输入，用于解释历史 owner matrix、compatibility shell 退役、distributed 成熟度判断 |
| `docs/todos/backend-build-targets-plan.md` | `host-local` / `host-distributed` / `packages/server` 形态与 build target 背景输入 |
| `docs/todos/backend-engineering-optimization-plan.md` | 平台化 deferred 问题池，承接 MQ 产品化、监控平台、长期服务化与更重的平台工程议题 |
| `docs/todos/robustness-scalability-closeout-plan.md` | 已完成的上一轮 closeout 参考，不再承担当前执行面 |
| `docs/todos/instrumentation-observability-plan.md` | 上一轮 observability 主线背景输入，不再由当前根计划直接跟踪 |

## 本轮非目标冻结

### 本轮整改非目标

- 不直接引入完整服务发现系统
- 不直接引入 K8s 平台化实施
- 不直接做 MQ 产品替换
- 不为“清理文档”而重写全部历史设计，只做入口收口与 truth source 对齐
- 不在一轮内把全部测试改写成 PG-first；先冻结优先域、准入标准与测试入口

### 统一适配器非目标

- 不把 repository、application service、gateway client 混成 mega-adapter
- 不为了 provider 可插拔牺牲当前默认路径清晰度
- 不强迫所有域在第一轮同步迁移

## 当前整改主线的显式目标

- “统一适配器”是本轮架构整改的显式目标之一，服务于基础设施接入边界治理
- 它不是 `store_snapshot` 迁移的副产物，也不是单一 `store_snapshot` 问题的局部修补
- 其实现时机在后续 Phase 3/4，但 Phase 0 已冻结其主线地位与非目标边界

## Deferred 入口冻结

### 进入 deferred 的条件

- 该问题在 Phase 0 只能冻结事实、优先级和非目标，无法在本轮立即通过局部文档或小规模代码变更安全关闭
- 继续推进会引入新的平台级产品决策，超出当前架构整改主线
- 继续推进会把现状与目标态再次混写为“已经完成”

### 当前明确的 deferred 落点

| 议题 | 落点 |
|---|---|
| MQ 产品化、监控平台、更重的平台工程化问题 | `docs/todos/backend-engineering-optimization-plan.md` |
| compatibility shell 进一步退役、owner matrix 历史冻结补充 | `docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md` |
| distributed 成熟度独立审计与升级判据 | `docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md` |
| 历史 closeout 背景、observability/debug 收口背景 | `docs/todos/robustness-scalability-closeout-plan.md`、`docs/todos/instrumentation-observability-plan.md` |

## Phase 索引

### Phase 0 盘点冻结与计划归并

- [x] Wave 0A：把 30 个问题映射为 5 个治理主题并冻结优先级
- [x] Wave 0B：标记哪些问题必须通过代码整改关闭，哪些允许先冻结文档事实与 deferred 条件
- [x] Wave 0C：明确历史文档角色：服务演进背景输入、host/server-shape 背景输入、平台 deferred 问题池
- [x] Wave 0D：冻结本轮非目标：不直接上完整 service discovery、K8s、MQ 替换；不重写全部历史设计；不一轮改写全部 PG-first 测试
- [x] Wave 0E：冻结统一适配器非目标：不做 mega-adapter、不牺牲默认路径清晰度、不强迫全域首轮迁移

### Phase 1 Server / Backend-Core 边界整改

- [x] Wave 1A：收口 `packages/server` compatibility shell 角色与仍滞留主业务的入口
- [x] Wave 1B：冻结 `backend-core`、repository、schema、migration 的 owner 边界与过渡态
- [x] Wave 1C：冻结 `service-*`、`host-*` 与 shared runtime seam 的职责边界
- [x] Wave 1D：补齐对应 truth source、packages 文档与 focused tests

### Phase 1 closure freeze (G1 `#1-#10`)

- `packages/server` 只保留 Fastify compatibility shell 与 shared runtime/status seam。当前仍留在该包内、且需要后续 phase 继续迁移的 primary-business entrypoint，限定为 Fastify 路由/worker 对 `lib/knowledge/`、`lib/candidates/`、`lib/feedback/`、`lib/maintenance/`、`lib/decay/`、`lib/retrieval/`、`lib/ai/` 等 server-owned application/infrastructure module 的兼容调用面；它们不是默认 `light` host 主入口，也不是新的 owner truth。
- `server` 与 `backend-core` 的 closure direction 已冻结为单向内核复用：`backend-core` 提供 host-agnostic runtime capability model、invocation contract、internal ports 与 bounded-context module factory；`packages/server` 仅消费这些运行时/边界定义，不反向作为 `backend-core` 的业务内核或事实源。
- remaining route migration priority 已冻结为：先继续清理仍驻留 `packages/server/src/routes/` 的 owner-sensitive command orchestration，再处理只读 projection / compatibility runtime surface；Phase 1 不把这些剩余路由写成“已经迁完”。
- repository interface target package 继续冻结在 `packages/server/src/lib/*/repository.ts` 与 `packages/server/src/lib/repos/index.ts`。Phase 1 不把 repository contract 提前迁入 `backend-core`；`backend-core` 当前只冻结 cross-owner internal port 和 use-case contract。
- Drizzle schema 与 migration 执行 owner 继续冻结在 `packages/server`：schema truth source 为 `packages/server/src/lib/persistence/schema/index.ts` 及其 domain table modules，migration runtime owner 为 `packages/server/src/lib/persistence/migration-runner.ts` 与 `packages/server/drizzle/`。shared PostgreSQL 仍是过渡态事实，不等于 schema owner 已转移到 `service-*`。
- `packages/backend-core` 当前不是“仅接口”空壳。它承载六个 bounded context 的 module factory、runtime capability model、invocation model、port contract 与 testing utilities；其 closure path 是继续吸收 host-agnostic command/use-case contract，而不是在 Phase 1 新拆 workspace 包。
- high-complexity domain logic 仍在 `packages/server` 的部分，按 layering 先冻结为 server-owned compatibility/application debt：候选处理策略、检索编排、AI provider/prompt/cache wiring、反馈/maintenance/decay 的 operator use case 仍可在 `server` 内存在，但文档必须把它们标记为 compatibility/business debt，而不是默认 host owner。
- AI/provider/prompt/caching boundary 已冻结为 shared infrastructure seam：`packages/server/src/lib/ai/**` 继续拥有 provider config、prompt loading、dynamic context、cache/wrapper 等 concrete adapter；Phase 1 不把这些实现宣称为 `backend-core` contract，也不把 `service-*` 写成各自分叉 provider owner。
- persistence implementation reuse path 已冻结为 host/service 复用 `packages/server` 当前 persistence/repository/runtime infrastructure seam，而不是复制第二套 PG/JSON/queue/outbox implementation。后续 phase 如需抽 shared adapter seam，也必须从这一单一实现面演进。
- `service-*` 只承载 owner-aligned thin assembly：`deps.ts`、`routes.ts`、`server.ts`、`index.ts` 负责把 `backend-core` owner module 暴露给 host。`host-local` / `host-distributed` 负责 transport/DI/process composition；shared runtime seam 仍暂时复用 `packages/server` 的 runtime/status/persistence support，而不是让 service 包直接拥有 bootstrap 或 schema/migration。

### Phase 2 Store Snapshot 现状盘点与迁移口径冻结

- [x] Wave 2A：盘点 `store_snapshot`、InMemory、PG 双轨的当前角色与退役/保留条件
- [x] Wave 2B：冻结直接操作 God Object 的入口、迁移波次和 owner
- [x] Wave 2C：冻结测试矩阵、PG-first 优先域、兼容缓存边界与双写验收口径

### Phase 2 closure freeze (G2 `#11-#16`)

- `store_snapshot` 当前冻结为 PostgreSQL 结构化事实之外的 compatibility JSONB store，而不是新的聚合 owner。它只允许继续承载四类剩余职责：`(1)` InMemory repository fallback 的底层 `StoreData` 载体，`(2)` 明确列名的 operator/admin compatibility mutation，`(3)` startup / recovery / migration / backfill / lifecycle-indexing 对旧快照字段的过渡读写，`(4)` artifact file payload、部分 skill history 与少量 operator projection helper 这类尚无专用 repo capability 的 compatibility cache / payload hydration seam。
- `store_snapshot` JSONB God Object 风险在本轮冻结为显式整改策略，而不是抽象口号：不再接受新的 production primary-read / primary-write owner；任何新增 `store.snapshot()` / `store.transact()` 调用都必须属于 allowlist 中的命名类别并伴随迁移理由；后续 phase 只能通过“新增 repo / projection capability 后收缩 allowlist”来消债，不能再把 route-local snapshot 读写写回主路径。
- PG-first 当前口径冻结为：生产 truth 以 PostgreSQL 结构化表和对应 `repos.*` 为主，身份/审计、knowledge、artifact、candidate、feedback、usage、queue/outbox 等主域都不得再把 `store_snapshot` 写成主事实源。`store_snapshot` 仍可作为兼容缓存或 payload carrier 存在，但不改变 PG owner。与此同时，`routes/teams.ts`、`routes/members.ts`、`routes/access-keys.ts` 这类入口在当前代码库里仍保留 live no-PG / InMemory fallback，因此 Phase 2 冻结的是“PG-primary 行为已成立”，不是“这些路由已经完全脱离兼容回退”。
- InMemory 当前口径冻结为：它不是与 PG 对等的第二套 production owner，而是测试 / 无 PG 本地模式下的 repo-backed fallback。`InMemory*Repository` 继续通过 `SkillShareerStore` 读写 `StoreData`，用来维持 route/repository contract 一致性；它的 owner 是 compatibility/testing posture，而不是长期双轨演进目标。对仍保留 no-PG 回退的 teams / members / access-keys 路由，这一 fallback 仍是现状，而不是已退役路径。
- remaining direct God Object entrypoints 已冻结为以下 owner 桶，不再笼统称作“少量遗留”：`routes/teams.ts`、`routes/members.ts`、`routes/access-keys.ts`、`routes/knowledge.ts`、`routes/evidence.ts`、`routes/maintenance.ts`、`routes/admin-boundary-search.ts`、`routes/admin-benchmark.ts`、`routes/feedback-admin.ts`、`routes/operations/{artifacts-export,artifacts-activate,artifacts-import,skill-edit,skill-review,knowledge-legacy,migrate}.ts`，以及 `bootstrap/bootstrap-candidate-recovery.ts`、`lib/operations/read-model.ts`、`lib/jobs/handlers/{knowledge-index-follow-up,skill-index-follow-up,remediation-reactivation}.ts`、`lib/jobs/skill-index-follow-up.ts`、`lib/session.ts`、`lib/knowledge/review-application-service.ts`。其中 teams / members / access-keys 仍属于 PG-primary 但兼容回退未完全收口的 inventory，不能被二级文档写成“已迁完”。
- direct-entry migration waves 已冻结为：Wave A 先补 repo / projection capability，消除只因 `artifactFilePayloads`、skill history、maintenance list、operator projection 缺口导致的 snapshot 读取；Wave B 再清理 compatibility shell 中仍直接写 `store.transact()` 的 operator/admin routes；Wave C 最后处理 startup recovery、indexing subscriber、legacy application-service seam 与 session fallback。Phase 2 只冻结次序和 owner，不提前做 Phase 3+ adapter 重构。
- owner posture 已冻结为：`packages/server` 继续拥有当前 `store_snapshot` schema、JsonStore/PostgresStore compatibility seam、InMemory repository fallback 与 snapshot allowlist guard；各 bounded-context service / `backend-core` 当前不直接拥有新的 snapshot adapter。若后续要删除某个 compatibility entrypoint，必须先由对应 repo、projection helper 或 owner service 提供替代 capability。
- `store_snapshot` retention / deletion 条件当前冻结为显式 gate，而不是“未来会删”：只有当某一剩余字段或调用面满足“所有生产路由/worker/startup path 已改走 repo 或专用 projection capability、focused tests 已迁移、truth docs 已回写、allowlist 已收缩”四项时，才允许删除对应快照字段或调用面。只要 `artifactFilePayloads` hydration、skill history full-data read、startup candidate recovery、legacy migration/backfill 仍依赖快照，`store_snapshot` 整体就仍处于 retained compatibility 状态。
- dual-write acceptance 事实冻结为“主域长期双写已结束，剩余仅是结构化 truth + JSONB compatibility cache synchronization”。当前允许的同步语义集中在 artifact/knowledge 等仓库内部的 structured-table write plus compatibility cache maintenance，以及 operator/import/migrate 路由对 `artifactFilePayloads` 等兼容载体的补写；这不是新的并行 owner。验收关注点是 cache/payload 与结构化真相不漂移，而不是重新引入 `DualWrite*Repository`。
- compatibility-cache boundary 当前冻结为：当结构化真表与 JSONB 兼容缓存同时存在时，读取优先级始终以结构化 truth 为准，JSONB 只在专用 payload / history / fallback seam 中兜底。`artifactFilePayloads`、旧 skill history 读取、maintenance/operation projection helper、startup recovery 所见的 compatibility snapshot 都属于这一边界。
- Phase 2 test matrix 当前冻结为：`snapshot-usage-guard.test.ts` 负责守住 allowlist 和禁止新增未命名调用；`pg-first-compat.test.ts` 负责证明 auth/member/access-key 等 PG-first API contract 在 InMemory fallback 下仍一致；`docs-truth-smoke.test.ts` 负责保证 remediation/truth/package/testing docs 对上述事实的引用不漂移。更广的 runtime/deployment 验证留给后续 phase，只在真正触边界时补跑。

### Phase 3 统一适配器范围、目录与接口冻结

- [x] Wave 3A：冻结统一适配器覆盖范围与 provider taxonomy
- [x] Wave 3B：冻结 adapter port、provider 实现、host 装配目录与 owner
- [x] Wave 3C：冻结 repository / adapter / host / gateway client 的边界

### Phase 3 closure freeze (G3 `#17` `#18` `#19` `#21` `#23` `#29` `#30` adapter scope)

- Phase 3 在当前轮次冻结的是 unified adapter 的边界与 taxonomy，不是把现有 host、gateway、repository、application service 全部抽成一个“统一 mega-adapter”。统一适配器的 scope 只覆盖 infrastructure/provider seam：例如 provider registry、remote/in-process port adapter、thin transport helper、以及把 transport error 映射回 port 语义的 remote client wrapper。repository、application service、gateway route/controller、host composition 仍各自保留 owner。
- provider taxonomy 已冻结为“contract 在 `backend-core`，concrete provider implementation 继续留在当前 owner package”。`packages/backend-core` 只拥有 port contracts、invocation model 和 host-agnostic invocation semantics；它不拥有 AI/provider/indexing 的 concrete implementation，也不在本 phase 新建共享 provider workspace 包。
- host-owned adapter selection seam 已冻结在 host assembly。当前 `packages/host-local/src/nest/adapters/adapter-factory.ts` 与同目录下的 in-process / remote adapter 构成 `light` host 的选择面；文档必须把它写成 host-owned adapter selection seam，而不是把选择责任下推到 business code、repository 或 `backend-core`。
- `packages/host-local/src/nest/adapters/` 当前只承载 port adapter seam：它解决同一个 `KnowledgeReadPort` 在 in-process direct invocation 与 remote invocation 之间的切换。它不是 repository adapter 目录，也不是 provider registry 总入口，更不是“所有边界都统一塞进 adapter”的证明。
- `packages/host-distributed/src/gateway/internal-client.ts` 冻结为 distributed gateway forwarding 的 thin transport helper / canonical error normalization seam。它负责内部 HTTP hop、request/trace header 透传和 canonical error body 归一化，但不升级为 repository adapter、domain orchestrator 或 host composition root。
- `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` 冻结为 remote port client wrapper 示例：它消费 gateway internal client，负责把 transport/body error 映射回 `InvocationError` 与 `KnowledgeWritePort` 语义。Phase 3 要冻结的是这种 wrapper owner 和职责，不是把它误写成 repository seam。
- `packages/server/src/lib/ai/**` 与 `packages/server/src/lib/indexing/adapters/**` 在当前 phase 继续是 server-owned concrete infrastructure/provider implementation。Phase 3 冻结的是 taxonomy 和 owner：这些 concrete provider seam 仍归 `packages/server`，并未在本轮抽成新的 shared workspace package。
- gateway client、remote adapter 与 repository adapter 的边界已经冻结为三件不同的事：gateway client 负责跨进程 transport；remote adapter 负责把 port 调用桥接到 transport；repository / persistence seam 继续留在 repo-owned boundary。文档不得把 gateway client 或 remote adapter 改写成 repository adapter，也不得把 repository seam 混入 unified adapter 口径。
- `packages/host-local/src/nest/runtime/shared-infra.ts` 借用 `packages/server` 的 shared infra helpers 这一事实，只证明当前存在 transitional shared infrastructure seam；它不是 `packages/server` 仍是默认 host owner 的证据。默认 `light` host owner 仍冻结在 `packages/host-local/src/nest/**`，而 shared-infra 借用只是过渡态基础设施复用。
- Phase 3 minimum verification matrix 已冻结为 focused docs/truth checks：`rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`。只有在后续 phase 真正改动 adapter runtime behavior、internal client transport semantics 或 host assembly wiring 时，才补更广的 runtime/deployment tests。

### Phase 4 统一适配器环境变量与构建裁剪冻结

- [x] Wave 4A：冻结 selector env 与 provider-specific env
- [x] Wave 4B：冻结 `local-agent`、`team-monolith`、`distributed` 推荐组合与 fail-fast / fallback 规则
- [x] Wave 4C：冻结 `light` / `heavy` target 裁剪与 optional dependency 规则

### Phase 4 closure freeze (G3 env / target matrix)

- Phase 4 冻结的是 adapter env / target-pruning 的文档与 truth-source 边界，不是 runtime refactor。selector env truth 继续以 `TRAPMAP_DEPLOYMENT_PROFILE`、`TRAPMAP_DEPLOYMENT_PRESET` 与 `TRAPMAP_TASK_TRANSPORT` 为中心；它们定义 deployment/profile/preset/task-transport 的主选择面，不能再被 secondary docs 改写成新的 mega-config taxonomy。
- provider-specific env 继续留在 owner seam，而不是收口成通用“大一统 provider taxonomy”。当前代码事实包括：AI provider env 仍以 `AI_PROVIDER`、`OPENAI_API_KEY`、`GEMINI_API_KEY` 等 server/shared runtime 配置为准；distributed internal service URL env 仍以 `TRAPMAP_GATEWAY_URL`、`TRAPMAP_IDENTITY_ACCESS_URL`、`TRAPMAP_KNOWLEDGE_READ_URL`、`TRAPMAP_KNOWLEDGE_WRITE_URL`、`TRAPMAP_CANDIDATE_INGESTION_URL`、`TRAPMAP_GOVERNANCE_REVIEW_URL`、`TRAPMAP_JOB_RUNTIME_URL` 为当前 owner-specific seam。
- 推荐组合在本 phase 明确冻结为三档，不再让 follow-up docs 重新发明矩阵：`local-agent` -> `light`，保持 in-process/internal defaults 与 `json-store-ok` posture；`team-monolith` -> `light`，保持 `postgres-required` + `gateway-core` + `split-owned` async posture；`distributed` -> `heavy`，保持 service/gateway split 与 `remote-expected` async posture。
- fail-fast / fallback 规则必须区分当前允许的回退与被禁止的歧义：`rabbitmq` 需要 RabbitMQ config，缺 `TRAPMAP_RABBITMQ_URL` 时应 fail-fast；`distributed` 需要 PostgreSQL，缺 `TRAPMAP_DATABASE_URL` / `DATABASE_URL` 时只能报告冲突/缺口，不得写成仍支持 JSON-store runtime；`local-agent` 当前仍允许 `json-store-ok`；internal service URLs 在 `in-process` mode 下继续视为 ignored config，而不是必填依赖。
- target-pruning posture 当前只冻结为文档边界：`light` 与 `heavy` 是 build/deployment targets，不是新增 runtime profiles；optional dependency、tree-shaking、target 裁剪规则当前只可描述为既有 intent 与 non-goals。除非源码已经证明，否则文档不得宣称已存在 fully automated package-pruning / optional-dependency elimination。
- Phase 4 minimum verification matrix 冻结为 focused docs/truth checks：`rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`。只有这些检查通过、且结果已记录到 phase report 后，Wave 4A-4C 才允许勾选关闭。

### Phase 5 Distributed 基线与运行隔离冻结

- [x] Wave 5A：冻结 distributed 当前过渡态成熟度基线
- [x] Wave 5B：写清 shared PG、同步 RPC、无 tracing、compose 编排限制的真实现状
- [x] Wave 5C：明确哪些能力进入 deferred，哪些纳入当前整改主线

### Phase 5 closure freeze (G4 distributed baseline)

- Phase 5 冻结的是 distributed baseline / runtime-isolation 的 truth-source 边界，不是 runtime refactor。当前 distributed 成熟度基线继续明确冻结为 `Level 2 / transitional-microservice`；后续文档不得把它改写成“假的分布式”，也不得提前写成成熟自治服务群。
- distributed 当前已是“真实分布式”，不是单进程内 mock：gateway 继续是唯一外部入口，`packages/service-*` 与 `packages/host-distributed` 继续提供真实 service process 装配，gateway 到 owner service / runtime service 之间继续存在真实内部 HTTP hop。
- distributed 当前仍不是成熟的 service-autonomous system。shared PostgreSQL 继续是主要持久化底座；retrieval 当前仍主要是逻辑服务边界而不是独立 runtime binary；部分 shared infra、queue/outbox、auth/session、runtime seam 仍处于过渡复用状态，不能被写成每个服务已经完全自治。
- runtime-isolation 现状必须按当前证据描述：内部同步 RPC 已存在，但统一 resilience、全链路 tracing、service-owned persistence budget、独立 platform isolation 仍未在本 phase 落地；当前只允许把这些写成 deferred capability，而不是 current-state claim。
- compose/runtime wording 继续冻结为“真实当前拓扑而非成熟编排”：`docker-compose.yml` 当前证明的是 gateway + 多个 service/worker 进程可运行、`distributed` profile 真实展开、并通过 env 指向 shared runtime substrate；它不是 service discovery、K8s orchestration、mesh、per-service autonomous deployment 的证据。
- deferred boundary 必须显式保留：service discovery、K8s/platformization、per-service database、成熟 observability/tracing、以及更强 autonomy / isolation claim 继续留在 deferred 路径，而不是在 distributed baseline 文案中被隐含为当前已具备。
- Phase 5 minimum verification matrix 冻结为 focused docs/truth checks：`rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`。只有 closure freeze 文本、truth source / packages / deployment / testing 回写和这三条 focused checks 的实际结果都完成记录后，Wave 5A-5C 才允许关闭。

### Phase 6 成熟能力与成熟库替换矩阵冻结

- [x] Wave 6A：冻结 `internal client + resilience` 与 `tracing + metrics` 的实施顺序
- [x] Wave 6B：冻结 `rate limiting + bulkhead / 背压` 的实施顺序
- [x] Wave 6C：冻结 `cache + invalidation`、`service discovery`、`DB budget / PgBouncer`、`health indicator` 的引入条件
- [x] Wave 6D：冻结“优先引成熟库 / 条件成熟后引入 / 暂不替换”的矩阵
- [x] Wave 6E：明确 `light` / `heavy` 下的不同默认策略
- [x] Wave 6F：统一 graph runtime 配置入口，明确 `server` compatibility shell、`host-local` 和 distributed 下 graph provider / readiness / fail-open 行为是否一致

### Phase 6 closure freeze (G4 mature-capability / library-replacement freeze)

- Phase 6 冻结的是 mature-capability / library-replacement 的 truth-source 边界，不是 runtime refactor。`internal client + resilience` 当前已经是主线 shared runtime seam：`packages/host-distributed/src/gateway/internal-client.ts` 负责 internal HTTP forwarding / canonical error normalization，`packages/server/src/lib/runtime/resilience.ts` 与 `packages/server/src/lib/runtime/metrics.ts` 负责当前 timeout / retry / degraded 统计语义；但这还不能被写成“已具备完整 mature-service platform stack”。
- `tracing + metrics` 的当前真相必须限制在现有 request/trace headers、runtime metrics snapshot、operator 可见的 summary surface、以及已冻结的低基数 label 规则。当前没有证据支持把这层写成完整 distributed tracing、外部 observability platform、或 per-service telemetry backend 已落地；这些都继续属于 deferred capability。
- `rate limiting + bulkhead / 背压` 当前不是 built-in runtime default。虽然 `packages/server/src/config.ts` 仍有 `rateLimitMaxPerMinute` 这一 compatibility config seam，但 Phase 6 冻结的是“后续 ordered follow-up capability”，不是“系统已经默认具备 gateway/service bulkhead、adaptive backpressure 或 platform-wide rate policy”。
- `cache + invalidation` 当前已经有真实 operator/testing surface，但其事实边界必须收窄为“derived cache + invalidation seam”：`lib/cache/invalidation.ts`、retrieval read-model cache、intent cache、`/v1/operations/status/async` 与 stats summary 证明当前存在 cache freshness / invalidation contract；它们不是 service-autonomous remote cache infrastructure、也不是宣称每个 service 已拥有独立 cache substrate 的依据。
- `service discovery`、`DB budget / PgBouncer`、以及 richer `health indicator` rollout rules 当前都只能冻结为 adoption condition / deferred capability gate。distributed 仍以 checked-in URL env 和 shared PostgreSQL 为当前证据；pool budget / PgBouncer 只存在 operator/capacity follow-up 背景，不是 runtime default；`/health`、`/ready`、`/internal/readiness` 继续是现有 readiness surface，但 richer indicator policy 仍不能被写成当前平台 guarantee。
- “优先引成熟库 / 条件成熟后引入 / 暂不替换”的矩阵在本 phase 冻结为文档边界，而不是立即替换实现：当前优先复用既有 internal client、shared resilience helper、runtime metrics snapshot、cache invalidation seam；只有当真实吞吐、独立故障域、外部 telemetry / discovery / pool-governance 需求持续存在时，才进入条件成熟后引库；而 service discovery platform、PgBouncer rollout、完整 distributed tracing/backend、以及 service-autonomous remote cache 继续属于暂不替换或 deferred。
- `light` 与 `heavy` 的默认策略姿态必须区分，但不得发明新 runtime 行为：`light` 当前仍以 host-local、in-process 默认、较少 remote dependency、`local-agent` 的 `json-store-ok` 与 `team-monolith` 的 `postgres-required` posture 为主；`heavy` 当前以 distributed、gateway + internal HTTP hop、shared PostgreSQL、remote-expected async posture 为主，因此更接近后续 mature capability 的 adoption front。Phase 6 只冻结“不同默认姿态”，不是宣称 `heavy` 已自动带来 resilience / discovery / bulkhead / tracing platform 默认值。
- `graph runtime` 配置入口必须按当前证据冻结：同一组 `TRAPMAP_GRAPH_DB_*` env family 今天由 `packages/server/src/config.ts` / `lib/graph-query/config.ts` 解析，`TRAPMAP_GRAPH_DB_FAIL_OPEN` 与 runtime readiness/metrics 已有 shared truth；但主文档不能把 `server` compatibility shell、`host-local` default mainline、distributed profile、以及 worker-status surface 写成“graph behavior perfectly identical”。当前代码只证明它们共享同一 env family 和部分 shared consumer seam，同时对 worker-status + graph-enabled 组合保留 conflict warning。
- Phase 6 minimum verification matrix 冻结为 focused docs/truth checks：`rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`。只有 closure freeze 文本、truth source / packages / environment / testing 回写和这三条 focused checks 的实际结果都完成记录后，Wave 6A-6F 才允许关闭。

### Phase 7 可维护性、测试矩阵与文档真相收口

- [x] Wave 7A：收口文档状态漂移、contracts 膨胀、历史计划过多的问题
- [x] Wave 7B：明确 Dockerfile/config 复杂度问题的处理方向或 deferred 落点
- [x] Wave 7C：关闭本轮未决项或明确 deferred

### Phase 7 closure freeze (G5 maintainability / CI-testing truth / docs closeout)

- Phase 7 冻结的是 maintainability / CI-testing truth / documentation closeout，不引入 runtime refactor。The current active execution surface remains only `plan.md` + `docs/todos/trapmap-architecture-remediation-plan.md`；历史计划、历史 closeout、以及背景/专题文档都不得再被描述成与当前根计划并行的 active execution surface。
- Historical todo docs may remain as background/deferred references。`docs/todos/backend-engineering-optimization-plan.md`、`docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`、`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`、`docs/todos/robustness-scalability-closeout-plan.md`、`docs/todos/instrumentation-observability-plan.md` 等文档，必须被描述为历史背景、deferred 落点或已完成 closeout 参考，而不是仍由当前根计划并行拥有的 checklist。
- CI/testing truth 当前冻结为实际文件与脚本面：CI authoritative source 是 `.github/workflows/ci.yml`，workspace command truth 是 `package.json` scripts。文档引用 CI 或测试命令时，必须以 `pnpm run ci`、`pnpm eval:smoke`、`pnpm eval:ci`、`pnpm eval:ci:core` 的当前脚本语义为准，而不是旧命名、旧 tier 入口或手写替代表述。
- eval command semantics 当前冻结为：`pnpm eval:smoke` 运行 smoke tier 的统一 eval 聚合器；`pnpm eval:ci` 运行 CI baseline-aware eval runner 的默认 smoke tier；`pnpm eval:ci:core` 运行同一 CI runner 的 core tier 入口；这些命令之间可以有实现复用，但 secondary docs 不得把 `pnpm eval:ci:core` 改写成别的用户面命令，也不得把 `pnpm eval:smoke` 写成 CI baseline 对比命令。
- CI job truth 必须匹配当前 `.github/workflows/ci.yml`：所有 documented CI jobs 运行在 Node `24` + pnpm `10.33.0`；`architecture-guardrails` job 当前运行 `pnpm check:docs-drift`、`pnpm check:mermaid`、`pnpm check:complexity`；`doc-rules` job 当前运行 `pnpm check:docs-drift`、`pnpm check:mermaid`、`pnpm check:structure`；`postgres-integration` 继续以 `pgvector/pgvector:pg16` service container 验证 PG integration slice。文档不得再写 Node `20` 或省略当前 job coverage。
- Dockerfile / config maintainability topic 在本 phase 的冻结方式是“truth + deferred landing spot”，不是新增平台重构 claim。`packages/host-local/Dockerfile`、`packages/host-distributed/Dockerfile`、compose profile、以及 config surface 的同步风险继续作为维护性 guard topic 记录，但更重的平台化、镜像矩阵收敛、service discovery、K8s、独立 deployment shape 与 monitoring platform 仍进入既有 deferred 落点，而不是留成模糊的“later”。
- deferred platform topics 的 landing spot 在本 phase 明确冻结：MQ 产品化、监控平台、长期服务化与更重的平台工程议题继续落在 `docs/todos/backend-engineering-optimization-plan.md`；compatibility shell 进一步退役与 owner matrix 历史补充继续落在 `docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`；distributed 成熟度独立审计继续落在 `docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`；observability / debug closeout 背景继续保留在 `docs/todos/robustness-scalability-closeout-plan.md` 与 `docs/todos/instrumentation-observability-plan.md`。Phase 7 不允许再把这些写成未指定落点的“后续再看”。
- guardrail scope 在本 phase 只冻结当前代码已可验证的 truth：`scripts/complexity-budgets.json` 与 `packages/server/src/__tests__/docs-truth-smoke.test.ts` 应覆盖 current active-remediation entry、todos/archived index truth、以及 eval/CI command drift 的高风险表述；但它们不得 invent 未由 `.github/workflows/ci.yml`、`package.json`、`scripts/check-doc-drift.ts`、`scripts/check-structure.mjs` 实际 enforce 的新行为。
- Wave 7A-7C 只有在本 closure freeze、truth-source/docs 回写、guardrail 更新，以及 `rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`、`rtk pnpm eval:smoke` 四条 focused validations 的实际结果全部记录后，才允许勾选完成。

## 文档回写矩阵

- [x] 根级索引与当前关键路径：[`../../plan.md`](../../plan.md)
- [x] 文档导航与待办入口：[`../README.md`](../README.md)、[`README.md`](README.md)、[`../archived/README.md`](../archived/README.md)
- [x] truth source 当前活跃整改入口：[`../reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md)
- [ ] 目录归属与包职责真相：[`../reference/REPO_STRUCTURE.md`](../reference/REPO_STRUCTURE.md)、[`../PACKAGES.md`](../PACKAGES.md)（仅在存在冲突时更新）
- [x] distributed、部署、环境、测试细则：已按 Phase 4 env / target freeze 回写

## 测试矩阵

### Phase 0 最小验证

- [x] `rtk pnpm check:docs-drift`
- [x] `rtk pnpm check:structure`

### 后续阶段追加验证规则

- 仅调整计划/索引文档：至少运行 `rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`
- 涉及 contracts、共享类型、导出边界：补 `rtk pnpm typecheck` 与受影响包最小测试
- 涉及 `server`、`backend-core`、`service-*`、`host-*`、runtime 或 distributed 边界：补受影响包 focused tests，必要时补 `rtk pnpm test:runtime-foundations` 与 `rtk pnpm test:deployment-smoke`
- 涉及 retrieval、governance、feedback、fixtures、eval runner：相关包测试外，至少补 `rtk pnpm eval:smoke`

## Phase 0 完成定义

- [x] 单一问题池与优先级已冻结
- [x] 哪些问题必须代码整改、哪些允许先冻结事实与 deferred 条件已写清
- [x] 根 `plan.md` 与当前唯一活跃细则入口已对齐
- [x] 历史输入角色与 deferred 入口已写清
- [x] “统一适配器”已写成本轮显式目标，而不是 `store_snapshot` 迁移副产物
- [x] 文档入口与 truth source 不再把旧 closeout 或历史服务演进文档写成当前执行面
