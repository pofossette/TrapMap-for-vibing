# Runtime Recomposition Plan 05: Migration, Validation, And Doc Rollout

## 状态

- 状态：`active`
- 依赖：`01-shared-client-core-extraction.md`、`02-backend-core-kernel-extraction.md`、`03-light-host-assembly.md`、`04-heavy-microservice-assembly.md`

## 目标

定义这轮重构如何增量迁移、如何验证、如何回写脚本与文档，避免“大计划写完后实现无落点”。

## 迁移原则

- 保持迁移期可运行，避免一次性替换全部入口。
- 每个阶段都要有清晰的兼容层和退出条件。
- 先迁移共享接口，再迁移实现落点，再删除旧壳层。

## 建议迁移顺序

### Phase 1. 客户端共享层迁移

- 新增 `packages/client-core`
- CLI 切到新 transport
- 保持命令面和配置语义不变

### Phase 2. 后端核心内核迁移

- 新增 `packages/backend-core`
- 先把 runtime contracts 和 ports 上提
- 先落 internal config surface 与 invocation contract
- 先冻结数据库 ownership、事务边界与 projection 规则
- 再迁 use cases 和 bounded-context modules

### Phase 3. 轻宿主落地

- 新增 `packages/host-local`
- 让 `local-agent`、`team-monolith` 的 dev scripts 指向新宿主

### Phase 4. 重宿主落地

- 新增 `packages/host-distributed`
- 先按 config surface 实现 `in-process` / `http` adapter
- `rpc` mode 可以先保留占位，不要求首期实现
- 按服务落实共享库下的 repo ownership、连接池和 migration 策略
- 让 distributed scripts / compose profile 逐步切向新宿主

### Phase 5. 旧壳层收口

- 评估 `packages/server` 保留为兼容 facade、迁移壳层，还是进一步瘦身/退役
- 清理重复 wiring、重复 runtime contract 和过时文档

## 验证矩阵

### 包级验证

- 新包都要有 README、`package.json`、`tsconfig`、测试入口
- `pnpm typecheck`
- `pnpm test`
- internal config parsing / defaults / validation test

### 运行形态验证

- `local-agent` smoke
- `team-monolith` smoke
- `distributed` smoke
- gateway-only CLI regression

### 重点回归

- 登录与 session token 续传
- retrieval query 与 queryId 追踪
- knowledge / trap / skill 写路径
- candidate / governance async flow
- operations/status 与健康探针
- internal timeout / retry / correlation propagation
- in-process 与 http mode 的行为一致性
- 表级 ownership 没有被新宿主绕过
- authoritative write + outbox append 的事务原子性
- projection rebuild / invalidation 在 distributed 下仍然一致
- distributed invalidation 下的 cache freshness 与 hit/miss 指标一致
- bulk ingestion / rebuild job 的 batch commit、retry、resume 语义一致

## 文档回写要求

至少同步更新：

- `README.md`
- `docs/README.md`
- `docs/PACKAGES.md`
- `docs/architecture/DEPLOYMENT.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/reference/REPO_STRUCTURE.md`（若新增包和目录规则发生变化）
- `docs/operations/ENVIRONMENT.md`
- `docs/reference/DATA_MODEL.md`
- `docs/reference/DATABASE_SCHEMA.md`
- `docs/architecture/PRECOMPUTATION.md`

## 退出条件

当以下条件满足时，可以开始收缩旧结构：

- CLI 不再依赖 `packages/cli/src/lib/http.ts` 的旧实现。
- 新宿主已经承接正式开发脚本和 smoke 路径。
- 核心运行时语义只保留一份权威实现，不再同时散落在旧 server 包和新宿主中。
- internal config surface 已写入环境变量文档并被测试覆盖。
- 数据库 ownership、事务边界和 projection 责任已写入数据模型/表结构文档并被验证覆盖。
- 缓存分层、失效策略与 bulk ingestion batch contract 已写入架构文档并被验证覆盖。

## 风险

- 如果没有明确兼容期边界，`packages/server` 会长期变成双写/双维护负担。
- 如果测试矩阵不先更新，迁移期容易出现 profile 之间“一个能跑、两个坏掉”的情况。
- 如果文档回写滞后，团队会继续按旧入口开发，削弱新边界。
- 如果数据库 ownership 不回写到 schema/data-model 文档，后续服务仍会绕过边界直接写表。
