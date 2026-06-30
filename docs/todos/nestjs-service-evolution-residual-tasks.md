# NestJS 服务演进：残余任务收口

> 创建日期：2026-06-30
> 来源：归档 Phase 01/02/04 和 `backend-build-targets-plan.md` 中未完成项的去重整合
> 状态：活跃

本文档整合 NestJS 服务演进系列归档后仍成立的残余任务。已完成项不再重复，只保留代码库中可验证的未完成项。

---

## 1. `@trapmap/server` 脱钩（最大阻塞项）

`host-local` 仍有 **30+ 个 import** 依赖 `@trapmap/server/lib/*`，涵盖 config、session、RBAC、retrieval orchestration、store/repos、async transport、embeddings、graph-query、indexing adapters、event bus 等。这是 light 默认入口成熟化的最大阻塞项。

### 1.1 runtime / config owner 迁移

- [ ] 把 `packages/server/src/config.ts` 中仍属宿主的配置职责迁到 `host-local` 或共享 seam
- [ ] 把 `packages/server/src/lib/runtime/deployment-profile.ts` 的 runtime deployment 解析 owner 定到 `host-local`
- [ ] 把 health / readiness / route mounting owner 完全迁到 `host-local`
- [ ] 迁移完成后移除 `host-local` 对 `@trapmap/server` 顶层依赖

> 当前状态：`buildServer()` 已不在 `host-local` 中被引用，但底层库模块仍被大量使用。

重点文件：

- 现状源：`packages/server/src/config.ts`、`packages/server/src/lib/runtime/*`
- 目标落点：`packages/host-local/src/nest/config/`、`packages/host-local/src/nest/runtime/`

### 1.2 `packages/server` 最终形态

- [ ] 把 `packages/server` 中仍有价值的 runtime/status/helper 职责迁到明确 owner
- [ ] 迁完后 `packages/server` 只保留薄共享基础设施集合，不再承担默认宿主 + compatibility shell + legacy route pack 三重身份
- [ ] 确认 `packages/server/src/index.ts` 的启动脚本与 runtime deployment 解析已不再被默认链路依赖

---

## 2. 重复入口与 transport 清理

### 2.1 重复 transport / client / schema

- [ ] 删除 route-local 或 package-local shadow DTO / schema / error vocabulary
- [ ] 清理手拼 internal HTTP 调用，统一走 `in-process` / `remote` adapter
- [ ] 合并与共享 contract 并行维护的重复 SDK / internal client 描述页
- [ ] 删除已无调用方的旧 transport 专用 compatibility helper
- [ ] 把 `packages/host-local/src/nest/runtime/{host-services,shared-infra,retrieval-assembly}.ts` 对 `@trapmap/server` 的 store/repo/retrieval/async wiring 依赖收敛为 host-owned 或明确 shared seam

### 2.2 gateway schema 重复定义

- [ ] `packages/host-local/src/nest/gateway/gateway.schemas.ts` 的本地 `searchBodySchema` 替换为 shared contract schema（来源：static-analysis-audit §2.6）

---

## 3. 运维成熟度（Operations Closeout）

以下项来自 Phase 04 的 Operations Closeout，均未完成：

### 3.1 每个 owner service 的运维面

- [ ] 每个 owner service 都有独立 health / readiness / ownership 语义
- [ ] 每个需要异步 follow-up 的服务都有 backlog / retry / dead-letter / projection lag / timeout 解释入口
- [ ] `job-runtime` 能单独解释 lease、reclaim、dead-letter、worker backlog
- [ ] `knowledge-write` 能解释"最终写入已完成但 follow-up 未收敛"
- [ ] `governance-review` 能解释"命令已接收但最终 apply 未完成"
- [ ] `knowledge-read` 能解释 freshness / invalidation / projection lag

### 3.2 文档措辞

- [ ] 文档对 `host-local`、`host-distributed`、`service-*` 的叙事不再依赖"迁移期暂存"措辞

---

## 4. 客户端后端形态配置项（Phase 3）

- [ ] 在客户端状态中新增 `backendTarget: 'light' | 'heavy'` 配置项，默认 `'light'`
- [ ] 明确该配置项只影响客户端提示和诊断展示，不改变"单一 gateway URL"事实
- [ ] CLI 配置读写、默认值、兼容旧配置文件的迁移规则
- [ ] 评估 web-panel 是否需要相同配置语义

重点文件：

- `packages/cli/src/lib/config.ts`
- `packages/client-core/src/http/api-request.ts`
- `packages/client-core/src/session/session-provider.ts`
- `docs/architecture/components/CLIENT.md`

---

## 5. 静态分析审计清理

> 来源：`docs/todos/static-analysis-audit-2026-06-29.md`，2026-06-29 审计，382 问题零处理。

### 5.1 高优先级删除

- [ ] 删除 4 个未注册迁移脚本：`packages/server/src/lib/persistence/migrate-artifacts.ts`、`migrate-candidates.ts`、`migrate-identity-audit.ts`、`migrate-knowledge.ts`
- [ ] 删除 `packages/server/src/lib/decay/application-service.ts`（零导入，205 行）
- [ ] 删除 `packages/server/src/lib/types.ts`（无人引用的 barrel）
- [ ] 删除 `scripts/codemods/relative-to-alias.cjs`（未注册 codemod）

### 5.2 死 barrel 清理

- [ ] 删除 7 个未使用 barrel：`packages/server/src/lib/retrieval/{orchestration,scoring,recall,response,graph-plan,capsules}/index.ts` + `packages/server/src/lib/workflows/index.ts`

### 5.3 占位实现收口

- [ ] 实现或标记 versioned decay 为 experimental：`packages/server/src/lib/decay/freshness.ts:148-157`
- [ ] CLI entry fallback 渲染：`packages/cli/src/lib/markdown-formatter.ts:216`
- [ ] Artifact `derived: null`：`packages/server/src/lib/artifacts/model.ts:273`

### 5.4 contracts 死导出

- [ ] 清理或标记 `packages/contracts/src/domain/async.ts`（~750 行零消费）

---

## 6. 最小验证闭环

以下验证命令在各归档 Phase 中从未被统一跑过。残余任务收口前应至少跑一轮确认不回归：

- `pnpm typecheck`
- `pnpm test:deployment-smoke`
- `pnpm test:runtime-foundations`
- `pnpm check:docs-drift`
- `pnpm check:structure`
- 若触及 retrieval / governance / feedback：`pnpm eval:smoke`

---

## 执行优先级

| 优先级 | 类别 | 预估工作量 |
|---|---|---|
| P0 | §5.1 高优先级删除 | 半天 |
| P0 | §5.2 死 barrel 清理 | 1 小时 |
| P0 | §1.1 runtime/config owner 迁移 | 2-3 天 |
| P1 | §2 重复 transport 清理 | 1-2 天 |
| P1 | §5.3-5.4 占位实现 + 死导出 | 半天 |
| P1 | §6 最小验证闭环 | 半天 |
| P2 | §3 运维成熟度 | 按需 |
| P2 | §4 客户端 backendTarget | 1-2 天 |
| P2 | §1.2 server 最终形态 | 依赖 §1.1 完成 |

---

## 证据入口

- `packages/host-local/src/index.ts`（Nest 入口已生效）
- `packages/host-local/src/nest/app.module.ts`（六模块注册）
- `packages/server/src/config.ts`（仍被 host-local 依赖）
- `packages/server/src/lib/decay/freshness.ts`（versioned decay 占位）
- `docs/todos/static-analysis-audit-2026-06-29.md`（完整审计报告）
- `docs/todos/backend-build-targets-plan.md`（轻重后端构建目标主计划）
- `docs/todos/open-debt-and-compromises.md`（活跃 debt register）
