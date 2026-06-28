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

- [ ] Wave 2A：盘点 `store_snapshot`、InMemory、PG 双轨的当前角色与退役/保留条件
- [ ] Wave 2B：冻结直接操作 God Object 的入口、迁移波次和 owner
- [ ] Wave 2C：冻结测试矩阵、PG-first 优先域、兼容缓存边界与双写验收口径

### Phase 3 统一适配器范围、目录与接口冻结

- [ ] Wave 3A：冻结统一适配器覆盖范围与 provider taxonomy
- [ ] Wave 3B：冻结 adapter port、provider 实现、host 装配目录与 owner
- [ ] Wave 3C：冻结 repository / adapter / host / gateway client 的边界

### Phase 4 统一适配器环境变量与构建裁剪冻结

- [ ] Wave 4A：冻结 selector env 与 provider-specific env
- [ ] Wave 4B：冻结 `local-agent`、`team-monolith`、`distributed` 推荐组合与 fail-fast / fallback 规则
- [ ] Wave 4C：冻结 `light` / `heavy` target 裁剪与 optional dependency 规则

### Phase 5 Distributed 基线与运行隔离冻结

- [ ] Wave 5A：冻结 distributed 当前过渡态成熟度基线
- [ ] Wave 5B：写清 shared PG、同步 RPC、无 tracing、compose 编排限制的真实现状
- [ ] Wave 5C：明确哪些能力进入 deferred，哪些纳入当前整改主线

### Phase 6 成熟能力与成熟库替换矩阵冻结

- [ ] Wave 6A：冻结 internal client/resilience、tracing/metrics、rate limit/bulkhead 的实施顺序
- [ ] Wave 6B：冻结 cache/invalidation、service discovery、DB budget、health indicator 的引入条件
- [ ] Wave 6C：冻结“优先引入 / 条件成熟后引入 / 暂不替换”的矩阵

### Phase 7 可维护性、测试矩阵与文档真相收口

- [ ] Wave 7A：收口文档状态漂移、contracts 膨胀、历史计划过多的问题
- [ ] Wave 7B：明确 Dockerfile/config 复杂度问题的处理方向或 deferred 落点
- [ ] Wave 7C：关闭本轮未决项或明确 deferred

## 文档回写矩阵

- [x] 根级索引与当前关键路径：[`../../plan.md`](../../plan.md)
- [x] 文档导航与待办入口：[`../README.md`](../README.md)、[`README.md`](README.md)、[`../archived/README.md`](../archived/README.md)
- [x] truth source 当前活跃整改入口：[`../reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md)
- [ ] 目录归属与包职责真相：[`../reference/REPO_STRUCTURE.md`](../reference/REPO_STRUCTURE.md)、[`../PACKAGES.md`](../PACKAGES.md)（仅在存在冲突时更新）
- [ ] distributed、部署、环境、测试细则：待后续阶段按改动范围回写

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
