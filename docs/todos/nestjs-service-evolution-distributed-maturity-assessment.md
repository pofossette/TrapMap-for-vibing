# NestJS 服务演进 Distributed 成熟度评估

## 角色

- 状态：`completed`
- 目标：对当前 distributed 形态做可追踪成熟度评估，避免后续微服务化只凭主观判断推进

## 当前结论

- 当前 `distributed` 不是“假的微服务”。
- 当前 `distributed` 也不是“成熟完成体微服务”。
- 当前更准确的定位是：`有真实进程边界与真实 HTTP hop 的过渡态分布式架构`。
- Phase 0 冻结评级：`Level 2 / transitional-microservice`。

## 证据快照

| 证据 | 事实源 | 结论 |
|---|---|---|
| gateway 仍是唯一外部入口 | `packages/host-distributed/src/gateway/server.ts`、`packages/host-distributed/src/gateway/routes.ts` | 客户端继续只对统一 gateway 编程，而不是直连内部服务 |
| 已存在独立 service package 与真实进程装配 | `packages/service-*/src/server.ts`、`packages/host-distributed/src/config/service-config.ts` | `distributed` 不是单进程内 mock 出来的“假分布式” |
| 已存在真实内部 HTTP hop | `packages/host-distributed/src/gateway/internal-client.ts`、`packages/host-distributed/src/shared/internal-knowledge-write-client.ts` | `review -> knowledge-write`、`candidate-ingestion -> knowledge-write` 都已有远端委托主线 |
| shared PostgreSQL 仍是主要持久化底座 | `packages/host-distributed/src/shared/database.ts` | 服务真相边界已开始收口，但数据自治尚未完成 |
| acceptance / closeout 已覆盖多进程 hop | `packages/host-distributed/src/gateway/distributed-acceptance.test.ts`、`packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts` | 当前 distributed 具备可验证的运行证据，而不只是口头设计 |
| retrieval 仍是逻辑服务边界，不是独立 runtime binary | `packages/backend-core/src/runtime/topology.ts`、`packages/host-distributed/README.md` | 当前分布式还处在共享宿主与共享基础设施的过渡态，不应夸大为成熟自治服务群 |

## 已具备的成熟度证据

- [x] 对外统一入口：gateway 是唯一外部暴露面
- [x] 存在独立服务进程与独立 service package
- [x] 存在真实跨服务 HTTP 转发与委托，而不是仅在单进程里 mock
- [x] 业务 owner 已有明确方向：`review` / `candidate-ingestion` 通过 `knowledge-write` 完成最终写入
- [x] 已有 acceptance / runtime closeout 测试覆盖真实 distributed hop

## 仍处于过渡态的证据

- [x] 数据 owner 仍未完全独立；当前主要还是 shared PostgreSQL
- [x] 读模型与写模型自治仍未完成
- [x] distributed 运行时仍有 seams / stubs / deferred isolation
- [x] 默认开发主线仍未完全切到新的宿主体系
- [x] 服务间 contract、事件流与故障语义虽已成形，但还不足以宣称完全自治

## 分级标准

### Level 0 `monolith-only`

- 只有单进程主实现
- 没有真实跨进程调用

### Level 1 `split-host`

- 有真实 gateway
- 有独立服务进程
- 有真实 HTTP hop
- 但主要依赖 shared DB 和共享实现面

### Level 2 `transitional-microservice`

- owner 边界明确
- distributed 形态可稳定运行
- 同步/异步 contract 有统一语义
- 但数据自治、投影自治、运维自治仍未完全收口

### Level 3 `service-owned distributed system`

- 服务拥有清晰数据 owner
- 读写投影和事件流明确
- 运行时与故障语义稳定
- 单体与分布式共享同一业务真相，不依赖隐藏共享状态

### Level 4 `mature microservices`

- 服务自治、部署自治、容量治理、故障治理、升级治理都稳定
- 分布式不是“为了拆而拆”，而是已经证明带来独立伸缩和隔离收益

## 当前评级

- [x] 当前评级：`Level 2 / transitional-microservice`
- [x] 未达到 `Level 3`
- [x] 未达到 `Level 4`

## 升级到 Level 3 的前置条件

- [ ] 轻后端默认主线先完成，不再让微服务绑架开发体验
- [ ] internal port 全面支持 `in-process` / `remote` 双 adapter
- [ ] modular monolith 成为唯一主实现面
- [ ] `knowledge-write`、`knowledge-read`、`review`、`candidate-ingestion` 的数据与投影 owner 明确
- [ ] distributed 侧不再依赖隐含共享状态或兼容壳实现
- [ ] 故障恢复、重试、死信、投影 lag、capacity 具备服务 owner 级观测面
- [ ] 至少一组成熟服务样板已经补齐 service README、health/readiness/metrics 和 acceptance closeout

## 第一批成熟服务样板

### 首选样板组

- [x] `knowledge-write + governance-review`
  细则：[`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`](docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md)

### 选择理由

- [x] 这组边界已经有明确业务 owner：`governance-review` 负责治理命令，`knowledge-write` 负责最终聚合写入
- [x] 当前仓库已经存在真实跨服务委托链，能直接作为成熟化样板，而不是从零发明新边界
- [x] 这组最能验证“命令服务不直接改最终聚合，必须委托写服务”的服务自治规则
- [x] 这组覆盖 review/feedback/maintenance/decay 等高风险治理路径，成熟化收益高

### 样板完成标准

- [ ] `governance-review` 不再依赖隐含共享状态完成治理命令
- [ ] `knowledge-write` 对知识写模型、生命周期与最终聚合更新拥有清晰 owner
- [ ] 两者之间的同步命令、失败语义、超时、重试、幂等 contract 已冻结
- [ ] 相关队列 / outbox / workflow 观测面能按服务 owner 解释
- [ ] acceptance / runtime closeout 能证明这组服务不是“shared DB + HTTP 壳”
- [ ] service README、health/readiness/metrics 和 acceptance case 足以支持 operator 判断 owner 边界

### 第二优先级样板组

- [x] `candidate-ingestion + knowledge-write`

### 第二优先级理由

- [x] 这组同样已有明确 publish 边界：`candidate-ingestion` 处理候选事实，最终 publish 通过 `knowledge-write`
- [x] 它能验证异步处理、结果发布、去重与写侧聚合之间的成熟服务边界
- [x] 但它对队列、恢复、回放、重复检测的依赖更强，复杂度高于首选样板组

### 暂不作为第一批样板的组

- [x] `knowledge-read`
  原因：读模型 owner、projection refresh、freshness/invalidation 还需要更完整收口，直接拿它做第一批样板容易把问题扩散到读侧基础设施。
- [x] `identity-access`
  原因：价值明确，但对“成熟服务”样板的代表性不如写侧治理链；更适合在首批样板后补成稳定独立服务。
- [x] `job-runtime`
  原因：它更像横切运行时 owner，适合作为成熟服务群的基础设施收尾，不适合作为第一批业务样板。

### 服务边界冻结

- [x] `gateway` 只承担外部 API、鉴权入口、协议适配，不承载业务真相
- [x] `identity-access` 拥有会话、成员关系、访问控制相关真相
- [x] `knowledge-write` 拥有知识写模型、最终聚合写入与写侧生命周期规则
- [x] `knowledge-read` 拥有读模型、检索投影与 freshness contract
- [x] `candidate-ingestion` 拥有候选处理事实，但最终 publish 必须通过 `knowledge-write`
- [x] `governance-review` 拥有审核/反馈/治理命令，但最终聚合写入必须通过 `knowledge-write`
- [x] `job-runtime` 只拥有队列、outbox、恢复、重试、工作流运行时

## 冻结影响

- Phase 0 之后，`distributed` 可以继续作为“真实但过渡态”的部署选项存在，不再需要在“假微服务”和“成熟微服务”之间来回摇摆。
- 是否允许继续物理拆分，不再看口头印象，而是对照 `Level 2 -> Level 3` 前置条件与样板服务完成标准。
- “gateway + 六个 owner service + runtime worker 展开”是当前 distributed 叙事；不会再把 `service-gateway` 作为当前主线前提。

## 升级到 Level 3 时必须补齐的能力

### 数据与投影 owner

- [ ] 每个服务的主数据 owner 已明确，不再依赖“大家都能直接查共享表”作为默认路径
- [ ] `knowledge-read` 的投影来源、刷新方式、lag 语义和失效策略已冻结
- [ ] 写服务不再直接拼装读侧 projection 返回值，除非文档显式声明
- [ ] shared PostgreSQL 若继续存在，必须是“共享实例 + 明确 schema/table owner”，而不是“共享真相边界”

### 运维与故障治理

- [ ] 每个服务都有独立 health/readiness/ownership 语义
- [ ] 每个服务都有最小 capacity / backlog / retry / dead-letter 观测面
- [ ] 跨服务失败语义、超时、重试、幂等语义保持统一 contract
- [ ] 服务滚动升级、单服务重启、局部故障不会退化成整套系统不可解释
- [ ] outbox / queue / workflow 的 runtime owner 能和业务 owner 分开解释

### 部署与验证

- [ ] 单体与 distributed 共用同一 contract 和业务真相
- [ ] distributed 能证明带来独立伸缩、隔离或运维收益，而不只是多几个进程
- [ ] 存在服务级 acceptance / closeout 证据，而不是只靠单体测试外推

## 升级到 Level 4 的前置条件

- [ ] 服务边界、数据 owner、投影 owner、运维 owner 全部稳定
- [ ] distributed 拆分已经证明有独立容量或隔离收益
- [ ] 单服务故障、回滚、部署、观测都不再依赖隐含人工知识
- [ ] shared-db 依赖如果继续存在，已不再模糊服务真相边界；若需要，已有进一步独立化路线

## 文档回写

- [x] `plan.md`
- [x] `docs/README.md`
- [ ] `docs/operations/TESTING.md`
- [x] `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] 需要时补充到 `docs/architecture/DEPLOYMENT.md`

## 最小验证

- [x] `pnpm check:docs-drift`
- [x] `pnpm check:structure`
- [x] 若调整 maturity 判据涉及 runtime/deployment 事实，补 `pnpm test:deployment-smoke`

## 证据入口

- [`packages/host-distributed/src/gateway/server.ts`](../../packages/host-distributed/src/gateway/server.ts)
- [`packages/host-distributed/src/shared/database.ts`](../../packages/host-distributed/src/shared/database.ts)
- [`packages/host-distributed/src/candidate-ingestion/server.ts`](../../packages/host-distributed/src/candidate-ingestion/server.ts)
- [`packages/host-distributed/src/governance-review/ports.ts`](../../packages/host-distributed/src/governance-review/ports.ts)
- [`packages/service-knowledge-read/src/server.ts`](../../packages/service-knowledge-read/src/server.ts)
- [`packages/host-local/README.md`](../../packages/host-local/README.md)

## 完成定义

- 后续讨论“是否已经是正经微服务”时，不再依赖口头印象。
- 每一轮服务拆分都能对照统一成熟度等级和升级条件做判断。
- “拆成服务”与“拆成成熟服务”的差异已经被明确写成检查项。
- 第一批成熟服务样板组与后续优先级已经冻结，不再每轮重新争论起点。
