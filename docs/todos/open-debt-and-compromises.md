# 长期工程债务与平台成熟度登记

> **角色：** 受根 [`../../plan.md`](../../plan.md) 明确管理的长期问题登记册。
> **状态：** `deferred`；不构成第二条 active mainline，不承载当前 tranche 的实施顺序。

## 使用规则

- 每项记录必须包含来源、影响、当前边界、进入条件和后续落点；未验证的扫描信号不得描述为已确认缺陷。
- 当前 active mainline 只处理 documentation validation and observability platform；本登记册不能自行授权任何其他实施。
- 任一项满足进入条件时，创建新的 active detail 并由根 `plan.md` 显式链接；不得在本文件直接启动并行实施。
- 关闭一项时记录实际变更、最小验证和权威文档回写；只剩历史价值时归档到 `docs/archived/archived-plans/`。

## 长期问题池

### 兼容层债务持续存在

- [ ] **当前状态：** 原 active detail 已归档为 [`../archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`](../archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md)；其 Wave-10 package retirement 未完成，当前不构成本主线的隐含任务。
- [ ] **来源：** 历史细则记录 `packages/server` package retirement、根依赖和 Docker/package compatibility reference 的剩余关闭项；现行 active docs 不得将已退役路径写为当前事实。
- [ ] **设计输入：** [`../superpowers/specs/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership-design.md`](../superpowers/specs/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership-design.md) 定义一次性移除 compatibility shell、`runtime-infra` 和 `store_snapshot` 的 owner-local 目标架构；在根 `plan.md` 显式激活前它仅是 deferred 参考，不构成 active 执行授权。
- [ ] **实施参考：** [`../superpowers/plans/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership.md`](../superpowers/plans/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership.md) 将该退役拆分为 owner migration、六个领域迁移、host cutover、snapshot backfill 与最终删除 wave；执行 evidence 仅回写 active detail。
- [ ] **影响：** host 和 service 对迁移期实现面的依赖会扩大改动影响范围，`server-compatibility-seam` 指标归因也无法代表最终服务 owner。
- [ ] **当前边界：** 不重开旧 Fastify authoritative write path；不新增 `store_snapshot`、shared DB direct-read 或 runtime-infra -> server 依赖作为默认业务路径。
- [ ] **进入条件：** retired compatibility seam 导致当前文档 truth、host composition、构建、边界违规或生产故障归因被阻塞，且无法在本主线的 source-aware guard 修复中关闭。
- [ ] **后续落点：** 新建 scoped “compatibility shell retirement and runtime-infra ownership”细则；按 service/host 迁移真实 owner 后删除旧 route、re-export 和 compatibility fallback。
- [ ] **要求的文档与测试：** 更新 `docs/architecture/BOUNDARIES.md`、`docs/reference/REPO_STRUCTURE.md`、相关 package README；运行受影响包测试、`pnpm exec fallow list --boundaries`、`pnpm exec fallow audit --base main`、`pnpm typecheck`、`pnpm check:docs` 与 `pnpm check:structure`。

### 工程维护信号偏高

- [ ] **来源：** 2026-07-10 历史基线记录 `394` 个静态维护问题、`302` 个超过阈值的函数、约 `19.16%` 重复行；主要是 unused exports/types、复杂热点和测试 helper/route wrapper 重复。
- [ ] **影响：** 维护成本和回归面偏高，但这些聚合数量不是单个功能缺陷，不能据此触发无范围的全仓重构。
- [ ] **当前边界：** 当前改动只修复 changed-code risk 或直接阻塞的热点；不为压低全局数字引入大规模抽象、删除公共 API 或修改行为。
- [ ] **进入条件：** 重新运行 fallow 后，某个 hotspot、重复组或 unused export 已与生产故障、边界违规、构建时间/包体积问题或连续三次相关变更相关联。
- [ ] **后续落点：** 新建 scoped maintenance tranche，以一个 package、一个 import boundary 或一组明确模块为单位处理。
- [ ] **要求的文档与测试：** 先记录新的 `fallow` baseline、目标文件和行为不变边界；运行模块 focused tests、`pnpm exec fallow audit --base main`、对应 typecheck，并在架构边界变化时回写 `docs/architecture/BOUNDARIES.md`。

### 平台化与服务自治尚未成熟

- [ ] **来源：** `distributed` 有真实服务进程和内部 HTTP hop，但当前成熟度仍为 `Level 2 / transitional-microservice`；服务发现默认值是显式 URL + Docker DNS，资源/autoscaling 示例未成为 checked-in 默认资产。
- [ ] **已验证边界（2026-07-13）：** `pnpm test:runtime-closeout:compose` 在 `11431ms` 内恢复单个 `knowledge-write` 重启后的 gateway → governance-review → knowledge-write 委托，同时 gateway health 与 job-runtime status 持续可用。这仅证明本地重启隔离；未量化独立扩缩容、生产运维收益或 Level 3 成熟度。
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
- [ ] **要求的文档与测试：** 更新 `docs/archived/architecture/DATABASE_OWNERSHIP.md`、`docs/architecture/components/PERSISTENCE.md`、`docs/reference/DATA_MODEL.md`、`docs/operations/ENVIRONMENT.md`；运行迁移/repository focused tests、distributed acceptance、容量验证、`pnpm typecheck` 与文档守卫。

### 安全候选与文档事实校准

- [ ] **来源：** 历史静态扫描保留安全候选，尚未经过 reachability 和数据流人工确认；服务发现说明也曾出现 optional overlay 被误写成必需依赖的风险。
- [ ] **影响：** 未经确认的候选可能掩盖真实安全优先级，文档漂移则会误导部署和故障处置。
- [ ] **当前边界：** 不把 advisory 扫描结果描述为已确认漏洞；不因文档校准改变运行时语义。
- [ ] **进入条件：** 候选可从外部输入到达危险 sink，或 `SYSTEM_TRUTH_SOURCES.md` 与具体 config/source 再次出现事实冲突。
- [ ] **后续落点：** 安全候选进入 verify-before-action 安全细则；文档事实冲突进入最小 doc-alignment 修复。
- [ ] **要求的文档与测试：** 安全项先补可复现测试和数据流证据，再修复及更新 `docs/operations/SECURITY.md`；文档项以权威源码为准更新 reference/architecture 文档并运行 `pnpm check:docs`、`pnpm check:structure`。

### 重复工具函数回潮与工厂模式一致性（2026-08-09 分析新增）

- [x] **来源：** [`../archived/reports/TECH_DEBT_UTILS_FACTORY_2026-08-09.md`](../archived/reports/TECH_DEBT_UTILS_FACTORY_2026-08-09.md) 人工分析：2026-08-08 lib 迁移主体无回潮，但发现 5 类新重复（`hashSecret`×3、`asRecord`×2 逐字、`normalize*`×6、前缀 ID×5、`Math.random().toString(36)`×4）、死代码（`store-utils.ts`、`cached-discovery.ts`+`round-robin-selector.ts` 零生产消费者），以及 3 处工厂失范（`createLabelReadProjection` 命名不符、gateway discovery 链内联重复 `new`、backend-core 两套 discovery 实现重叠）。
- [x] **已缓解（2026-08-09）：** 新增 lib `normalizeLabel`/`asRecord`/`prefixedId`（含单测 12 例）；`hashSecret`×3 改用 lib `sha256`；`asRecord`×2、`normalizeLabel`×5（labels 4 处 + llm-extract-ids 重导出）、前缀 ID×5、`Math.random` ID×4、`nextSubId` 全部收敛；删除死代码 `store-utils.ts`、`cached-discovery.ts`+`round-robin-selector.ts`（含测试与 README 示例）；`createLabelReadProjection` 改名 `createPgLabelRepository`；gateway 新增 `createGatewayDiscovery` 工厂消除重复构造；`ai-providers`/`service-job-runtime` 新增 `@trapmap/lib` 依赖与 tsconfig reference。验证：受影响包测试全绿、`pnpm typecheck` 无错误、`fallow audit --base main` 无 changed-file issue。
- [ ] **遗留（有意保留，见 lib 源码注释）：** `truncateForPrompt`、`internal-client.ts` AbortController timeout、`processing-task-queue.ts` poll 等待、`graph-align.ts` 的 `[^a-z0-9]+` 归一化、`contracts` 与 `host-distributed` 的 `isRecord`（数组排除语义不同）。
- [x] **遗留项更新（2026-08-15）：** 原遗留项中的 `contracts/graph-query.ts` 私有 `normalizeGraphLabel` 已随 Task 8（图算法/parsing 下沉）删除；contracts 仍保持"不得反向依赖 lib"的约束。其余遗留项保持有意保留。
- [ ] **当前边界：** 不触发无范围的全仓重构；`web-panel` 未开放 `lib` 依赖（`parseJsonDraft` 与 `parseJsonWithSchema` 的近似重复不属合并范围）。
- [ ] **进入条件：** 新增工具函数调用点、修改任一 snapshot backfill、或改动 Consul/discovery 行为时，优先在改动内收敛到 lib 或现有工厂；出现第三次同类复制时新建 scoped tranche。
- [ ] **后续落点：** 若 `ai-providers` 被纳入 fallow zone 治理，需同步 `.fallowrc.json` 与 `BOUNDARIES.md`；`host-distributed` 的 `normalizeLabels`/`labelKey` 与 `formatPrometheusLabels`（metrics label 排序）可随 observability 平台主线一并收敛。
- [ ] **要求的文档与测试：** lib 新增函数补单测；受影响包 focused tests；架构边界变化时回写 `docs/architecture/BOUNDARIES.md`；运行 `pnpm exec fallow audit --base main`、`pnpm typecheck`。

### knowledgeRepo listByFilter 桥的 LIMIT 100 暴露（2026-08-12 登记）

- [ ] **来源：** Task 9 断言清零时 host-local 新组装路径（`packages/host-local/src/nest/app.module.ts` 的 `knowledgeProjection` 桥）首次真实暴露：knowledge-read 读侧 `knowledgeRepo.listByFilter` 经桥委托到 knowledge-write owner 的 `knowledgeOwner.listByFilter`，其 SQL（`packages/service-knowledge-write/src/knowledge-projection.ts` 的 `listByFilter`）硬编码 `LIMIT 100`，无分页参数、无契约声明。
- [ ] **影响：** 读侧按 filter 列举超过 100 条知识条目时会被静默截断；桥两侧 port 签名均为无界数组语义（`Promise<KnowledgeEntryRecord[]>`），调用方无法感知截断，可能造成列表/统计结果不完整。
- [ ] **当前边界：** 该限制先于桥已存在于 owner 的 projection 实现；本登记项只追语义暴露，不修改 SQL 行为；不做无界扫描，也不在无分页契约下扩大 LIMIT。
- [ ] **进入条件：** 任一真实读路径出现 >100 条同 filter 命中的知识条目且被截断影响结果正确性；或该桥被新的消费方引用时。
- [ ] **后续落点：** 给 owner `listByFilter` 增加显式分页/上限契约（offset+limit 或返回 total），桥与 read-side port 同步声明语义，并补覆盖 >100 条命中的测试；回写 `docs/reference/api-surface.md` 与相关 README。
- [ ] **要求的文档与测试：** 改动集中在 `service-knowledge-write` pg-ports/projection 与 host-local 桥；运行相关包 focused tests、`pnpm typecheck`、`pnpm test:deployment-smoke`；契约变化时回写 reference 文档并跑 `pnpm check:docs`。

### eval:smoke 需 CI 补跑（docker 环境）

- [ ] **来源：** Task 6/9/12/13 本地无 docker daemon（且无 pgvector 扩展的本地 PG），`pnpm eval:smoke`（`scripts/run-postgres-coordinated.ts` 需临时 `pgvector/pgvector:pg16` 容器）在本地无法完整执行，只能跑无 PG 的离线部分。
- [ ] **影响：** 检索/摘要/治理/ingestion smoke 判定未经本机全量验证；eval 相关改动（Wave 8 收敛后）的回归证据只到离线部分与单元测试。
- [ ] **当前边界：** 不把本地跳过当作通过；`pnpm eval:smoke` 仍是 CI 的 eval 门禁（`.github/workflows/eval.yml`），本地报告明确标注"CI 需补跑"。
- [ ] **进入条件：** 任何检索/摘要/治理/feedback/fixtures/eval runner 改动按 AGENTS.md 要求补 `eval:smoke` 时，在具备 docker/PG 的环境（CI 或本地容器）完整跑一次并将结果回填本条。**Dead Code and Architecture Order Cleanup 主线 closeout（Task 13）后必须在 CI 完整补跑一轮**：本轮涉及 evals 双轨 runner 合并（Task 6）、eval import 边界/@eval-only 标记守卫（Task 12）与全量清理，线上回归证据目前仅到离线部分。
- [ ] **后续落点：** CI 上跑完整 `pnpm eval:smoke` 并把结果摘要写回本登记项；如频繁需要本地完整跑，可评估把 `TRAPMAP_POSTGRES_COORDINATOR_URL` 指向本地 pgvector 实例的开发流程。
- [ ] **要求的文档与测试：** 补跑后在 `docs/operations/TESTING.md` 的 eval 小节确认无 drift；`pnpm check:docs` 保持通过。

### `test:import-export` 脚本损坏（2026-08-12 登记）
- [ ] **来源：** Task 8（Wave 5 兼容债清除）验证时发现 `pnpm test:import-export` 在 base `19463ca3` 与主仓库同样失败：`scripts/test-skill-import-export.ts` 从根上下文导入 `@trapmap/service-knowledge-write` 与 `@trapmap/contracts`，但根 `package.json` 仅声明 `@trapmap/ai-providers`、`@trapmap/service-knowledge-read` 为 devDependencies，且 npm script 未传 `--tsconfig tsconfig.base.json`（其 paths 映射可解析所有 @trapmap 包）。`pnpm exec tsx --tsconfig tsconfig.base.json scripts/test-skill-import-export.ts` 可正常通过模块解析。
- [ ] **影响：** 该脚本实际不可通过 npm script 运行，Skill 导入导出回归检查（AGENTS.md 要求）只能手工带 `--tsconfig` 执行；未被 CI 引用，因此不阻塞 CI。
- [ ] **当前边界：** 不改变 `scripts/test-skill-import-export.ts` 逻辑；本登记项只追脚本可运行性。
- [ ] **进入条件：** 任何 Skill artifact import/export 变更需要按 AGENTS.md 补 `test:import-export`，或根 `package.json` devDependencies/脚本定义被重整时。
- [ ] **后续落点：** 建议修复：npm script 增加 `--tsconfig tsconfig.base.json`，或在根 devDependencies 声明 `@trapmap/service-knowledge-write` 与 `@trapmap/contracts`（`workspace:*`）后重跑 `pnpm install --lockfile-only` 更新锁文件。
- [ ] **要求的文档与测试：** 修复后运行 `pnpm exec tsx --tsconfig tsconfig.base.json scripts/test-skill-import-export.ts`（需已下载 skill bundles 与 PostgreSQL）验证，并回写 `docs/operations/TESTING.md` 中相关命令说明。

### gateway actorId 字段放宽族（2026-08-13 登记，人类裁决）

- [ ] **状态：** 两类放宽均为**人类裁决的良性放宽候选，待拍板**；本轮（final fix wave）不修改 schema，只登记。
- [ ] **来源：** final review 对比 `ae34db87`（RouteDef 统一前 `packages/host-distributed/src/gateway/routes.ts` 的 `validateBody` 时代）发现 `packages/host-distributed/src/gateway/route-defs.ts` 在迁移时放宽了两类必填约束：① `actorId` 从 body 必填变为 optional（`updateMemberSchema`、`entryMutationSchema`、`knowledgeSubmitSchema`、`supersedeSchema`、`createTrapSchema`、`knowledgeActionSchema`）；② 部分 query schema 从空串报错变为接受空串（`listTeamsSchema`、`mineQuerySchema`、`listTrapsSchema` 的 `userId`/`teamId` 不再拒绝 `''`）。
- [ ] **影响：** 语义上由客户端 body 自报 actorId 变为以 gateway auth hook 会话 actor 为准（`requireTrustedActor` + `trustedActorHeaders` 已用 hook actor 覆盖 header），空串 query 会导致服务端收到空过滤条件；两者均无已知真实调用方依赖，属可容忍的契约漂移，但未经人类确认不应永久化。
- [ ] **当前边界：** 本轮不恢复这些必填约束；`requireTrustedActor` 已保证 handler 侧 actor 来自会话而非客户端 body，空串 query 只影响过滤语义不影响安全。
- [ ] **进入条件：** 任一真实客户端开始依赖 body.actorId 必填语义（收到 400 而非 201/200），或空串 query 在服务端产生错误过滤结果；或人类拍板恢复旧语义。
- [ ] **后续落点：** 若拍板恢复：为相关 schema 恢复 `actorId: z.string()` 必填与 query 非空校验（`z.string().min(1)`），并补 400 断言测试；若拍板保留：在本条标注裁决结论后关闭。
- [ ] **要求的文档与测试：** 改动集中在 `packages/host-distributed/src/gateway/route-defs.ts` 与 `routes.test.ts`；恢复必填时补 400 断言测试并运行 gateway focused tests、`pnpm test:deployment-smoke`、裸 `pnpm typecheck`。

### governance remediation-complete 契约反转已修复（2026-08-13 登记）

- [x] **来源：** final review 发现 `packages/service-governance-review/src/routes.ts` 的 remediation-complete 路由把契约 `.strict()` 反转为 `.passthrough()`（未知键从 400 变透传），契约本体 `packages/contracts/src/domain/feedback.ts` 的 `feedbackRemediationCompleteRequestSchema` 仍是 `.strict()`。链条上被丢过两次：Task 3 deferred → Task 4 留给 DDD → Task 6 未处理。
- [x] **已修复（2026-08-13）：** 路由 body schema 恢复为直接使用 `feedbackRemediationCompleteRequestSchema`（strict），handler 不再做 `actorId` 剥离（原剥离依赖 `.passthrough()` 放行未知键）。验证：`service-governance-review` routes.test 新增 strict 契约测试（未知键 400 + 干净 body 200，fastify/nest 双 adapter），host-distributed gateway 的 completeRemediation 转发前已由 `requireTrustedActor` 剥离 body.actorId，不受 strict 影响。
- [ ] **当前边界：** 恢复 strict 后，直接向服务 internal 路由发送含 `actorId` body 的调用方会收到 400；gateway 形态不受影响（转发前剥离 actorId），host-local monolith 不挂载该 internal 路由。
- [ ] **进入条件：** 若未来出现不经 gateway、直接携带 `actorId` body 调用该 internal 路由的合法消费者，需为其提供显式 actor 透传通道。
- [ ] **后续落点：** 关闭本条；如发现遗留调用方再重开。
- [ ] **要求的文档与测试：** 已补 strict 契约测试；相关包 focused tests、`pnpm test:deployment-smoke`、裸 `pnpm typecheck` 通过（见 final fix report）。

### Task 9 listMine 空集 follow-up 补登记（2026-08-13）

- [ ] **状态：** 大概率不实，但作为 dropped follow-up 补登记（该事项在 Task 3/4/6 链条中被丢弃，本次为追溯性登记）。
- [ ] **来源：** `.superpowers/sdd/2026-08-09-maintainability-rework/task-9-report.md`（git-ignored 工作区报告）记录的遗留：host-local `knowledgeProjection` 桥把 `listByFilter` 委托到 knowledge-write owner；read 侧 `entryProjection.listMine` 按 `ownerUserId` 内存过滤，而 contracts `KnowledgeEntry` 运行时记录无该字段（有 `owner.userId`），`listMine` 可能返回空集。Task 9 明确"该问题超出类型清理范围，建议单独立项（Wave: read-projection wiring）"，但未登记。
- [ ] **影响：** 若成立，host-local `/v1/knowledge/mine` 与网关 `GET /v1/knowledge/mine` 可能对已有用户返回空列表；无真实用户报告过，且 owner 层 `listByFilter` 的 ownerUserId 过滤语义可能已覆盖该场景，故标记"大概率不实"。
- [ ] **当前边界：** 本轮不修改 read-side 过滤逻辑，不改变 contracts 字段；仅补登记。
- [ ] **进入条件：** 任一真实 host-local/distributed 调用方在存在 `owner.userId` 知识条目时调用 listMine 得到空集且可复现。
- [ ] **后续落点：** 进入条件满足时，在 read-side projection 或桥层按 `owner.userId` 对齐过滤字段，补 host-local 与 distributed 的 listMine 非空回归测试，并回写 `docs/reference/api-surface.md`。
- [ ] **要求的文档与测试：** 修改集中在 host-local 桥与 knowledge-read projection；运行对应包 focused tests、`pnpm test:deployment-smoke`、裸 `pnpm typecheck`。
### candidates 表双份已单源化（2026-08-15 closeout 登记）

- [x] **来源：** 2026-08-15 六路审查确认 `persistence-schema/src/candidates.ts`（7 表）与 `service-candidate-ingestion/src/schema.ts`（本地 7 表，未声明依赖）双份定义已漂移。
- [x] **已修复（本主线）：** Task 3 将 candidate-ingestion `schema.ts` 改为 `export * from '@trapmap/persistence-schema'` 并补依赖声明；Task 7 diff 两副本列差异（auditTimestamps 工厂、CHECK 集合、列顺序），以经迁移验证的本地版为准补齐 persistence-schema 后单源化；Task 12 落地 pgTable 单源守卫（`check:pgtable-single-source`）阻断复发。验证：service-candidate-ingestion pg-ports/migrations 测试全绿、表清单守卫 64=64、全量回归通过。
- [ ] **当前边界：** 单源约束已由守卫强制；遗留差异只剩迁移 SQL 的 3 个 legacy JSONB 列（见下方独立条目）。
- [ ] **进入条件/后续落点：** 关闭本条；如未来任一 service 包重新定义 pgTable，由 `check:pgtable-single-source` 直接阻断（守卫单测 9 例覆盖正反例）。
- [ ] **要求的文档与测试：** 已含 guard 单测与迁移测试；无额外要求。

### vitest.config.ts fastify 别名漂移已修复（2026-08-15 closeout 登记）

- [x] **来源：** Task 4 验证时发现 `vitest.config.ts` 硬编码 `fastify@5.8.4` 而 lockfile 已解析 `fastify@5.8.5`；主仓库因 store 残留旧目录侥幸通过，全新 worktree/CI 安装必然失败。
- [x] **已修复：** 别名更新为 `fastify@5.8.5` 与 lockfile 对齐（Task 4 附带 1 行修复）。
- [ ] **当前边界/进入条件/后续落点：** 关闭本条；如再出现版本漂移，建议检查 vitest 别名与 lockfile 的一致性守卫。
- [ ] **要求的文档与测试：** 无额外要求。

### web-panel real admin 路径不可运行（2026-08-15 登记）

- [ ] **来源：** 六路审查 web-panel 车道 + Task 5 验证：`packages/web-panel/src/services/api/admin-panel-api.ts` 的 5 个 `/api/admin/*` 路径（runtime-overview、reviews/:id、json-edits、activity、artifacts）全仓无后端实现（host/service 零路由）；客户端经 `@trapmap/client-core` 的 `apiRequest` 调用，但登录后 token 不回填（web-panel 只有手动 copy-token UX，`SessionProvider` 未接登录回填），real 模式实际不可用；`VITE_ADMIN_PANEL_API_MODE=mock` 是唯一可用模式。
- [ ] **影响：** web-panel admin 面板在 real 模式（生产构建拒绝 mock）下所有 admin 端点 404/未授权，不能作为真实管理控制台使用；`/api/admin/*` 属于无后端实现的前端死路径。
- [ ] **当前边界：** 本轮不实现后端、不改 token 流程；mock 模式维持现状。
- [ ] **进入条件：** 需要 web-panel 承担真实管理控制台职责（存在操作员/管理员用户故事）时。
- [ ] **后续落点：** 新建 web-panel real 接入细则：按 RouteDef 工厂补齐 `/api/admin/*` 路由（或改用已有 `/v1` 表面），登录成功后会话 token 回填 `SessionProvider`，补集成测试。
- [ ] **要求的文档与测试：** 更新 `packages/web-panel/README.md` 与 host 路由面文档；运行 host/service 相关包测试、`pnpm test:deployment-smoke`、`pnpm typecheck`、`pnpm check:docs`。

### capability-model 拆分（2026-08-15 登记）

- [ ] **来源：** 六路审查 backend-core 车道：`packages/backend-core/src/runtime/capability-model.ts` 单文件 510 行，类型定义/默认值/校验/推导混合并承担宿主 capability 组合职责。
- [ ] **影响：** 新增能力维度或宿主接入时改动集中、审查困难；单文件行数已接近复杂度预算（Task 1 后 capability-model.test.ts 改用 stub，仍保留 510 行主体）。
- [ ] **当前边界：** 本轮不拆分（行为不变硬约束）。
- [ ] **进入条件：** capability-model.ts 行数超出复杂度预算、新增维度需要独立校验/推导单元，或出现第三个宿主消费方。
- [ ] **后续落点：** 在 backend-core runtime 内拆为 types/defaults/validation/resolution 模块，补能力组合单测。
- [ ] **设计输入：** [`../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md`](../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md) 定义目标架构（deferred 设计输入，激活前不构成执行授权）。
- [ ] **要求的文档与测试：** 相关包 focused tests、`pnpm typecheck`、`pnpm exec fallow audit --base main`。

### OTel 双份接线收敛（2026-08-15 登记）

- [ ] **来源：** 六路审查 hosts 车道：host-local（nest observability 模块）与 host-distributed（`shared/telemetry.ts` + `gateway/internal-observability.ts` + `shared/observability.ts`）各维护一套 OTel/指标接线，规则与导出语义存在两份实现。
- [ ] **影响：** OTel 语义调整需双处同步，漂移风险高；host-local 与 distributed 的 metrics/span 行为可能不一致。
- [ ] **当前边界：** 本轮不合并（涉及两个宿主 runtime 行为，属大重构）。
- [ ] **进入条件：** 出现需双宿主同步修改的 OTel 语义变更（span 属性、采样策略、脱敏规则），或指标口径在两侧被证实不一致。
- [ ] **后续落点：** 提取共享 OTel 接线支持（backend-core 或 lib），两宿主经同一 API 接线，host-local 与 host-distributed 只保留组合。
- [ ] **设计输入：** [`../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md`](../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md) 定义目标架构（deferred 设计输入，激活前不构成执行授权）。
- [ ] **要求的文档与测试：** 更新 `docs/architecture/OBSERVABILITY.md`；运行 `pnpm test:observability-closeout`、`pnpm test:deployment-smoke`、`pnpm typecheck`。

### Consul 双份实现收敛（2026-08-15 登记）

- [ ] **来源：** 六路审查 hosts 车道：host-local 维护 NestJS `service-discovery/consul.module.ts`+`consul.service.ts`，host-distributed 维护 framework-free `gateway/consul-discovery-adapter.ts`+`discovery-factory.ts`（实现 backend-core `DiscoveryPort`），两套 Consul 发现实现并行。
- [ ] **影响：** Consul 健康检查/KV/重试语义双处漂移；服务发现行为验证需覆盖两个实现。
- [ ] **当前边界：** 本轮不合并。
- [ ] **进入条件：** Consul 行为（健康检查、KV、重试）需双宿主一致修改，或出现真实 Consul 故障归因不一致。
- [ ] **后续落点：** 以 `DiscoveryPort` 为准统一 framework-free adapter，host-local 迁到同一实现或共用 backend-core discovery 支持。
- [ ] **设计输入：** [`../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md`](../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md) 定义目标架构（deferred 设计输入，激活前不构成执行授权）。
- [ ] **要求的文档与测试：** 更新 `docs/architecture/SERVICE-DISCOVERY.md`；运行 `pnpm test:discovery-closeout`、`pnpm test:deployment-smoke`。

### EvalSeedPort 收窄（2026-08-15 登记）

- [ ] **来源：** 六路审查 evals 车道：eval seed 能力经共享端口对 eval runner 全量开放，暴露面过宽，缺少最小化接口；收窄属大重构，本主线明确不实施。
- [ ] **影响：** eval seed 写入面与产品写路径耦合，新增 seed 源或写路径语义变化时需同步评估 eval 面。
- [ ] **当前边界：** 本轮不实施。
- [ ] **进入条件：** 新增 eval seed 源、或产品写路径语义变化影响 seed 端口签名、或 evals 出现绕过 seed 端口直写行为。
- [ ] **后续落点：** 将 seed 端口收窄为最小契约（只暴露 eval 需要的 seed 能力），其余写路径回到产品端口。
- [ ] **要求的文档与测试：** evals focused tests、`pnpm eval:smoke`（CI）、`pnpm typecheck`。

### internal-client review/governanceReview 双组合并（2026-08-15 登记）

- [ ] **来源：** 六路审查 hosts 车道：`packages/host-distributed/src/gateway/internal-client.ts`（928 行）的 `review` 与 `governanceReview` 两组 7 方法逐字重复（同一 governance-review 服务的两个 URL key：`urls.review`/`urls.governanceReview`；`governanceReview` 额外含 getRetrievalProjection/reactivateRemediation/exportBadcaseDraft）。
- [ ] **影响：** 方法签名/路径改动需双处同步；新增内部方法要复制两份。
- [ ] **当前边界：** 本轮不合并（涉及 gateway 客户端语义与 baseUrl 选择逻辑）。
- [ ] **进入条件：** governance-review 内部接口新增/变更方法时，或 `urls.review`/`urls.governanceReview` 任一 URL key 被确认可退役。
- [ ] **后续落点：** 合并为单组并按 baseUrl 来源选择 URL key（或统一为一个 URL key），补 gateway 客户端测试。
- [ ] **设计输入：** [`../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md`](../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md) 定义目标架构（deferred 设计输入，激活前不构成执行授权）。
- [ ] **要求的文档与测试：** host-distributed gateway focused tests、`pnpm test:deployment-smoke`、`pnpm typecheck`。

### host-distributed shared/ports.ts 业务下沉（2026-08-15 登记）

- [ ] **来源：** 六路审查 hosts 车道：`packages/host-distributed/src/shared/ports.ts`（353 行，其中 109-302）宿主直接手写检索/队列/outbox SQL 实现（宿主应只做装配，SQL 应留在 service pg-ports 或 backend-core 端口实现）。
- [ ] **影响：** 宿主持有业务 SQL，绕过 service 包 pg-ports 与 domain 规则；SQL 逻辑在宿主与 service 间可能漂移。
- [ ] **当前边界：** 本轮不迁移（宿主行为不变硬约束；迁移涉及 distributed 装配面）。
- [ ] **进入条件：** `shared/ports.ts` 任一 SQL 实现出现行为不一致修复，或 service 包 pg-ports 签名变化使宿主实现可自然替换。
- [ ] **后续落点：** 宿主改消费对应 service 包/backend-core 的端口实现，`shared/ports.ts` 只保留装配与组合。
- [ ] **设计输入：** [`../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md`](../superpowers/specs/2026-08-15-distributed-architecture-order-performance-design.md) 定义目标架构（deferred 设计输入，激活前不构成执行授权）。
- [ ] **要求的文档与测试：** 更新 `docs/architecture/BOUNDARIES.md` 与服务发现相关文档；运行 `pnpm test:distributed-closeout`、`pnpm test:deployment-smoke`。

### candidates 3 个 legacy JSONB 列（2026-08-15 登记）

- [ ] **来源：** Task 7 迁移 SQL 与 persistence-schema diff：`service-candidate-ingestion/drizzle` 迁移 baseline 的 `candidates` 表含 `analysis_snapshot`/`duplicate_case`/`manual_result` 3 个 legacy nullable JSONB 列，persistence-schema 单源定义无这些列（注释明确为结构化拆分替代品）；两份定义从未同步过（溯源至更早基线重生成时保留旧列）。
- [ ] **影响：** 实际应用迁移后 DB 比单源 schema 多 3 个零代码消费的列，表结构与单源不一致。
- [ ] **当前边界：** 本轮不动迁移 SQL；表清单守卫刻意不覆盖迁移 SQL。
- [ ] **进入条件：** 需对已有环境 DB 做结构迁移/重建基线时（需先确认无数据依赖）。
- [ ] **后续落点：** 新增 0001 迁移 `ALTER TABLE candidates DROP COLUMN ...`（或重建基线），回写 `DATABASE_SCHEMA.md`。
- [ ] **要求的文档与测试：** service-candidate-ingestion migrations 测试、表清单守卫、`pnpm test:deployment-smoke`。

### task_queue_type_dedupe_idx 冗余索引（2026-08-15 登记）

- [ ] **来源：** Task 11 索引对比：`packages/persistence-schema/src/queue.ts` 的 `task_queue_type_dedupe_idx`（非部分，`(type, dedupe_key)`）与 `task_queue_dedupe_pending_idx`（部分唯一，`status IN ('pending','running')` 同列组）覆盖同一列组；唯一消费 `(type, dedupe_key)` 的 dedupe 回查（`async-runtime.ts:120`，条件 `status IN ('pending','running')`）被部分唯一索引完全覆盖，终态行无该组合查询。
- [ ] **影响：** 冗余非唯一索引增加写入开销与索引维护成本（量级小，非功能缺陷）。
- [ ] **当前边界：** 本轮只确认冗余不删除——`0000_sharp_old_lace.sql` 是已应用迁移，原地修改需按团队约定走新迁移或重建基线。
- [ ] **进入条件：** 索引清理/迁移基线重建任务窗口（建议与 candidates JSONB 列、store_snapshot 同批）。
- [ ] **后续落点：** `queue.ts` 移除定义 + 新迁移 `DROP INDEX`（或重建基线），补 async-runtime 回归测试。
- [ ] **要求的文档与测试：** service-job-runtime 测试、`pnpm test:deployment-smoke`、表清单守卫。

### store_snapshot 幽灵表（2026-08-15 登记）

- [ ] **来源：** Task 11/12 发现 `service-identity-access/drizzle/0000_identity_access_baseline.sql` 仍 `CREATE TABLE store_snapshot`（Wave-9 已删除模块的迁移残留），persistence-schema 无此表；六个 service drizzle baseline 共建 66 张 CREATE TABLE（64 建模 + `conflict_relations` 未建模 + `store_snapshot` 残留）。
- [ ] **影响：** 全新环境应用迁移后创建已退役表；迁移 SQL 与单源表清单不一致。
- [ ] **当前边界：** 表清单守卫以 persistence-schema（64 表）为权威且明确不覆盖迁移 SQL；`conflict_relations` 属同族未建模表（governance-review 独立 baseline），随服务演进一并裁决。
- [ ] **进入条件：** 迁移 SQL 重建/收敛窗口（建议与 candidates JSONB 列、dedupe 索引同批）。
- [ ] **后续落点：** 从 identity-access 迁移 SQL 删除 `store_snapshot` CREATE TABLE（或迁入 persistence-schema 若仍需保留），同步 `conflict_relations` 裁决。
- [ ] **要求的文档与测试：** identity-access migrations 测试、`pnpm test:deployment-smoke`、表清单守卫。

### host-distributed Dockerfile 冗余 COPY client-core（2026-08-15 登记）

- [ ] **来源：** Task 4 移除两 host `@trapmap/client-core` 依赖后，`packages/host-distributed/Dockerfile` 与 `dockerfile.test.ts` 仍 COPY client-core（镜像构建冗余，超出 Task 4 范围未动）。
- [ ] **影响：** 镜像构建复制无消费者的包目录，构建面与依赖面不一致（无害）。
- [ ] **当前边界：** 本轮未动。
- [ ] **进入条件：** 镜像构建/Dockerfile 清理任务窗口。
- [ ] **后续落点：** Dockerfile 移除 COPY client-core 行并同步 `dockerfile.test.ts` 断言。
- [ ] **要求的文档与测试：** `dockerfile.test.ts`、`pnpm test:deployment-smoke`。

### web-panel 5 个预存测试失败（2026-08-15 登记）

- [ ] **来源：** Task 5 验证发现 web-panel 测试 `9 failed | 4 passed (13 files)` / `5 failed | 10 passed (15 tests)`，干净 HEAD 复跑得到一致失败画像（`admin-panel-service-context.test.ts` 等 stubEnv/MODE 相关），属与主链改动无关的预存失败。
- [ ] **影响：** web-panel 测试门禁实际不可绿，其改动回归信号被淹没。
- [ ] **当前边界：** 本轮不修（web-panel 未纳入本主线文件域）。
- [ ] **进入条件：** web-panel 任何功能改动需要跑其测试，或 web-panel 被纳入 CI 门禁时。
- [ ] **后续落点：** 修复 stubEnv/MODE 环境模拟（对齐 vitest 环境变量注入），补全 web-panel 测试配置。
- [ ] **要求的文档与测试：** web-panel 全量测试恢复全绿后回写 `docs/operations/TESTING.md`。


## 审核检查表

- [ ] 每次新问题录入都标注来源、影响、分类、证据和进入条件。
- [ ] 每次主线 closeout 前确认没有把 deferred 项误标为已交付能力。
- [ ] 每次将事项提升为 active mainline 前，在根 `plan.md` 明确替换当前细则链接，并在 `docs/todos/README.md` 同步状态。
