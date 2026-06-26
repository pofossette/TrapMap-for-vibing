# NestJS 服务演进 Phase 4

## 角色

- 状态：`proposed`
- 目标：完成数据 owner、运维面、迁移收尾和旧实现退役
- 本阶段定位：把 `Phase 3` 已冻结的服务边界收敛成仓库级 owner matrix、迁移窗口关闭标准和 closeout 执行清单；不在这里重新发明新的服务边界

## 交付物

- [ ] 读写 owner、投影 owner、队列 owner、容量与故障语义全部收口
- [ ] 旧宿主与重复 transport/client 退役计划执行
- [ ] 文档索引、truth source、测试矩阵与归档全部收尾
- [ ] distributed 从“过渡态拆分”提升到“成熟服务可声明”所需的剩余 owner 和运维面全部补齐

## 范围

- [ ] 数据库与读模型 owner
- [ ] 运行时 profile 与部署入口
- [ ] 兼容壳退役
- [ ] 迁移窗口关闭条件
- [ ] 成熟服务 closeout 判据

## 仓库级 Owner Matrix

### Owner 解释规则

- [ ] `data owner` 指 authoritative write truth、主表 owner 和最终状态解释责任
- [ ] `projection owner` 指读侧投影、operator workbench、freshness / lag / invalidation 解释责任
- [ ] `runtime owner` 指 queue / outbox / workflow / worker / reclaim / dead-letter 的运行时解释责任
- [ ] `operations owner` 指 health / readiness / ownership / metrics / backlog / capacity / rollout closeout 的 operator-facing 责任
- [ ] shared PostgreSQL 继续允许存在，但只能是“共享实例 + 明确表 owner”；不再允许“同库所以都能改”

### 服务矩阵

| Surface | Data owner | Projection owner | Runtime owner | Operations owner | 说明 |
|---|---|---|---|---|---|
| `gateway` | none | none | none | `gateway` | 只保留外部 API ingress、鉴权入口、request/trace 传递、错误映射和 profile-aware transport；不拥有业务真相 |
| `identity-access` | session、member、team、access-key、RBAC、actor lookup truth | auth/session lookup projection | none | `identity-access` | 作为基础 owner service；若 Phase 4 未完成独立成熟化，可继续保留在 Level 3 closeout 之后推进 |
| `knowledge-read` | none | retrieval projection、read model、projection freshness、query trace、cache/index status | none | `knowledge-read` | 只解释读侧 freshness / lag / invalidation；不拥有 write truth |
| `knowledge-write` | knowledge / trap / evidence / lifecycle / revision authoritative tables 与最终 aggregate mutation | none | none | `knowledge-write` | 写后只触发 projection refresh 和 canonical event；不承担 read projection 解释 |
| `governance-review` | review queue、feedback、remediation、maintenance/decay workbench、governance audit | review queue、feedback、maintenance/decay operator projection | none | `governance-review` | 拥有治理命令与 operator workbench；最终 aggregate mutation 必须委托给 `KnowledgeWritePort` |
| `candidate-ingestion` | candidate intake、normalize、dedupe、analysis、manual result、resolution、lineage truth | candidate workflow / duplicate analysis operator projection | none | `candidate-ingestion` | 最终 publish 必须委托给 `KnowledgeWritePort`；closeout 作为第二批成熟服务样板 |
| `job-runtime` | none | queue / outbox / workflow / dead-letter runtime snapshots | queue、outbox、workflow、lease、retry、reclaim、dead-letter、worker status | `job-runtime` | 只拥有 runtime substrate；不拥有任一业务 aggregate 决策 |

### Phase 4 必须冻结的剩余例外

- [ ] `knowledge-read` 可读取 projection seam、cache/index metadata，但不能反向写入 `knowledge-write` authoritative tables
- [ ] `governance-review` 允许通过命名 query seam 读取知识摘要或治理视图，但不得以 shared DB 为由直接改知识聚合
- [ ] `candidate-ingestion` 允许保留 duplicate / analysis / manual result 的本地事实表，但 publish success 之前不得把 candidate 标记为最终 resolved
- [ ] `job-runtime` 可观察各服务 follow-up 队列与 worker backlog，但不能解释业务层“为什么应该 approve / reject / publish”
- [ ] `packages/server` 若继续保留 runtime/status surface，必须显式标注 compatibility-only，不再提供 authoritative write path

## 迁移窗口关闭条件

### 总关闭条件

- [ ] 默认开发入口已经切到新的 `host-local` modular-monolith 主线，而不是旧 Fastify 宿主
- [ ] 默认测试矩阵已经以 `host-local` Nest 主线、`host-distributed` distributed 主线和 service README 为准
- [ ] 默认部署/环境文档已经只声明 `local-agent`、`team-monolith`、`distributed` 三档入口
- [ ] compatibility shell 上不存在新增主实现逻辑、新 contract、新 route-local shadow type
- [ ] 分布式 closeout 证据已经覆盖 owner / failure / backlog / readiness，而不是只覆盖 HTTP 200 通路

### Compatibility Shell 关闭条件

| Compatibility shell | 允许保留到 Phase 4 的职责 | 正式关闭条件 | 关闭后动作 |
|---|---|---|---|
| `packages/server` authoritative write compatibility routes | legacy route compatibility、runtime/status、显式 rollback path、旧测试夹具 | `dev:local-agent` / `dev:team-monolith` / docs/testing/deployment 全部不再依赖它；candidate/review/maintenance/decay authoritative path 已稳定由 owner service 承担 | 删除旧 authoritative write 入口；保留必要 runtime/status surface 或把剩余状态入口迁到新主线 |
| `packages/host-local/src/bootstrap/**`、`src/http/**`、`src/runtime/**` 旧 Fastify 路径 | rollback-only、parity fix、临时回退 | Nest modular-monolith 覆盖默认开发链路且 deployment smoke / runtime foundations / package tests 已稳定 | 封存或删除旧 Fastify 宿主路径；禁止再接新 controller / schema / business wiring |
| `packages/backend-core/src/modules/*.ts` compatibility re-export facade | import 迁移过渡层 | 仓库内主消费方已经切到六个 context 真实目录入口 | 删除 re-export facade，truth source 只指向真实 context 目录 |

### 非兼容壳但要继续保留的层

- [ ] `packages/host-distributed` 继续保留，角色是 distributed deployment layer、process bootstrap、remote adapter 和 service registration；它不是 compatibility shell，也不是第二套业务真相
- [ ] `packages/service-*` 继续保留，角色是 internal route / deps / server thin assembly；它们长期存在，但不得演化成 framework-free business fork
- [ ] `packages/host-local/src/nest/**` 继续保留并成为单体主实现宿主；这里是默认开发入口，不属于迁移窗口

## 可正式退役的 Compatibility Shell / 重复入口

### 可在 Phase 4 正式退役

- [ ] `packages/server` 中 candidate apply-resolution、knowledge review、maintenance batch、decay batch 的 authoritative write 入口
- [ ] `packages/host-local` 旧 Fastify gateway / bootstrap / runtime 写路径
- [ ] `packages/backend-core/src/modules/*.ts` 兼容 re-export facade
- [ ] 文档中仍把 `server` / 旧 Fastify 宿主写成默认开发入口的描述
- [ ] 文档中仍把 compatibility shell 写成 authoritative orchestration 的描述

### 仅在完成替换后可删除的重复 transport / client

- [ ] route-local 或 package-local shadow DTO / schema / error vocabulary
- [ ] 手拼 internal HTTP 调用而不是走 `in-process` / `remote` adapter 的调用面
- [ ] 与共享 contract 并行维护的重复 SDK / internal client 描述页
- [ ] 旧 transport 专用但已无调用方的 compatibility helper

### 本阶段不退役的内容

- [ ] `packages/host-distributed` gateway 与 service process 入口
- [ ] `packages/service-*` 内部 route / deps / server thin assembly
- [ ] shared PostgreSQL 本身；Phase 4 只要求 owner 显式化，不强制数据库物理拆分

## “成熟服务 closeout”任务分类

### 1. Owner Closeout

- [ ] 为 `gateway + 六个 owner service + job-runtime` 全部写清 data owner / projection owner / runtime owner / operations owner
- [ ] 把 shared DB 例外收敛成“命名例外 + 关闭条件”，不保留“大家默认都能读写”的灰区
- [ ] `knowledge-write + governance-review` 继续作为第一批成熟服务样板，成为 `Level 2 -> Level 3` 的正式验收模板
- [ ] `candidate-ingestion + knowledge-write` 作为第二批样板，至少冻结 publish boundary 和 resolve closeout 判据
- [ ] `knowledge-read`、`identity-access`、`job-runtime` 若尚未独立成熟化，必须明确写成“保留 owner、暂缓成熟服务 closeout”，而不是悬空

### 2. Operations Closeout

- [ ] 每个 owner service 都有独立 health / readiness / ownership 语义
- [ ] 每个需要异步 follow-up 的服务都有 backlog / retry / dead-letter / projection lag / timeout 解释入口
- [ ] `job-runtime` 能单独解释 lease、reclaim、dead-letter、worker backlog，而不是把所有运行时问题都推回业务 owner
- [ ] `knowledge-write` 能解释“最终写入已完成但 follow-up 未收敛”
- [ ] `governance-review` 能解释“命令已接收但最终 apply 未完成”
- [ ] `knowledge-read` 能解释 freshness / invalidation / projection lag
- [ ] distributed 若继续声明比单体更复杂，就必须证明带来隔离、伸缩或运维收益

### 3. Verification Closeout

- [ ] 单体与 distributed 双形态验证矩阵已经固定到文档，不再靠隐式经验解释“为什么这次算通过”
- [ ] `deployment-smoke`、`runtime-foundations`、服务级最小测试、distributed acceptance、runtime closeout 都有明确归属
- [ ] `eval:smoke` 仅在检索/摘要/治理/feedback/eval runner 相关变动时纳入 closeout，不作为所有 Phase 4 文档改动的机械前置
- [ ] docs-drift / structure guard 已覆盖新的默认入口、compatibility shell 角色和归档落点
- [ ] 剩余无法在本轮关闭的项必须转成独立后续计划，不继续挂在根 `plan.md`

## 执行顺序

### Step 1 冻结仓库级矩阵

- [ ] 把 owner matrix、shared DB 例外和 operations owner 规则回写到 `plan.md`、truth source、相关 README
- [ ] 确认 `knowledge-write + governance-review` 样板仍然是 Level 3 closeout 主模板
- [ ] 确认 `candidate-ingestion`、`knowledge-read`、`identity-access`、`job-runtime` 的剩余 closeout 范围

### Step 2 关闭迁移窗口

- [ ] 标记默认入口、默认测试矩阵、默认部署入口
- [ ] 关闭 compatibility shell 新增功能通道
- [ ] 列出立即删除、延后删除和长期保留的层

### Step 3 清理重复入口与 transport

- [ ] 删除旧 authoritative write 入口和重复 internal transport
- [ ] 合并重复 SDK/internal client 维护路径
- [ ] 清理文档中的旧入口、旧 profile、旧迁移语义

### Step 4 文档与测试矩阵收尾

- [ ] 回写 truth source、repo structure、docs index、testing matrix、archive record
- [ ] 增加必要的 docs-drift / structure guard，避免旧入口回流
- [ ] 在对应子计划中记录未关闭项和新的独立 follow-up

## 文档回写

- [ ] `plan.md`
- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] `docs/reference/REPO_STRUCTURE.md`
- [ ] `docs/README.md`
- [ ] `docs/operations/TESTING.md`
- [ ] `docs/operations/ENVIRONMENT.md`
- [ ] `docs/architecture/DEPLOYMENT.md`
- [ ] `docs/archived/archived-plans/` 归档记录
- [ ] 受影响服务 README

## 最小验证

- [ ] 受影响包最小测试集合
- [ ] `pnpm typecheck`
- [ ] `pnpm test:deployment-smoke`
- [ ] `pnpm test:runtime-foundations`
- [ ] `pnpm eval:smoke`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 完成定义

- 新主线已可自洽运行、测试、部署、文档化。
- 旧主线不再是仓库默认入口，也不会继续累积新功能。
- “成熟服务”所需的数据、投影、运维、部署判据已经闭环，而不是只剩分布式目录结构。
- 根 `plan.md` 重新退回索引职责；Phase 4 细节、验证与归档证据都已落到子计划和正式事实源。
