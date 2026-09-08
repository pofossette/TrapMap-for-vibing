# TrapMap 部署指南

> 状态：Active。compose 行号以仓库根 `docker-compose.yml` 为准，漂移时以文件为准。

## 形态

你先选部署形态（profile），再选启动方式。profile 是产品形态事实源，preset 是启动快捷方式兼容输入，两者不要混用。

| profile | 含义 | 宿主 |
|---|---|---|
| `local-agent` | 单用户本地服务，light 形态 | `packages/host-local` + `apps/light` |
| `team-monolith` | 单实例多用户完整 HTTP API，heavy 单进程形态 | `packages/host-local` + `apps/light` |
| `distributed` | gateway + 多服务多 worker，heavy 分布式形态 | `packages/host-distributed` + `apps/distributed` |

`preset`（`monolith`、`api`、`candidate-worker`、`governance-worker`、`outbox-worker`）继续保留为兼容输入。宿主把 `profile + preset + runtimeMode override + serviceUnit override` 解析为 `ResolvedRuntimeDeployment`，再驱动路由注册、worker 归属与健康元数据。CLI 在三档下都只连统一 gateway；被 profile 裁掉的路由族返回 `501 capability_unsupported`。

组装中心：`apps/light/src/`（light 组装）、`apps/distributed/src/`（heavy 分布式组装）、`apps/migration/src/`（迁移组装）。

## Compose 服务表

完整定义只在 `docker-compose.yml` 中存在，本页不复述。你按行号跳转：

| 范围 | 行号 |
|---|---|
| `server`（`team-monolith` 单进程） | `docker-compose.yml:2` |
| distributed 服务组（`gateway`、`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-worker`、`governance-worker`、`outbox-worker`、`cron-scheduler`） | `docker-compose.yml:70-528` |
| 基础设施（`rabbitmq`、`postgres`、`migration`） | `docker-compose.yml:530-580` |
| Go 平面（`go-accelerator :4100`、`knowledge-read-go :4101`） | `docker-compose.yml:582-647` |
| `trapmap-distributed` 一体进程 | `docker-compose.yml:648` |

## 环境变量

| 变量 | 缺省 | 位置 |
|---|---|---|
| `TRAPMAP_DEPLOYMENT_PROFILE` | `team-monolith`（compose 第 20 行）；装配侧非法值回落 `local-agent`（`packages/host-local/src/nest/main.ts:30-38`） | 各服务 |
| `TRAPMAP_DATABASE_URL` | `postgres://trapmap:${POSTGRES_PASSWORD:-trapmap}@postgres:5432/trapmap`（compose 第 45 行起各服务重复声明） | 各服务 |
| `TRAPMAP_DATA_FILE` | `/app/.data/skill-shareer.json`（`docs/architecture/DEPLOYMENT.md` 旧文引 compose 快照；仓库内 `.data/` 下未见该文件，标未知/待确认（2026-09-08）） | `server` |
| `TRAPMAP_READ_IMPL` | `off`（`packages/host-distributed/src/config/service-config.ts:478`） | gateway |
| `TRAPMAP_GO_ACCELERATOR_ENABLED` / `TRAPMAP_GO_ACCELERATOR_URL` | 未启用 / 本地 `http://localhost:4100`、容器内 `http://go-accelerator:4100` | gateway |

## 非目标

- TrapMap 服务本体不实现 MCP 协议；agent 接入经 `apps/mcp` 外层封装。
- 你不让 CLI 直连多个微服务。
- 首阶段不拆分数据库。
- 你不把 Kafka、NATS、Redis Streams 作为默认基础设施。

## 启动

```bash
docker compose up -d postgres rabbitmq
docker compose --profile distributed up -d
docker compose ps
```
