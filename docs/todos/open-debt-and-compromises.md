# 长期工程债务与平台成熟度登记

> **角色：** 受根 [`../../plan.md`](../../plan.md) 明确管理的长期问题登记册。
> **状态：** `deferred`；不构成第二条 active mainline，不承载当前 tranche 的实施顺序。

## 使用规则

- 每项记录必须包含来源、影响、当前边界、进入条件和后续落点；未验证的扫描信号不得描述为已确认缺陷。
- 当前主线只处理与可观测性、shared PG owner、投影和服务级运维直接相关且可在本轮验证的事项。
- 任一项满足进入条件时，创建新的 active detail 并由根 `plan.md` 替换当前主线链接；不得在本文件直接启动并行实施。
- 关闭一项时记录实际变更、最小验证和权威文档回写；只剩历史价值时归档到 `docs/archived/archived-plans/`。

## 长期问题池

### 兼容层债务持续存在

- [ ] **来源：** `packages/server` 仍是 Fastify compatibility shell 与大量 shared implementation surface；`packages/runtime-infra` 仍通过 shared store/repository/async seam 复用 server 基础设施。
- [ ] **设计输入：** [`../superpowers/specs/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership-design.md`](../superpowers/specs/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership-design.md) 定义一次性移除 compatibility shell、`runtime-infra` 和 `store_snapshot` 的 owner-local 目标架构；在本主线归档前它仅是 deferred 参考，不构成 active 执行授权。
- [ ] **实施参考：** [`../superpowers/plans/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership.md`](../superpowers/plans/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership.md) 将该退役拆分为 owner migration、六个领域迁移、host cutover、snapshot backfill 与最终删除 wave；在根 `plan.md` 切换前不得执行。
- [ ] **影响：** host 和 service 对迁移期实现面的依赖会扩大改动影响范围，`server-compatibility-seam` 指标归因也无法代表最终服务 owner。
- [ ] **当前边界：** 不重开旧 Fastify authoritative write path；不新增 `store_snapshot`、shared DB direct-read 或 runtime-infra -> server 依赖作为默认业务路径。
- [ ] **进入条件：** 当前主线的 Tranche 6/7 已完成，或 runtime-infra/server seam 导致明确的故障归因、边界违规或重复实现回归。
- [ ] **后续落点：** 新建“compatibility shell retirement and runtime-infra ownership”细则；按 service/host 迁移真实 owner 后删除旧 route、re-export 和 compatibility fallback。
- [ ] **要求的文档与测试：** 更新 `docs/architecture/BOUNDARIES.md`、`docs/reference/REPO_STRUCTURE.md`、相关 package README；运行受影响包测试、`rtk pnpm exec fallow list --boundaries`、`rtk pnpm exec fallow audit --base main`、`rtk pnpm typecheck`、`rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`。

### 工程维护信号偏高

- [ ] **来源：** 2026-07-10 历史基线记录 `394` 个静态维护问题、`302` 个超过阈值的函数、约 `19.16%` 重复行；主要是 unused exports/types、复杂热点和测试 helper/route wrapper 重复。
- [ ] **影响：** 维护成本和回归面偏高，但这些聚合数量不是单个功能缺陷，不能据此触发无范围的全仓重构。
- [ ] **当前边界：** 当前改动只修复 changed-code risk 或直接阻塞的热点；不为压低全局数字引入大规模抽象、删除公共 API 或修改行为。
- [ ] **进入条件：** 重新运行 fallow 后，某个 hotspot、重复组或 unused export 已与生产故障、边界违规、构建时间/包体积问题或连续三次相关变更相关联。
- [ ] **后续落点：** 新建 scoped maintenance tranche，以一个 package、一个 import boundary 或一组明确模块为单位处理。
- [ ] **要求的文档与测试：** 先记录新的 `fallow` baseline、目标文件和行为不变边界；运行模块 focused tests、`rtk pnpm exec fallow audit --base main`、对应 typecheck，并在架构边界变化时回写 `docs/architecture/BOUNDARIES.md`。

### 平台化与服务自治尚未成熟

- [ ] **来源：** `distributed` 有真实服务进程和内部 HTTP hop，但当前成熟度仍为 `Level 2 / transitional-microservice`；服务发现默认值是显式 URL + Docker DNS，资源/autoscaling 示例未成为 checked-in 默认资产。
- [ ] **影响：** 还不能可靠宣称独立扩缩容、局部故障隔离、滚动升级和服务自治的实际收益。
- [ ] **当前边界：** 不将 Kubernetes、service mesh、动态注册中心、MQ 产品化、mTLS 或完整监控平台写为当前默认部署能力。
- [ ] **进入条件：** Tranche 7 的服务级健康、异步诊断与样板 acceptance 完成后，已有容量/隔离需求或真实运行事故证明静态 DNS 与现有 compose 运行面不足。
- [ ] **后续落点：** 新建 platformization 细则，先冻结一个具体部署目标和 operator SLO，再选择服务发现、队列、资源限制或编排能力。
- [ ] **要求的文档与测试：** 更新 `docs/architecture/DEPLOYMENT.md`、`docs/architecture/SERVICE-DISCOVERY.md`、`docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`；运行 deployment/distributed closeout、配置解析测试和文档守卫。

### 物理数据隔离与 PgBouncer 采用条件

- [ ] **来源：** 当前 shared PostgreSQL 已按 table owner 和 outbox 约束，但 pool budget 仍是服务级配置 seam，不是完整的连接容量治理或数据库物理隔离。
- [ ] **影响：** 当某个领域的连接、热点、备份保留、安全合规或恢复目标明显不同，shared instance 会成为独立扩缩容和隔离的上限。
- [ ] **当前边界：** 不引入跨服务事务、XA/2PC，亦不以 database-per-service 或 PgBouncer 作为当前主线的关闭条件。
- [ ] **进入条件：** 某服务存在稳定 DB 热点、独立备份/保留或合规需求、连接预算耗尽，或共享实例持续造成跨服务干扰；必须先具备 Tranche 6 的 owner/migration/projection 证据。
- [ ] **后续落点：** 新建“selective database isolation”细则，按一个 owner service 设计迁移、回填、双读/切换、outbox 兼容、回滚与容量验证。
- [ ] **要求的文档与测试：** 更新 `docs/architecture/DATABASE_OWNERSHIP.md`、`docs/architecture/components/PERSISTENCE.md`、`docs/reference/DATA_MODEL.md`、`docs/operations/ENVIRONMENT.md`；运行迁移/repository focused tests、distributed acceptance、容量验证、`rtk pnpm typecheck` 与文档守卫。

### 安全候选与文档事实校准

- [ ] **来源：** 历史静态扫描保留安全候选，尚未经过 reachability 和数据流人工确认；服务发现说明也曾出现 optional overlay 被误写成必需依赖的风险。
- [ ] **影响：** 未经确认的候选可能掩盖真实安全优先级，文档漂移则会误导部署和故障处置。
- [ ] **当前边界：** 不把 advisory 扫描结果描述为已确认漏洞；不因文档校准改变运行时语义。
- [ ] **进入条件：** 候选可从外部输入到达危险 sink，或 `SYSTEM_TRUTH_SOURCES.md` 与具体 config/source 再次出现事实冲突。
- [ ] **后续落点：** 安全候选进入 verify-before-action 安全细则；文档事实冲突进入最小 doc-alignment 修复。
- [ ] **要求的文档与测试：** 安全项先补可复现测试和数据流证据，再修复及更新 `docs/operations/SECURITY.md`；文档项以权威源码为准更新 reference/architecture 文档并运行 `rtk pnpm check:docs-drift`、`rtk pnpm check:structure`。

## 审核检查表

- [ ] 每次新问题录入都标注来源、影响、分类、证据和进入条件。
- [ ] 每次主线 closeout 前确认没有把 deferred 项误标为已交付能力。
- [ ] 每次将事项提升为 active mainline 前，在根 `plan.md` 明确替换当前细则链接，并在 `docs/todos/README.md` 同步状态。
