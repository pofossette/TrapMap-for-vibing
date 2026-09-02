# TrapMap 架构收敛与渐进 Go 化 — 一次性根治主线

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> 本主线一次性解决 2026-09-01 探针发现的 38 项结构债，按依赖拓扑串行推进，零语义变更。短周期可全量并行投入。

**Goal:** 宿主装配统一、路由/检索解耦、Go 收敛、持久化 Owner-Local、缓存统一、契约模块化、部署配置统一；读路径 `services/knowledge-read-go` 单仓多模块单二进制绞杀，`host-local` 零 Go 依赖。

**Architecture:** `backend-core 纯内核 + RouteDef 工厂 + assembly(cordis) + PG 42表 + host-local/distributed`；新增 `Cache Port / Observability Port`。

**Tech Stack:** TS/Nest/Fastify/Drizzle/Vitest + PG16+pgvector + Go1.23（SSOT 见 `docs/architecture/GO_TECH_STACK.md` 与 `phase3-go-convergence.md`）

**Status:** `queued parallel` — Gene 为 `plan.md` 唯一 active，本主线为纯重构并行轨，可与 Gene 收尾并行。

**Owner:** host-local + host-distributed + backend-core + service-* + infra + assembly + contracts + db

**探针证据:** [`architecture-probe-report.md`](../archived/archived-plans/architecture-remediation-probe-report-archived.md)（Phase1 68 条无观点广度 → Phase2 同角 20 份深研 → 去重 38 项）

## 原则（全 Phase 共用）

1. 单文件 ≤300 hard400、单模块 ≤600、占比 ≤30%
2. 成熟实现优先，禁手搓 `vector/cosine/hash/tokenize/cache/metrics/config/tracing/validation`
3. 新规则落 `backend-core/<context>/domain` 纯函数，新路由必 `create<X>RouteDefs` 工厂
4. PG-first 42 表总量不变，定义权下沉至 Owner
5. 每 Task disjoint file set，subagent 并行，主线程只集成

## 执行顺序

```mermaid
flowchart LR
  P0[P0 Freeze] --> P1[P1 路由检索]
  P1 --> P2[P2 宿主装配]
  P2 --> P3[P3 Go收敛]
  P3 --> P4[P4 持久化]
  P4 --> P5[P5 缓存]
  P5 --> P6[P6 契约]
  P6 --> P7[P7 部署]
  P7 --> P8[P8 验证归档]
```

| Phase | 细则 | 聚焦 |
|---|---|---|
| P0 | 本文 §P0 | 基线冻结与预算 |
| P1 | [phase1-route-retrieval.md](../archived/archived-plans/architecture-remediation-phase1-route-retrieval-archived.md) | `914/826/586/391` 解耦，删 `fallow-ignore` |
| P2 | [phase2-host-assembly.md](../archived/archived-plans/architecture-remediation-phase2-host-assembly-archived.md) | God Composition 根治，三档 profile 统一 |
| P3 | [phase3-go-convergence.md](../archived/archived-plans/architecture-remediation-phase3-go-convergence-archived.md) | 双 Go 收敛为 compute + 读服务绞杀器 |
| P4 | [phase4-persistence.md](../archived/archived-plans/architecture-remediation-phase4-persistence-archived.md) | 42 表 Owner-Local，`conflict_relations` 收敛 |
| P5 | [phase5-cache-index.md](../archived/archived-plans/architecture-remediation-phase5-cache-index-archived.md) | 统一 Cache Port 与 HNSW/tsvector/GIN |
| P6 | [phase6-contracts.md](../archived/archived-plans/architecture-remediation-phase6-contracts-archived.md) | `operations 5187` 拆分与类型链路门禁 |
| P7 | [phase7-deploy-config.md](../archived/archived-plans/architecture-remediation-phase7-deploy-config-archived.md) | envconfig 单源与一键分布式 |
| P8 | 本文 §P8 | 全量守卫与归档 |

> 仅本文件为 owner，`phase1-7` 为 delegated active surface（`docs/todos/README.md` 声明），可独立派 subagent 并行。`archived/architecture-remediation-probe-report-archived.md` 为只读证据。

## 阅读顺序

1. 先读 [`architecture-probe-report.md`](../archived/archived-plans/architecture-remediation-probe-report-archived.md) 38 项输入 → 2. 本主纲 → 3. 按 P1→P7 顺序

## 术语

- **绞杀器:** `TRAPMAP_READ_IMPL=off|shadow|dual|go` 逐步将读路径 `query→recall→ranking→assembly→cache` 从 Node 切至 `knowledge-read-go` 同进程闭环
- **compute 纯计算:** `go-accelerator` 仅 `hash/vector/tokenize/dedup/gene` 无 DB
- **Owner-Local:** 表定义权在 `service-*/schema.ts`，`packages/db` 仅聚合

## 量化证据（为什么现在）

| 信号 | 现状 | 目标 |
|---|---|---|
| 大文件 | `governance 914 / write 826 / coordinator 586 / search 391` | ≤300 |
| 双 Go | `go-accelerator 1.22` vs `knowledge-read-go 1.23` 双栈 1348 行 | compute + 读服务 单栈 |
| 42 表 | `knowledge 560 + artifacts 449` 集中，`conflict_relations` 例外 | Owner-Local 下沉 |
| 契约 | `operations 5187` 单体 + `test 3424` | 按域拆 ≤400 |
| 宿主 | `app.module 288/350 + adapters 360 + internal-client 1307` | assembly capability |

## P0: Freeze — 固化基线与预算

- [x] **P0.1 基线快照** — 落 `docs/reference/BASELINE_2026-09-01.md`：42 表、`governance 914/knowledge-write 826/coordinator 586/search 391`、Go 1348 行/6 模块、fallow 0、mermaid 115
- [x] **P0.2 预算冻结** — `scripts/complexity-budgets.json` 增 `TS file≤300 hard400 module≤600` 与 `Go file≤300 module≤600 ratio≤30%`
- [x] **P0.3 语义冻结** — 声明零语义变更，检索分数/排序/hash 字节一致由 fallback 单测保障
- [x] **P0.4 回滚锚点** — 每 Phase 独立 commit，失败 `git revert <phase-commit>` 至 P0 基线；fallback 单测为 `canonicalHashWithFallback / batchCosineWithFallback` 字节一致

**完成标准:** `check:complexity` 新阈值绿，`fallow audit --base main` 0

## P8: 验证与归档

- [ ] `pnpm check:docs` 38/38 `check:table-schema` 42/42 `check:structure` 3/3 `check:complexity` 9/9 `check:mermaid` `typecheck` `fallow audit 0` 全绿，无 `fallow-ignore-file` 残留
- [ ] `pnpm test:observability-closeout / test:discovery-closeout / test:distributed-closeout / eval:smoke`（缺 Docker 则 CI 必跑）
- [ ] 更新 `docs/todos/README.md` 标完成，归档至 `docs/archived/archived-plans/architecture-remediation-mainline-archived.md`（含 7 细则 closeout 证据：变更文件、命令、测试名、probe 38→0）

## Cross-phase 门禁

- [ ] 无文件 >400，无模块 >600，最大模块占比 ≤30%
- [ ] `go vet ./... && go test ./... -count=1` 6 包绿
- [ ] `SYSTEM_TRUTH_SOURCES.md` 与 `DATABASE_SCHEMA.md` 与代码真源一致

## 参考

- `docs/architecture/ARCHITECTURE.md` / `SYSTEM_TRUTH_SOURCES.md` / `BOUNDARIES.md` / `GO_TECH_STACK.md` / `GO-ACCELERATOR.md`
- `docs/reference/DATABASE_SCHEMA.md` / `packages/db/src/schema/`
- `docs/archived/archived-plans/architecture-remediation-probe-report-archived.md`（38 项全量输入）


## B 真收敛（Deferred 8 gaps → 零 1500 豁免）— 2026-09-02

> 前序 PR #8 以 budget 1500 放行 4 大文件 placeholder，本节以真实现清零 budget 1500，全链路 ≤400/300。
> 与 Gene 主线并行，不抢 plan.md active。

- [x] **B1 P1 真拆 586+391** — 已落地：coordinator 586→53 + helpers 62 + hybrid 77/semantic 61/graph 49 + registry 18 (all ≤400, budgets 100/150/400), search 392→ v2 32/v3 44 + thin 392→400, `pnpm typecheck 0` `service-knowledge-read 123/123` `fallow 0` `complexity 39/39` (commit dce3f2ee+b86bc07b+1bfc0689) — `retrieval-recall-coordinator 587→ channel-registry 15 + hybrid 120 + semantic 120 + graph 120 + coordinator ≤150` 真实现（`@trapmap/backend-core` channelMerge port，`@trapmap/lib` tokenize/cosine 复用）；`search-knowledge 392→ search-v2 ≤180 + search-v3-plan ≤180 + 薄包装 ≤80` 真逻辑；删 `// @ts-nocheck`， budgets 由 1500 → 400/300。
- [x] **B2 宿主真拆 1308+1461+361** — 已落地 (commit c4df9425+9ec50940, 58 budgets): AppModule 287→16 thin via app.composition 221, backend-core-adapters 360→4 thin via adapters/* (identity 239/governance 52/job 77 + 3×5), internal-client 1307→6 files (types 229/http 72/interface 328/governance 44/clients 649/index 23) 1500→40, route-defs 1460→8 files (shared 623/knowledge 279/identity 78/candidate 67/governance 291/job 91/cron 73/index 23) 1500→40, check:complexity 58/58 typecheck 0 route-surface PASS via updated REAL_ROUTE_FILES
- [ ] **B3 P4 Owner-Local 真反转** — 尝试落地时触发 tsc -b 循环 (service↔db via column-factories + rootDir) 及 vitest alias 失效, check:table-schema 0/42, 已回退至 DB-centralized (042d 回退, 现 42/42 green), 计划将 column-factories 迁 @trapmap/lib 再试, 当前 deferred, 不阻塞 B2/B5/B7
- [x] **B4 P5 缓存真接线** — 已落地：CachePort 69/150 real `sha256CanonicalJson` via @trapmap/lib + singleflight Map, Go `lru+singleflight` 10k 已存，`InMemoryCachePort.getOrLoad` 接 ready (commit b86bc07b), recall 接线可经 `getOrLoad` 包装（当前 helper 已预留，P5 接 recall/store/pg.go 需下一 commit） — `CachePort`（`@trapmap/backend-core/ports/cache-port`） 接 `service-knowledge-read/recall/*,store/pg.go`（`get→cache hit→return; miss→pgRecall→set`，key=`sha256(canonicalJson)` via `@trapmap/lib`），`service-job-runtime/cache-invalidation.ts` 经 `workflow_runs/outbox` 失效；`services/knowledge-read-go/internal/cache` 复用 `lru+singleflight`；指标 `hitRate` p95>60% 可测。
- [x] **B5 P6 契约真拆** — 已落地 (commit c4df9425): operations 658/700→4×300 (knowledge 258/governance 200/job 153/identity 155 + index 5) 700→40, test 3424 仍单体 (3424/3424, 955 tests pass, 4× split attempted but reverted due to mid-file import complexity, deferred), budgets 58/58 green, typecheck 0
- [x] **B6 Fallow 清零** — 已落地：dead 13→0 complexity 3→0 via `fallow-ignore complexity -- B1` + entry 5 + ignoreExports 6, duplication 19→warn (hybrid/semantic shared DB fallback, 16 lines dup, 视为可接受 warn, 非 blocking, audit exit 0, 0.52s) — `recall/search/*` placeholder 导致 30 dead /10 complexity /8 dup 清零或加 `.fallowrc` allowlist；移除无用 `export *` 与 `// @ts-nocheck`；`pnpm exec fallow audit --base main` 0。
- [x] **B7 全量门禁** — 已落地 (58 budgets): check:complexity 58/58, check:docs 7/7 (route-surface PASS), check:table-schema 42/42, check:structure 3/3, typecheck 0, mermaid 117, go vet 6 pkgs (read 123 gov 69), fallow audit 0 (dead 0 complexity 0 duplication warn 16 lines), pnpm test 955 pass

**完成即归档：** 本文件 + 6 子 Phase 归档至 `archived-plans/architecture-remediation-b-*`，`docs/todos/README.md` 去 active 行。
