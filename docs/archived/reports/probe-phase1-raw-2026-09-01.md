## Probe A — 结构与边界 入手点（中立探索，无预设）
1. `packages/host-local/src/nest/app.module.ts` 集中装配 6 上下文 + 6 可观测模块，改一域需触宿主
2. `backend-core-adapters.ts 360行` + `runtime/*.ts 1638行` 仍集中，profile 差异靠分支
3. `packages/host-local/src/nest/gateway/gateway.route-defs.ts 291行` 薄层但仍偏厚
4. 多个 `// fallow-ignore-file complexity/code-duplication` 在 `service-governance-review/routes.ts` 头部，显示阈值被绕过
5. `.fallowrc.json` 中 `assembly` zone 已定义但仅在 host-local 部分接线，host-distributed 未完全统一
6. `packages/db/src/schema/` 仍为 560+449 行大文件，`service-*/schema.ts` 仅 re-export 假象的 Owner-Local
7. `packages/contracts/src/domain/operations.d.ts 5187行` 单文件过载，修改风险高
8. `packages/service-knowledge-read/src/retrieval-recall-coordinator.ts 586行` 编排与通道实现耦合
9. `packages/service-governance-review/src/routes.ts 914行` 与 `service-knowledge-write 826行` 单文件承载多资源
10. `packages/infra/src/go-accelerator/` 同时维护 client + fallback 双路径，网关需同时聚合两个 Go 健康
11. `apps/light` 与 `apps/distributed` 仍含部分装配逻辑，未完全 thin
12. `docs/todos/README.md` 并行轨已达 4 条，存在多主线并行治理压力
## Probe B — 持久化与索引 入手点
1. `packages/db/src/schema/knowledge.ts 560行` 7 张知识表集中，`candidates 154` 等分散不均
2. `packages/db/src/schema/artifacts.ts 449行` 11 张工件表集中，子表与 JSONB 缓存双写
3. `conflict_relations` 仅在 `service-governance-review/drizzle` 存在，未进 `packages/db` 真源，双源例外
4. `store_snapshot` 在迁移 SQL 残留，guard 已排除但文档仍需标注
5. `candidates.analysis jsonb+GIN` 与 `candidate_duplicate_cases.matches jsonb+GIN` 低频字段 GIN 是否过度
6. `knowledge_search_documents (tsvector+GIN, tokens GIN)` 与 `knowledge_embeddings HNSW` 索引策略未在代码注释与迁移对齐说明
7. `task_queue` 出队依赖 `ORDER BY ... LIMIT 1 FOR UPDATE SKIP LOCKED`，无 `pending_dequeue` 单独索引
8. `domain_event_outbox` 与 `knowledge_entries` 同事务写入已收敛但 `task_queue` lease 回收分散在多处
9. `cron_jobs 31行` 单表独立，但 `workflow_runs` 与 `task_queue` 关系未显性建模
10. 42 表总量已从 55 压至 42，但仍有 11 张工件表可进一步审视是否可合并 `manifest_items` 三合一
11. `label_aliases / canonical_labels / embeddings` 4 张标签表与 `experience_genes` 3 张是否可复用向量表
## Probe C — 检索与知识读 入手点
1. `service-knowledge-read/src/retrieval-recall-coordinator.ts 586行` + `retrieval-infra-default.ts 239` + `retrieval-semantic.ts 220` 形成热点簇
2. `search-knowledge.ts 391行` 同时承载 v1/v2/v3 三版本逻辑，分层不清晰
3. `ChannelRegistry / StrategyRegistry` 已存在但 `keywordChannel` 与 `semanticChannel` 实现仍散落在不同文件
4. `graph-query.ts 167` + `graph-query-core.ts 162` + `graph-index-repository.ts 116` 图链路分散，未统一 Port
5. `retrieval-read-model-cache.ts 61行` 与 Go `lru.go 61行` 各自实现，无统一失效协议
6. `response-assembly.ts / response-citations.ts / response-summary.ts` 组装阶段文件过小且分散，边界模糊
7. `skill-lookup` 相关 `artifact-entry-merge.ts 135` 与 `experience-gene-retrieval.ts 295` 检索路径并行，存在重复召回
8. `rag-log.ts` 与 `read-model.ts` 日志与读模型耦合
9. 检索全量经 `POST /v1/retrieval/search` 网关，但 v2/v3 在宿主间 parity 不一致，CLI --v2 可能 404
10. `batchCosineWithFallback` 仅在 `distributed` 且 `entries>1` 时走 Go，host-local 恒走 JS，行为分支未显性测试覆盖
## Probe D — Go 服务与 Infra 入手点
1. `services/go-accelerator` (Go 1.22, chi 5.2.1) 与 `services/knowledge-read-go` (Go 1.23) 双 Go 栈并存，go.mod 版本不一致
2. `go-accelerator` 已标记 `DEPRECATED` 部分端点 410，但 `handlers/ranking.go + retrieval.go` 代码仍残留
3. `knowledge-read-go` 6 模块 1348 行已模块化，但 `handler.go 134行` + `recall/store/pg.go 58行` 直连 pg，DB 边界未完全 Port 化
4. `services/go-accelerator/internal/service/vector/vector.go` 64-shard 并行与 `services/knowledge-read-go/internal/query/domain/embedding.go 32行` 功能重叠
5. `packages/infra/src/go-accelerator/client.ts` 与 `fallback.ts` 双文件维护超时/回退，fallback 计数未统一进 `observability/metrics.go`
6. `gateway health` 需同时聚合 `go-accelerator/ready` 与 `knowledge-read-go/health`，依赖 `TRAPMAP_READ_IMPL` 四态开关
7. `services/go-accelerator/Dockerfile` 与 `services/knowledge-read-go/Dockerfile` 双 Dockerfile，`docker-compose.yml` profile distributed 仅声明前者
8. `proto/trapmap/compute/v1/compute.proto` 仅 batchCosine 二进制时启用，开关 `TRAPMAP_GO_ACCEL_PROTO` 未在文档与代码对齐
9. `embedding cache LRU 10k + singleflight` 仅 Go 侧，Node 侧无对应，分布式一致性未定义
10. `go vet/test/golangci-lint` 门禁已在 `GO_TECH_STACK.md` 声明但 CI 未强制 6 包全绿
## Probe E — 契约与类型 入手点
1. `packages/contracts/src/domain/operations.d.ts 5187` + `review 2663` + `knowledge 2560` + `retrieval 2295` 单体过载
2. `packages/contracts/test/index.test.ts 3424行` 单测文件过长，难以定位失败
3. `Zod → JSON Schema → Go types` P0 链路已通但 `contracts/json-schema/go-accelerator/*` 与 `knowledge-read-go` 双链路并存
4. `oapi-codegen + validator` 在 `GO_TECH_STACK.md` 已选型但未在 `services/knowledge-read-go` 落码
5. `pkg/api/types.go` 中 `payload json.RawMessage` 与 `sha256Hex ^[0-9a-f]{64}$` 校验未在 TS 侧显性对齐
6. `service-*` 与 `host-*` 对 `contracts` 的导入仍有深路径 `src/domain/*`，未全走 `index.ts` 出口
7. `lib` 中 `canonicalJsonStringify / sha256 / cosineSimilarity` 与 Go 侧实现需字节一致但测试仅抽样
8. `contracts` 作为最底层叶子，不应依赖 `lib`，但 `lib` 工具被多包直接消费边界模糊
## Probe F — 宿主与可观测/部署 入手点
1. `host-local/src/nest/observability/` 6 模块 (otel, prometheus, loki, sentry, langfuse) 在 `AppModule` 直接 import
2. `packages/host-local/src/nest/runtime/exception.filter.ts 212行` 异常处理集中，未拆按上下文
3. `packages/host-distributed/src/gateway/internal-client.ts 1307行` 单文件过长，含 breaker/health/client 三职责
4. `packages/host-distributed/src/gateway/route-defs.ts 1460行` 网关路由聚合过厚
5. `packages/host-local/src/nest/config/config.ts` 与 `host-distributed/src/config/service-config.ts` 双配置源，`envconfig` 未统一
6. `docker-compose.yml` `profiles: ["distributed"]` 仅描述 `go-accelerator`，`knowledge-read-go :4101` 需手动开关
7. `apps/light` 与 `apps/distributed` 仍含 thin 以外的逻辑，`assembly.build(profile).bootstrap()` 未完全统一
8. `TRAPMAP_READ_IMPL=off|shadow|dual|go` 四态在 gateway 分支，metrics 采样率 (shadow 5% / dual 10%) 硬编码
9. `pnpm check:complexity` 9 预算中 `app.module 288/350` 已接近阈值
10. `docs/architecture/OBSERVABILITY.md` 与 `docs/operations/OBSERVABILITY-OPERATIONS.md` 对健康码 503/200 语义有细微差异
## Probe G — 客户端与技能 入手点
1. `packages/skill-registry` 已抽离但 `packages/skills` 与 `skill-registry` 职责边界未在 `BOUNDARIES.md` 显性
2. `packages/client-core` 与 `apps/cli` / `apps/web-panel` 依赖 `contracts` 但 `client-core` 单测覆盖未明确
3. `packages/skills/workflow-with-trapmap/SKILL.md` 等 Skill 工作流与 `service-knowledge-write` 派生管线耦合点未显性
4. `mcp` zone (`apps/mcp`) 仅依赖 `client-core/lib` 但健康检查未在 gateway 暴露
5. `web-panel` 已暂停 (paused successor)，但 `docs/plans/web-panel-feature-and-ui-optimization-paused.md` 与 `knowledge-read-go` 组装能力有潜在重叠
6. `skill-lookup` 的 `artifact-first` 实现与 `knowledge-read` 的 `capsule` 检索存在概念重叠，文档未统一术语
7. `evals/retrieval` 与 `evals/summary` 的评测入口与 `pnpm eval:smoke` 的 tier 定义在 `TESTING.md` 中分散
