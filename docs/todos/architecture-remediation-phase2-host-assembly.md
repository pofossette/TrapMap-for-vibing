# Phase 2 — 宿主装配统一

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> 归属：`architecture-remediation-mainline.md` 的 delegated Phase 2。依赖 P1 薄层。

**Goal:** 根治 `AppModule` God Composition，`assembly(cordis)` 统一 `host-local` 与 `host-distributed`，三档 profile 能力表驱动。

**探针输入:** 清单 #1 #2 #3 #5 #35 #36（Host/O11y）

## Scope

- `packages/host-local/src/nest/app.module.ts` → 仅 `assembly.build(profile)`
- `packages/host-local/src/nest/runtime/backend-core-adapters.ts` (360) → `adapters/{identity,knowledge-write,knowledge-read,governance,candidate,job-runtime}.adapter.ts`
- `packages/assembly/src/capabilities/{otel,prometheus,loki,sentry,langfuse,consul}.capability.ts`
- `packages/assembly/src/profiles/{local-agent,team-monolith,distributed}.ts`
- `packages/host-distributed/src/gateway/{routes.ts,internal-client.ts,route-defs.ts}`

## 非目标

- 配置单源收敛归 P7，本 Phase 不改 `config.ts`；不改业务语义

## 改前/改后

```
before: AppModule 直 import 6 observability | adapters 360 单文件 | internal-client 1307
after:  assembly/capabilities/{otel,prometheus,loki,sentry,langfuse,consul}.ts
        runtime/adapters/{identity,knowledge-write,knowledge-read,governance,candidate,job-runtime}.ts 80-120
        host-distributed/gateway/{client,breaker,health-aggregator}.ts
```

## Tasks

- [x] **2.1 抽可观测 capability** — 6 模块各封装 `defineNode`，lifecycle 经 `shutdown-controller + startup-checks`，`AppModule` 0 直接 observability import
  - *Files:* `assembly/capabilities/*.capability.ts` `assembly/shutdown-controller.ts`
- [x] **2.2 拆 adapters 360** — 按 6 上下文拆，每 80-120 行，仅 `Port→PgPorts/Infra` 绑定，无业务判断
  - *Files:* `host-local/src/nest/runtime/adapters/*.adapter.ts`
- [x] **2.3 三档 profile 统一** — `local-agent/team-monolith/distributed` 在 assembly 声明能力集合与 RouteDef 表面差异，`monolith-route-defs.ts` 仅透传
  - *Files:* `assembly/profiles/*.ts` `host-local/src/nest/runtime/host-runtime.ts`
- [x] **2.4 Distributed 网关对齐** — `internal-client.ts 1307` 拆 `client.ts/breaker.ts/health-aggregator.ts`，`route-defs.ts 1460` 按资源拆，均经 `createNestAdapter/createFastifyAdapter` 消费同一 `RouteDef`
  - *Files:* `host-distributed/src/gateway/client.ts` `breaker.ts` `health-aggregator.ts`

## 完成标准

- `app.module.ts ≤120` 且 0 observability import；`backend-core-adapters` 无单文件 >150

## 测试（精确）

```bash
pnpm test:observability-closeout
pnpm test:discovery-closeout
pnpm test:distributed-closeout
pnpm exec fallow audit --base main
```

## 证据

- 变更文件：`assembly/capabilities/*` 6, `adapters/*` 6, `gateway/*` 3
- 测试名：`observability/discovery/distributed` closeout 绿

## 文档与测试

- [ ] 更新 `docs/architecture/ARCHITECTURE.md` 宿主章节；`docs/architecture/OBSERVABILITY.md` 增 capability 图
- [ ] `pnpm check:complexity` 与 `fallow audit` 绿

## Subagent 分派

| Subagent | 文件集 |
|---|---|
| B1 | `assembly/capabilities/*, profiles/*` |
| B2 | `host-local/src/nest/runtime/adapters/*, host-runtime.ts` |
| B3 | `host-distributed/src/gateway/*` |

