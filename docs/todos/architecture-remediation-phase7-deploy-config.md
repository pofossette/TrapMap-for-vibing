# Phase 7 — 部署与配置统一

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> 归属：`architecture-remediation-mainline.md` 的 delegated Phase 7。收口。

**Goal:** `envconfig` 单源，`apps/light/distributed` thin，一键分布式，`TRAPMAP_READ_IMPL` 显性。

**探针输入:** 清单 #35-38 + #5-6（宿主/部署）

## Scope

- `packages/host-local/src/nest/config/config.ts` 与 `packages/host-distributed/src/config/service-config.ts` → `envconfig` 单源校验
- `apps/light/package.json` `apps/distributed/package.json` thin 至 `bootstrap` only
- `docker-compose.yml` `profiles: ["distributed"]` 同时起 `postgres + go-accelerator(compute) + knowledge-read-go :4101 + otel-collector`
- `packages/host-distributed/src/gateway/routes.ts` `getKnowledgeReadGoConfig()` + `getGoAcceleratorConfig()` 健康聚合
- `docs/architecture/DEPLOYMENT.md` `docs/operations/ENVIRONMENT.md`

## 非目标

- 不改业务逻辑；`apps/*` 仅 bootstrap

## 环境变量清单

```
TRAPMAP_READ_IMPL=off|shadow|dual|go (default off)
DATABASE_URL, PG_POOL_MAX, REDIS_URL (optional)
OTEL_EXPORTER_OTLP_ENDPOINT, LOG_LEVEL
TRAPMAP_GO_ACCEL_CACHE_SIZE, TRAPMAP_GO_ACCEL_PROTO
```

## 改前/改后

```
before: host-local/config + host-distributed/service-config 双源 | compose 仅 go-accelerator
after:  envconfig 单源校验 fail-fast | compose --profile distributed 4 服务 | apps thin
```

## Tasks

- [ ] **7.1 配置单源** — `envconfig` 唯一校验，`TRAPMAP_READ_IMPL` 非法 fail-fast；`host-local` 无 `GO_*` 环境；`shadow 5% / dual 10%` 抽配置非硬编码
- [ ] **7.2 Compose 一键** — `docker compose --profile distributed up` 拉起全栈，`gateway /ready` 聚合 `knowledge-read-go/health` 与 `go-accelerator/ready`
- [ ] **7.3 Thin apps** — `apps/light` 与 `apps/distributed` 仅 `assembly.build(profile).bootstrap()`，无业务逻辑

## 完成标准

- `test:deployment-smoke && test:runtime-foundations` 绿；`docker compose config` 校验通过

## 测试（精确）

```bash
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm exec fallow audit --base main  # 校验 apps/* allowlist
docker compose --profile distributed config > /tmp/compose.out && cat /tmp/compose.out
```

## 证据

- 变更文件：`config/*` 2, `apps/*` 2, `docker-compose.yml`, `gateway/routes.ts`
- 测试名：`deployment-smoke / runtime-foundations` 绿；`compose config` 含 4 服务

## Deferred（非本次必改）

- `skill-registry vs skills` 边界、`mcp health` 暴露、`web-panel` 重叠 仅文档标注，入 `open-debt` deferred，不进本 Phase

## 文档与测试

- [ ] 更新 `DEPLOYMENT.md` 与 `ENVIRONMENT.md`；对齐 `OBSERVABILITY.md` 健康码 503/200 语义
- [ ] 补 gateway 四态 e2e

