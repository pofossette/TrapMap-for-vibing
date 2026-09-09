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

## 健康检查端点

实现见 `packages/host-local/src/nest/health/health.controller.ts`。探针均无需认证。

| 端点 | 语义 |
|------|------|
| `GET /health` | 综合健康（含依赖状态、profile/preset、readiness/liveness 快照） |
| `GET /ready` | 就绪探针：未就绪或关键依赖 unhealthy 时返回 `503`，degraded 时返回 `200` |
| `GET /live` | 存活探针：进程存活即返回 `alive` |
| `GET /metrics` | Prometheus scrape；`TRAPMAP_METRICS_ENABLED=false` 时返回 `503` |

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
curl http://127.0.0.1:4000/live
curl http://127.0.0.1:4000/metrics | head -20
```

`/ready` 的 `503` 只表示“暂未就绪”（`readiness === "not-ready"` 或关键依赖 unhealthy），不是故障定论；其余探针语义见 `docs/operations/OBSERVABILITY-OPERATIONS.md`。

## L3 验收命令块（压缩版）

当前成熟度为 `Level 2 + L3 verification pending`；`Level 3` 需 live 环境验证后方可宣称。完整判据见 git 历史 `ec0e4c99:docs/architecture/DEPLOYMENT.md` 的 “Platform L3 operational verification” 节。

```bash
# 1. 离线 plumbing（本机可跑）
pnpm exec tsx scripts/verify-l3-platform.ts --check all
kubectl apply --dry-run=client --validate=true -f k8s/base/

# 2. kind 烟囱（需 kind + kubectl + docker）
kind create cluster --name trapmap-l3
kubectl apply -f k8s/base/
kubectl wait --for=condition=Ready pod --all -n trapmap --timeout=180s
curl -f http://127.0.0.1:4000/ready
kind delete cluster --name trapmap-l3

# 3. amqp live smoke（需 compose + rabbitmq profile）
TRAPMAP_TASK_TRANSPORT=amqp TRAPMAP_RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672 \
  docker compose --profile distributed --profile mq up -d --build
```

## 常见用法

### 你本地直起 `team-monolith`

前置条件：`postgres` 与 `rabbitmq` 已启动，见本页「启动」节。

```bash
pnpm run dev -- team-monolith
```

profile 与 preset 的区别见本页「形态」节。

### 你跟踪网关日志

前置条件：distributed 服务组运行中。

```bash
docker compose logs -f gateway
```

服务名以 `docker-compose.yml:70-528` 的 distributed 服务组为准。

### 你核对部署变量

前置条件：离线可跑。

```bash
grep -n "TRAPMAP_DEPLOYMENT_PROFILE" docker-compose.yml
```

变量含义见本页「环境变量」节。
