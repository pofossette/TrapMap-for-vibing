# Phase 1 — 路由与检索解耦

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> 归属：`architecture-remediation-mainline.md` 的 delegated Phase 1。零语义变更，仅结构解耦。

**Goal:** 消灭 `914/826/586/391` 四热点与 `fallow-ignore` 豁免，路由按资源拆，检索按通道拆。

**探针输入:** 清单 #4 #7 #8 #9 #16-22（7 探针合并）

## Scope

- `packages/service-governance-review/src/routes.ts` → `routes/{queue.routes.ts,feedback.routes.ts,maintenance.routes.ts,admin.routes.ts,helpers.ts}`
- `packages/service-knowledge-write/src/routes.ts` → `routes/{knowledge.routes.ts,submission.routes.ts,knowledge-helpers.ts}`
- `packages/service-knowledge-read/src/{retrieval-recall-coordinator.ts,search-knowledge.ts,retrieval-infra-default.ts,retrieval-semantic.ts}`
  → `recall/{hybrid-channel.ts,semantic-channel.ts,graph-channel.ts,channel-registry.ts}` + `search/{search-v2.ts,search-v3-plan.ts}`
- `packages/host-local/src/nest/gateway/gateway.route-defs.ts` 瘦身

## 非目标

- 不改检索语义与排序分数；不新增表；不接 Cache Port（P5 定义后 P1-C3 再接）

## 改前/改后文件树

```
before: routes.ts 914 + 826 | coordinator 586 | search 391 | gateway.route-defs 291
after:  governance/routes/{queue,feedback,maintenance,admin}.ts ≤280
        knowledge/routes/{knowledge,submission}.ts ≤250
        recall/{hybrid,semantic,graph}-channel.ts ≤120 + channel-registry.ts
        search/{search-v2,search-v3-plan}.ts ≤180
        host-local/gateway/gateway.route-defs.ts ≤150 (仅 host-local, distributed 归 P2)
```

## Tasks

- [x] **1.1 拆 governance-review 914** — 按 `queue/feedback/maintenance/admin` 资源拆，每文件 ≤280，`helpers.ts` 放 `GOVERNANCE_REVIEW_OWNERSHIP` 常量与 Zod schemas；对外仍 `createGovernanceReviewRouteDefs` 聚合，移除头部 `// fallow-ignore-file`
  - *Files:* `routes/queue.routes.ts` `feedback.routes.ts` `maintenance.routes.ts` `admin.routes.ts`
- [x] **1.2 拆 knowledge-write 826** — `knowledge.routes.ts` 承载 entry/revision 生命周期，`submission.routes.ts` 承载提交/审核快照，复用 `artifact-ports.ts`
  - *Files:* `routes/knowledge.routes.ts` `routes/submission.routes.ts`
- [x] **1.3 拆 recall coordinator 586** — 仅保留编排，抽三通道各 ≤120 至 `recall/*`，`ChannelRegistry + StrategyRegistry` 统一注册，`retrieval-orchestration.ts 59` 归口
  - *Files:* `recall/hybrid-channel.ts` `semantic-channel.ts` `graph-channel.ts` `channel-registry.ts`
- [x] **1.4 拆 search-knowledge 391** — 保留 v1 `semantic|hybrid|graph-assisted`，`search-v2.ts` 胶囊原生，`search-v3-plan.ts` trap-first
  - *Files:* `search/search-v2.ts` `search-v3-plan.ts`
- [x] **1.5 网关瘦身（仅 host-local）** — `packages/host-local/src/nest/gateway/gateway.route-defs.ts` 仅聚合与鉴权委托，`host-distributed` 归 P2，目标 ≤150 行

## 反例（禁做）

- 禁在拆分中改业务分支；禁跨 Phase 改 cache

## 测试（精确）

```bash
pnpm --filter @trapmap/service-governance-review test --run test/routes.test.ts
pnpm --filter @trapmap/service-knowledge-read test --run test/routes.test.ts
pnpm --filter @trapmap/service-knowledge-read test --run test/retrieval-recall-coordinator.test.ts
pnpm check:complexity && pnpm exec fallow audit --base main
```

## 证据

- 变更文件：`routes/*.ts` 4+2, `recall/*` 4, `search/*` 2
- 命令：见上
- 测试名：`governance routes / knowledge-read routes` 绿

## 完成标准

- 四热点均 ≤300 行（`wc -l`），0 `fallow-ignore-file` 残留
- `pnpm --filter @trapmap/service-governance-review test --run test/routes.test.ts` 与 `service-knowledge-read/test/routes.test.ts` 绿
- `pnpm exec fallow audit --base main` 0 豁免

## 文档与测试

- [ ] 更新 `docs/architecture/BOUNDARIES.md` 删豁免说明；`docs/architecture/components/RETRIEVAL.md` 增通道注册表图
- [ ] `pnpm check:complexity` 新阈值绿

## Subagent 分派

| Subagent | 文件集 | 禁止 |
|---|---|---|
| A1 | `service-governance-review/routes/*` | `service-knowledge-read/*` |
| A2 | `service-knowledge-write/routes/*` | `assembly/*` |
| A3 | `service-knowledge-read/recall/*, search/*` | `host-local/app.module.ts` |

