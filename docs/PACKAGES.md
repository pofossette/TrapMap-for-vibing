# TrapMap 包结构

各包职责与入口，技术栈选择见 [PACKAGE_STACK_RATIONALE.md（已归档）](archived/PACKAGE_STACK_RATIONALE.md)。

## 包概览

| 包 | 入口 | 职责 |
|---|---|---|
| `packages/contracts` | `src/index.ts` | 共享 Zod Schema 与类型，唯一契约真源 |
| `packages/backend-core` | `src/index.ts` | 后端核心内核：六 bounded-context 的 `domain` 纯规则 + `application` + `ports` + `RouteDef` |
| `packages/db` | `src/schema/` | 42 表 Drizzle schema 真源（owner-local） |
| `packages/assembly` | `src/index.ts` | 统一组装中心（cordis TS 组合器） |
| `packages/lib` | `src/index.ts` | 纯函数工具（time/hash/string/collection） |
| `packages/ai-providers` | `src/index.ts` | AI provider 工厂与 prompt 模板 |
| `packages/client-core` | `src/index.ts` | Gateway HTTP SDK、会话与错误模型 |
| `packages/service-identity-access` | `src/index.ts` | identity-access 服务（含路由与 repo） |
| `packages/service-knowledge-write` | `src/index.ts` | knowledge-write 服务（权威写路径） |
| `packages/service-knowledge-read` | `src/index.ts` | knowledge-read 服务（检索读侧） |
| `packages/service-candidate-ingestion` | `src/index.ts` | candidate-ingestion 服务 |
| `packages/service-governance-review` | `src/index.ts` | governance-review 服务（审核/feedback/conflict） |
| `packages/service-job-runtime` | `src/index.ts` | job-runtime 服务（queue/outbox/workflow） |
| `packages/service-cron` | `src/index.ts` | cron 调度服务 |
| `packages/host-local` | `src/index.ts` | light 宿主（`local-agent`/`team-monolith` → `apps/light`） |
| `packages/host-distributed` | `src/index.ts` | heavy 宿主（`distributed` → `apps/distributed`） |
| `apps/cli` | `src/index.ts` | CLI 客户端 |
| `apps/web-panel` | `src/main.tsx` | 运维面板（仅 gateway） |
| `apps/mcp` | `src/index.ts` | MCP 薄封装（经 gateway） |
| `services/knowledge-read-go` | `main.go` | Go 读加速（`chi+pgx+lru+singleflight`，绞杀 `TRAPMAP_READ_IMPL`） |
| `services/collection-mgmt-go` | `main.go` | Go 集合管理加速 |

> 旧兼容层已删除，原 Fastify 兼容层现由 `host-local`/`host-distributed` 承接。

## 架构要点

- **宿主**：`host-local`（Nest `src/nest/` 六模块）与 `host-distributed` 为唯一运行入口；gateway 为统一外部适配层。
- **内核**：`backend-core` 承载 `identity-access / knowledge-write / knowledge-read / governance-review / candidate-ingestion / job-runtime` 六上下文的纯规则与端口。
- **服务**：各 `service-*` 为 thin assembly（`deps.ts` / `routes.ts` / `server.ts`），通过 `RouteDef` 暴露路由，经宿主消费。
- **契约**：`contracts` 为 SSOT，经 `check:go-contract` 驱动 Go 类型生成。
- **持久化**：42 表按 owner 在 `packages/service-*/drizzle/` 设 baseline，见 [DATABASE_SCHEMA.md](reference/DATABASE_SCHEMA.md)。
- **依赖方向**：`Apps/Hosts → Services → Core (backend-core/contracts/db)`，由 `fallow` 守护。

## 历史演进

Phase 0-6 的冻结结论与 owner 矩阵已归档，仅保留背景参考：`docs/archived/archived-plans/trapmap-architecture-remediation-plan.md`、`nestjs-service-evolution-00-target-architecture.md` 等。当前架构以 [ARCHITECTURE.md](architecture/ARCHITECTURE.md) 与 [SYSTEM_TRUTH_SOURCES.md](reference/SYSTEM_TRUTH_SOURCES.md) 为准。
