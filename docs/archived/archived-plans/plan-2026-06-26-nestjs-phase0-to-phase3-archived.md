# NestJS 服务演进根计划历史归档

归档日期：2026-06-26

本文件归档了根 `plan.md` 中 Phase 0–3 的详细阶段描述和 Phase 4 closeout 执行前的冻结快照。归档后，根 `plan.md` 只保留索引职责；阶段细则仍在 `docs/todos/` 对应子计划中。

## Phase 0–3 阶段描述归档

### Phase 0 决策与目标架构冻结 [已完成]

- [x] 冻结长期目标：`Nest host + framework-free domain core + gradual service extraction`
- [x] 明确哪些现有包保留、拆分、重命名、退役
- [x] 冻结 HTTP contract、internal contract、event contract 的主线方案
- [x] 冻结轻后端形态：`embedded/local-agent -> team-monolith -> distributed` 三档运行模型
- [x] 完成当前 distributed 形态成熟度评估，冻结"过渡态分布式"基线判断
- 细则：[`docs/todos/nestjs-service-evolution-00-target-architecture.md`](../todos/nestjs-service-evolution-00-target-architecture.md)
- 成熟度评估：[`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](../todos/nestjs-service-evolution-distributed-maturity-assessment.md)

### Phase 1 宿主与 contract 基础收口 [已完成]

- [x] 建立首个 Nest 宿主主线，并验证可装配现有 `backend-core`
- [x] 收敛配置、异常映射、HTTP SDK、internal client 的重复实现
- [x] 冻结 contract-first 主线；OpenAPI 仅作为共享 contract 的派生导出
- [x] 建立 `in-process` / `remote` 双 adapter 策略，让轻后端不依赖跨进程 hop
- 细则：[`docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md`](../todos/nestjs-service-evolution-01-host-and-contract-foundation.md)

### Phase 2 模块化单体切换 [已完成]

- [x] 把核心 bounded context 收口到独立 domain/application 模块
- [x] 让默认开发形态切到 Nest modular monolith
- [x] 让旧 `server/host-*` 进入兼容层或迁移窗口
- [x] 让 `embedded/local-agent` 成为第一等入口
- 细则：[`docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md`](../todos/nestjs-service-evolution-02-modular-monolith-cutover.md)

### Phase 3 服务拆分与异步化 [已完成]

- [x] 按既有业务 ownership 抽出独立服务
- [x] 让同步/异步边界、队列、outbox、事件投影进入明确 owner
- [x] 建立单体与分布式双形态验证矩阵
- [x] 至少把一组过渡态服务提升到"成熟服务最小标准"（`knowledge-write + governance-review`）
- 细则：[`docs/todos/nestjs-service-evolution-03-service-extraction-and-async.md`](../todos/nestjs-service-evolution-03-service-extraction-and-async.md)
- 成熟度评估：[`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](../todos/nestjs-service-evolution-distributed-maturity-assessment.md)

## Phase 4 详细冻结内容归档

以下内容在 Phase 4 closeout 执行前已冻结到 `docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`，此处保留归档快照。

### 仓库级 Owner Matrix

| Surface | Data owner | Projection owner | Runtime owner | Operations owner |
|---|---|---|---|---|
| `gateway` | none | none | none | `gateway` |
| `identity-access` | session、member、team、access-key、RBAC、actor lookup truth | auth/session lookup projection | none | `identity-access` |
| `knowledge-read` | none | retrieval projection、read model、projection freshness | none | `knowledge-read` |
| `knowledge-write` | knowledge / trap / evidence / lifecycle / revision authoritative tables | none | none | `knowledge-write` |
| `governance-review` | review queue、feedback、remediation、maintenance/decay workbench | review queue、feedback、maintenance/decay operator projection | none | `governance-review` |
| `candidate-ingestion` | candidate intake、normalize、dedupe、analysis、resolution、lineage truth | candidate workflow / duplicate analysis operator projection | none | `candidate-ingestion` |
| `job-runtime` | none | queue / outbox / workflow / dead-letter runtime snapshots | queue、outbox、workflow、lease、retry、reclaim、dead-letter | `job-runtime` |

### 阶段门槛归档快照

- `Phase 0 -> Phase 1`：长期目标、运行模型、contract 主线、服务样板优先级已冻结 [已完成]
- `Phase 1 -> Phase 2`：Nest 宿主真实链路、统一装配面、internal port 双 adapter、旧宿主兼容窗口已写清 [已完成]
- `Phase 2 -> Phase 3`：monolith 默认主线已切到 Nest modular monolith、embedded 与 monolith 共用主实现面、bounded context 按 owner 收口、旧宿主不再承接新 authoritative orchestration [已完成]
- `Phase 3 -> Phase 4`：knowledge-write + governance-review 完成第一批成熟服务样板 closeout、distributed Level 3 大部分语义证据已齐、双形态验证矩阵已稳定 [已完成]

## 关联文档

- 当前根计划索引：[`plan.md`](../../plan.md)
- Phase 4 细则：[`docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`](../todos/nestjs-service-evolution-04-data-runtime-and-cutover.md)
- 文档索引：[`docs/README.md`](../README.md)
- 待办索引：[`docs/todos/README.md`](../todos/README.md)
