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
- [ ] **要求的文档与测试：** 更新 `docs/architecture/BOUNDARIES.md`、`docs/reference/REPO_STRUCTURE.md`、相关 package README；运行受影响包测试、`rtk pnpm exec fallow list --boundaries`、`rtk pnpm exec fallow audit --base main`、`rtk pnpm typecheck`、`rtk pnpm check:docs` 与 `rtk pnpm check:structure`。

### 工程维护信号偏高

- [ ] **来源：** 2026-07-10 历史基线记录 `394` 个静态维护问题、`302` 个超过阈值的函数、约 `19.16%` 重复行；主要是 unused exports/types、复杂热点和测试 helper/route wrapper 重复。
- [ ] **影响：** 维护成本和回归面偏高，但这些聚合数量不是单个功能缺陷，不能据此触发无范围的全仓重构。
- [ ] **当前边界：** 当前改动只修复 changed-code risk 或直接阻塞的热点；不为压低全局数字引入大规模抽象、删除公共 API 或修改行为。
- [ ] **进入条件：** 重新运行 fallow 后，某个 hotspot、重复组或 unused export 已与生产故障、边界违规、构建时间/包体积问题或连续三次相关变更相关联。
- [ ] **后续落点：** 新建 scoped maintenance tranche，以一个 package、一个 import boundary 或一组明确模块为单位处理。
- [ ] **要求的文档与测试：** 先记录新的 `fallow` baseline、目标文件和行为不变边界；运行模块 focused tests、`rtk pnpm exec fallow audit --base main`、对应 typecheck，并在架构边界变化时回写 `docs/architecture/BOUNDARIES.md`。

### 平台化与服务自治尚未成熟

- [ ] **来源：** `distributed` 有真实服务进程和内部 HTTP hop，但当前成熟度仍为 `Level 2 / transitional-microservice`；服务发现默认值是显式 URL + Docker DNS，资源/autoscaling 示例未成为 checked-in 默认资产。
- [ ] **已验证边界（2026-07-13）：** `rtk pnpm test:runtime-closeout:compose` 在 `11431ms` 内恢复单个 `knowledge-write` 重启后的 gateway → governance-review → knowledge-write 委托，同时 gateway health 与 job-runtime status 持续可用。这仅证明本地重启隔离；未量化独立扩缩容、生产运维收益或 Level 3 成熟度。
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
- [ ] **要求的文档与测试：** 更新 `docs/archived/architecture/DATABASE_OWNERSHIP.md`、`docs/architecture/components/PERSISTENCE.md`、`docs/reference/DATA_MODEL.md`、`docs/operations/ENVIRONMENT.md`；运行迁移/repository focused tests、distributed acceptance、容量验证、`rtk pnpm typecheck` 与文档守卫。

### 安全候选与文档事实校准

- [ ] **来源：** 历史静态扫描保留安全候选，尚未经过 reachability 和数据流人工确认；服务发现说明也曾出现 optional overlay 被误写成必需依赖的风险。
- [ ] **影响：** 未经确认的候选可能掩盖真实安全优先级，文档漂移则会误导部署和故障处置。
- [ ] **当前边界：** 不把 advisory 扫描结果描述为已确认漏洞；不因文档校准改变运行时语义。
- [ ] **进入条件：** 候选可从外部输入到达危险 sink，或 `SYSTEM_TRUTH_SOURCES.md` 与具体 config/source 再次出现事实冲突。
- [ ] **后续落点：** 安全候选进入 verify-before-action 安全细则；文档事实冲突进入最小 doc-alignment 修复。
- [ ] **要求的文档与测试：** 安全项先补可复现测试和数据流证据，再修复及更新 `docs/operations/SECURITY.md`；文档项以权威源码为准更新 reference/architecture 文档并运行 `rtk pnpm check:docs`、`rtk pnpm check:structure`。

### 重复工具函数回潮与工厂模式一致性（2026-08-09 分析新增）

- [x] **来源：** [`../archived/reports/TECH_DEBT_UTILS_FACTORY_2026-08-09.md`](../archived/reports/TECH_DEBT_UTILS_FACTORY_2026-08-09.md) 人工分析：2026-08-08 lib 迁移主体无回潮，但发现 5 类新重复（`hashSecret`×3、`asRecord`×2 逐字、`normalize*`×6、前缀 ID×5、`Math.random().toString(36)`×4）、死代码（`store-utils.ts`、`cached-discovery.ts`+`round-robin-selector.ts` 零生产消费者），以及 3 处工厂失范（`createLabelReadProjection` 命名不符、gateway discovery 链内联重复 `new`、backend-core 两套 discovery 实现重叠）。
- [x] **已缓解（2026-08-09）：** 新增 lib `normalizeLabel`/`asRecord`/`prefixedId`（含单测 12 例）；`hashSecret`×3 改用 lib `sha256`；`asRecord`×2、`normalizeLabel`×5（labels 4 处 + llm-extract-ids 重导出）、前缀 ID×5、`Math.random` ID×4、`nextSubId` 全部收敛；删除死代码 `store-utils.ts`、`cached-discovery.ts`+`round-robin-selector.ts`（含测试与 README 示例）；`createLabelReadProjection` 改名 `createPgLabelRepository`；gateway 新增 `createGatewayDiscovery` 工厂消除重复构造；`ai-providers`/`service-job-runtime` 新增 `@trapmap/lib` 依赖与 tsconfig reference。验证：受影响包测试全绿、`pnpm typecheck` 无错误、`fallow audit --base main` 无 changed-file issue。
- [ ] **遗留（有意保留，见 lib 源码注释）：** `truncateForPrompt`、`internal-client.ts` AbortController timeout、`processing-task-queue.ts` poll 等待、`graph-align.ts` 的 `[^a-z0-9]+` 归一化、`contracts` 与 `host-distributed` 的 `isRecord`（数组排除语义不同）、`contracts/graph-query.ts` 私有 `normalizeGraphLabel`（contracts 不得反向依赖 lib）。
- [ ] **当前边界：** 不触发无范围的全仓重构；`web-panel` 未开放 `lib` 依赖（`parseJsonDraft` 与 `parseJsonWithSchema` 的近似重复不属合并范围）。
- [ ] **进入条件：** 新增工具函数调用点、修改任一 snapshot backfill、或改动 Consul/discovery 行为时，优先在改动内收敛到 lib 或现有工厂；出现第三次同类复制时新建 scoped tranche。
- [ ] **后续落点：** 若 `ai-providers` 被纳入 fallow zone 治理，需同步 `.fallowrc.json` 与 `BOUNDARIES.md`；`host-distributed` 的 `normalizeLabels`/`labelKey` 与 `formatPrometheusLabels`（metrics label 排序）可随 observability 平台主线一并收敛。
- [ ] **要求的文档与测试：** lib 新增函数补单测；受影响包 focused tests；架构边界变化时回写 `docs/architecture/BOUNDARIES.md`；运行 `rtk pnpm exec fallow audit --base main`、`rtk pnpm typecheck`。

### knowledgeRepo listByFilter 桥的 LIMIT 100 暴露（2026-08-12 登记）

- [ ] **来源：** Task 9 断言清零时 host-local 新组装路径（`packages/host-local/src/nest/app.module.ts` 的 `knowledgeProjection` 桥）首次真实暴露：knowledge-read 读侧 `knowledgeRepo.listByFilter` 经桥委托到 knowledge-write owner 的 `knowledgeOwner.listByFilter`，其 SQL（`packages/service-knowledge-write/src/knowledge-projection.ts` 的 `listByFilter`）硬编码 `LIMIT 100`，无分页参数、无契约声明。
- [ ] **影响：** 读侧按 filter 列举超过 100 条知识条目时会被静默截断；桥两侧 port 签名均为无界数组语义（`Promise<KnowledgeEntryRecord[]>`），调用方无法感知截断，可能造成列表/统计结果不完整。
- [ ] **当前边界：** 该限制先于桥已存在于 owner 的 projection 实现；本登记项只追语义暴露，不修改 SQL 行为；不做无界扫描，也不在无分页契约下扩大 LIMIT。
- [ ] **进入条件：** 任一真实读路径出现 >100 条同 filter 命中的知识条目且被截断影响结果正确性；或该桥被新的消费方引用时。
- [ ] **后续落点：** 给 owner `listByFilter` 增加显式分页/上限契约（offset+limit 或返回 total），桥与 read-side port 同步声明语义，并补覆盖 >100 条命中的测试；回写 `docs/reference/api-surface.md` 与相关 README。
- [ ] **要求的文档与测试：** 改动集中在 `service-knowledge-write` pg-ports/projection 与 host-local 桥；运行相关包 focused tests、`rtk pnpm typecheck`、`rtk pnpm test:deployment-smoke`；契约变化时回写 reference 文档并跑 `rtk pnpm check:docs`。

### eval:smoke 需 CI 补跑（docker 环境）

- [ ] **来源：** Task 6/9/12 本地无 docker daemon（且无 pgvector 扩展的本地 PG），`rtk pnpm eval:smoke`（`scripts/run-postgres-coordinated.ts` 需临时 `pgvector/pgvector:pg16` 容器）在本地无法完整执行，只能跑无 PG 的离线部分。
- [ ] **影响：** 检索/摘要/治理/ingestion smoke 判定未经本机全量验证；eval 相关改动（Wave 8 收敛后）的回归证据只到离线部分与单元测试。
- [ ] **当前边界：** 不把本地跳过当作通过；`pnpm eval:smoke` 仍是 CI 的 eval 门禁（`.github/workflows/eval.yml`），本地报告明确标注"CI 需补跑"。
- [ ] **进入条件：** 任何检索/摘要/治理/feedback/fixtures/eval runner 改动按 AGENTS.md 要求补 `eval:smoke` 时，在具备 docker/PG 的环境（CI 或本地容器）完整跑一次并将结果回填本条。
- [ ] **后续落点：** CI 上跑完整 `pnpm eval:smoke` 并把结果摘要写回本登记项；如频繁需要本地完整跑，可评估把 `TRAPMAP_POSTGRES_COORDINATOR_URL` 指向本地 pgvector 实例的开发流程。
- [ ] **要求的文档与测试：** 补跑后在 `docs/operations/TESTING.md` 的 eval 小节确认无 drift；`rtk pnpm check:docs` 保持通过。

### `test:import-export` 脚本损坏（2026-08-12 登记）
- [ ] **来源：** Task 8（Wave 5 兼容债清除）验证时发现 `pnpm test:import-export` 在 base `19463ca3` 与主仓库同样失败：`scripts/test-skill-import-export.ts` 从根上下文导入 `@trapmap/service-knowledge-write` 与 `@trapmap/contracts`，但根 `package.json` 仅声明 `@trapmap/ai-providers`、`@trapmap/service-knowledge-read` 为 devDependencies，且 npm script 未传 `--tsconfig tsconfig.base.json`（其 paths 映射可解析所有 @trapmap 包）。`pnpm exec tsx --tsconfig tsconfig.base.json scripts/test-skill-import-export.ts` 可正常通过模块解析。
- [ ] **影响：** 该脚本实际不可通过 npm script 运行，Skill 导入导出回归检查（AGENTS.md 要求）只能手工带 `--tsconfig` 执行；未被 CI 引用，因此不阻塞 CI。
- [ ] **当前边界：** 不改变 `scripts/test-skill-import-export.ts` 逻辑；本登记项只追脚本可运行性。
- [ ] **进入条件：** 任何 Skill artifact import/export 变更需要按 AGENTS.md 补 `test:import-export`，或根 `package.json` devDependencies/脚本定义被重整时。
- [ ] **后续落点：** 建议修复：npm script 增加 `--tsconfig tsconfig.base.json`，或在根 devDependencies 声明 `@trapmap/service-knowledge-write` 与 `@trapmap/contracts`（`workspace:*`）后重跑 `pnpm install --lockfile-only` 更新锁文件。
- [ ] **要求的文档与测试：** 修复后运行 `pnpm exec tsx --tsconfig tsconfig.base.json scripts/test-skill-import-export.ts`（需已下载 skill bundles 与 PostgreSQL）验证，并回写 `docs/operations/TESTING.md` 中相关命令说明。

## 审核检查表

- [ ] 每次新问题录入都标注来源、影响、分类、证据和进入条件。
- [ ] 每次主线 closeout 前确认没有把 deferred 项误标为已交付能力。
- [ ] 每次将事项提升为 active mainline 前，在根 `plan.md` 明确替换当前细则链接，并在 `docs/todos/README.md` 同步状态。
