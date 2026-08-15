# TrapMap 部署指南

## 概述

本文档介绍 TrapMap 的各种部署方式，包括开发环境、Staging 环境和生产环境。

当前推荐的正式入口统一使用 deployment profile：

- `local-agent`
- `team-monolith`
- `distributed`

旧 `monolith` / `api` / `candidate-worker` / `governance-worker` / `outbox-worker` 继续保留为 deployment preset 与兼容输入，不再作为面向操作者的首要产品形态词汇。

## 术语与边界

先区分两层概念：

- `deployment profile`：当前总计划冻结的目标产品形态，分别是 `local-agent`、`team-monolith`、`distributed`。
- `deployment preset`：当前代码已实现的启动快捷方式，分别是 `monolith`、`api`、`candidate-worker`、`governance-worker`、`outbox-worker`。

当前仓库已实现的是 `deployment preset -> runtimeMode/serviceUnit` 映射，以及 `postgres` / `rabbitmq` 两类 `task transport` 选择；`deployment profile` 用来统一“想要支持哪种部署形态”的叙事，不应与 preset 混为一谈。

运行时解析关系现在固定为：

- `profile`：正式产品形态与 capability matrix 的事实源
- `preset`：兼容输入与启动快捷方式
- `runtimeMode`：当前进程是否暴露 API、task worker、outbox worker
- `serviceUnit`：当前进程拥有哪类 async work ownership

当前宿主会先把 `profile + preset + runtimeMode override + serviceUnit override` 统一解析为一份 `ResolvedRuntimeDeployment`，再驱动 route registration、worker ownership、health/readiness metadata 和 operator status surface。

三种目标 profile 的当前定义：

- `local-agent`：单用户、本地服务、完整质量治理；CLI 仍通过 HTTP gateway 接入，但现在可直接使用 feedback、review、duplicates、manual-resolution 与 skill review 流程。
- `team-monolith`：单实例、多用户、完整 HTTP API，PostgreSQL 是主路径，可按需要把 API/worker 组合在同一进程。
- `distributed`：gateway + 多服务/多 worker，首期仍共享 PostgreSQL；CLI 仍只连接 gateway。

当前 capability 语义最少覆盖：

- `route surface`
  - `minimal-agent`
  - `gateway-core`
  - `worker-status`
- `async ownership expectation`
  - `local-owned`
  - `split-owned`
  - `remote-expected`
- `storage posture`
  - `json-store-ok`
  - `postgres-required`
- `auth/team expectation`
  - `single-user`
  - `team-auth`

CLI 接入语义在这三个 profile 下保持一致：

- CLI 只连接统一 gateway。
- `team-monolith` 中 gateway 与内部实现可同进程。
- `distributed` 中 gateway 可以把请求路由到内部 service/worker，但 CLI 不感知这些拆分。
- `local-agent` 仍通过 HTTP gateway 接入，并暴露与本地质量闭环相关的完整治理面。
- 对于被当前 profile 裁剪掉的 route family，gateway 返回 `501 capability_unsupported`，而不是把缺失能力伪装成普通 `404`。

当前阶段的明确非目标：

- 不做 MCP 协议。
- 不让 CLI 直连多个微服务。
- 第一阶段不拆分数据库。
- 不把 Kafka、NATS、Redis Streams 作为默认基础设施。

## 部署选项

| 环境 | 存储 | 适用场景 |
|------|------|----------|
| 开发 | PostgreSQL | 本地开发、快速测试 |
| Staging | PostgreSQL | 预发布验证 |
| 生产 | PostgreSQL + Docker | 正式运营 |

## 推荐启动矩阵

| Profile | 推荐入口 | 说明 |
|------|------|------|
| `local-agent` | `pnpm dev:local-agent` | 单用户、本地 gateway、支持完整治理链路与 JSON store |
| `team-monolith` | `pnpm dev:team-monolith` 或 `docker compose up -d` | 单实例、多用户、完整 HTTP API 与 PostgreSQL 主路径；compose 默认启动统一 gateway |
| `distributed` | `pnpm dev:distributed:*` 或 `docker compose --profile distributed up -d` | gateway + 多 worker，CLI 仍只连接 gateway |

### Phase 4 freeze

Phase 4 freeze 把 adapter env / target-pruning 的推荐组合固定为文档事实，而不是新的 runtime implementation claim。

- `local-agent` -> `light`：保持 in-process/internal defaults 与 `json-store-ok` posture。它是单机、本地、最小依赖面部署目标，不要求 remote internal services，也不要求 PostgreSQL 才能启动。
- `team-monolith` -> `light`：保持 `postgres-required` + `gateway-core` + `split-owned` async posture。它仍然是单实例部署目标，但 truth source 要明确它依赖 PostgreSQL，并把 gateway 与本地 async ownership 组合在同一 `light` target。
- `distributed` -> `heavy`：保持 service/gateway split 与 `remote-expected` async posture。它要求 PostgreSQL，并预期 gateway 与 worker/service 通过 internal transport 协作，而不是写成“heavy 只是 preset 别名”。
- fail-fast / fallback 边界要写清：`rabbitmq` 需要 RabbitMQ config；`distributed` 需要 PostgreSQL；`local-agent` 可保持 JSON-store-ok；internal service URLs 仅在 remote mode 下有意义，在 `in-process` mode 下继续被忽略。
- `light` 与 `heavy` 是 build/deployment targets，不是新的 runtime profiles。optional dependency / target-pruning 的当前文档语义只应描述推荐方向与非目标，不能在没有代码证据时宣称已经实现自动 package tree-shaking。

### Phase 5 freeze

Phase 5 freeze 固定 distributed baseline / runtime-isolation 的当前叙事，只描述已被代码、compose 和 closeout tests 证明的事实。

- `distributed` 当前成熟度固定为 `Level 2 / transitional-microservice`。
- gateway 继续是唯一外部入口；CLI 与外部 HTTP client 仍只连接 gateway，而不是直接访问内部服务。
- 当前 distributed 已有真实内部 HTTP hop、真实多进程 service/worker 装配，以及 shared PostgreSQL 支撑下的运行证据；因此它不是 fake distributed。
- 当前 distributed 仍不是成熟自治平台：shared PostgreSQL 仍是主要持久化底座，retrieval 仍带有逻辑服务边界，部分 shared infra/runtime seam 仍未服务自治化。
- compose 文案必须按当前事实收口：checked-in compose 证明的是 `distributed` profile 可展开 gateway 与多进程 worker/service 拓扑；当前已补齐 shared `trapmap-distributed` network，并把内部默认 URL 收口到 Docker DNS（`gateway`、`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-worker`、`governance-worker`、`outbox-worker`），从而消除跨容器 `localhost` 回退。
- deferred 边界保持显式：当前只实现“显式配置 -> compose Docker DNS -> 统一 resolver seam”这一层服务发现。注册中心、Kubernetes Service、Service Mesh 仍属于 follow-up，而不是当前部署默认能力。

## 当前已实现的部署形态

当前代码已经把对操作者的正式入口收敛到三种 profile：

- `local-agent`：单进程、单用户、完整本地治理 gateway
- `team-monolith`：单进程 gateway，必要时在同进程内拥有 task/outbox runtime
- `distributed`：gateway + candidate/governance/outbox worker，多进程但首期仍共享 PostgreSQL

兼容层里仍保留的 `deployment preset` 只是启动映射：

- `monolith`
- `api`
- `candidate-worker`
- `governance-worker`
- `outbox-worker`

当前版本的明确非目标：

- 不做数据库按服务拆分。
- 不引入 Kafka、NATS、Redis Streams。
- 不把 `domain_event_outbox` 从 PostgreSQL 挪走。

## Distributed Phase 1 服务拓扑

`distributed` 当前的正式目标不是“立刻完成最终分布式架构”，而是先固化第一阶段服务边界，并继续复用共享 contracts、PostgreSQL queue/outbox 和既有 runtime seams。

第一阶段逻辑服务固定为：

- `gateway`：对外唯一入口，负责 CLI / 外部 HTTP API、auth、session，不拥有 candidate/shared-job/outbox worker ownership。
- `retrieval`：负责 search、read-model、capsule recall 等读侧编排；不承载 review / governance 写路径。
- `candidate-ingestion`：负责 candidate submit 后续处理、去重和 resolution follow-up，拥有 candidate task work。
- `governance`：负责 review、maintenance、decay、feedback、conflict、remediation 等治理写路径和 operator projections；通过 `JobRuntimePort` 提交/消费治理命令，不拥有 queue substrate。
- `job-runtime` / `outbox-runtime`：负责 PostgreSQL outbox 消费、task queue、重试、租约、dead-letter、派生刷新和 follow-up dispatch，作为独立 worker runtime 暴露 status surface。

第一阶段共享基础设施固定为：

- PostgreSQL
- shared contracts
- auth/session model
- queue/outbox semantics

当前明确先不做：

- per-service database
- split repo / split package
- service mesh / complex event backbone

这些拓扑语义现在会进入 `/health`、`/ready`、`/meta/routes` 的 runtime metadata，作为 operator 判断 gateway public surface、internal-only worker boundary 和 shared-PostgreSQL 阶段约束的正式事实源。

补充说明：

- `gateway`、`candidate-ingestion`、`outbox-runtime` 当前都有明确 runtime 入口。
- `retrieval` 与 `governance` 在 phase-1 仍主要是逻辑服务边界和 ownership boundary。
- 这意味着 retrieval 目前不是独立部署二进制；CLI 也不会看到独立 retrieval URL，仍然只通过 gateway 访问相关读侧能力。

---

## 本地开发部署

### 前置条件

- Node.js 24
- pnpm 10.33.0
- OpenAI API Key（可选；未配置时服务会回退到 fallback provider）

### 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/Trap-Map.git
cd Trap-Map

# 2. 安装依赖

pnpm install

# 3. 配置环境
cp .env.example .env
# 编辑 .env，按需填入数据库和 AI 配置

# 4. 启动 local-agent 或 team-monolith
pnpm dev:local-agent
# 或
pnpm dev:team-monolith

# 5. 另一个终端运行 CLI
pnpm dev:cli -- login --access-key <key>
pnpm dev:cli -- --help
```

### Nest modular monolith 主线

`packages/host-local/src/nest/**` 是冻结后的 `light` 默认主入口终局。六个 bounded-context Nest module 已在 `app.module.ts` 注册。

```bash
# opt-in Nest modular monolith
pnpm --filter @trapmap/host-local dev
pnpm --filter @trapmap/host-local start
```

旧 Fastify 轻宿主路径（`packages/host-local/src/bootstrap/**`、`src/http/**`、`src/runtime/**`）已经删除。`light` 默认主入口只剩 `packages/host-local/src/nest/**`。`packages/server` compatibility shell 已于 Wave-10 删除。

### 可选：本地 Neo4j 查询后端

默认本地开发只需要 PostgreSQL。若你要验证 optional Neo4j graph backend，可额外启动一个本地容器：

```bash
docker run --name trapmap-neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/neo4jpass \
  -d neo4j:5

export TRAPMAP_GRAPH_DB_ENABLED=true
export TRAPMAP_GRAPH_DB_PROVIDER=neo4j
export TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687
export TRAPMAP_GRAPH_DB_USERNAME=neo4j
export TRAPMAP_GRAPH_DB_PASSWORD=neo4jpass
export TRAPMAP_GRAPH_DB_DATABASE=neo4j
export TRAPMAP_GRAPH_DB_FAIL_OPEN=true
export TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true

pnpm --filter @trapmap/server graph-db:check
pnpm dev:local-agent
```

说明：

- PostgreSQL `graph_index_documents` 仍是图索引真相源；Neo4j 只是可选 query-time backend。
- `TRAPMAP_GRAPH_DB_FAIL_OPEN=true` 时，Neo4j 不可达不会阻断服务，而是回退到内存 `graphology` backend。

### 环境变量 (.env)

```bash
# 必需
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx

# 服务器配置
HOST=127.0.0.1
PORT=4000

# 正式部署形态
TRAPMAP_DEPLOYMENT_PROFILE=team-monolith
TRAPMAP_GATEWAY_URL=http://127.0.0.1:4000

# PostgreSQL（默认存储后端；宿主同时接受 DATABASE_URL）
TRAPMAP_DATABASE_URL=postgresql://localhost:5432/trapmap
# DATABASE_URL=postgresql://localhost:5432/trapmap
TRAPMAP_TASK_TRANSPORT=postgres

# 兼容启动快捷方式，可选
# TRAPMAP_DEPLOYMENT_PRESET=monolith

# AI 提供商配置（可选）
AI_PROVIDER=openai                    # openai, openai-compatible, ollama, google-genai
AI_CHAT_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small

# 可选
LOG_LEVEL=info
```

### 可选：拆分进程但保持 PostgreSQL task queue

如果需要在本地验证拆分部署，可以分别启动：

```bash
pnpm dev:distributed:gateway
pnpm dev:distributed:candidate-worker
pnpm dev:distributed:governance-worker
pnpm dev:distributed:outbox-worker
```

这些根脚本已经直接指向 `@trapmap/host-distributed`，底层仍通过 `TRAPMAP_DEPLOYMENT_PRESET` + `RUNTIME_MODE` 兼容既有 runtime seams。

### 可选：RabbitMQ task transport

只在需要独立扩缩容或隔离 task backlog 时启用：

```bash
TRAPMAP_DATABASE_URL=postgresql://localhost:5432/trapmap
TRAPMAP_DEPLOYMENT_PRESET=candidate-worker
TRAPMAP_TASK_TRANSPORT=rabbitmq
TRAPMAP_RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
TRAPMAP_RABBITMQ_TASK_EXCHANGE=trapmap.tasks
TRAPMAP_RABBITMQ_TASK_QUEUE=trapmap.candidate
TRAPMAP_RABBITMQ_PREFETCH=4
pnpm dev:distributed:candidate-worker
```

注意：

- 这只会把 task delivery 切到 RabbitMQ。
- `domain_event_outbox` 仍然留在 PostgreSQL，由 `team-monolith` 或 `outbox-worker` 进程处理。

## 最小验证矩阵

deployment flexibility 相关改动至少执行：

```bash
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm typecheck
pnpm check:docs
```

如果只改了代码且未触碰文档事实，可省略 `pnpm check:docs`。

---

## Docker Compose 部署

### 前置条件

- Docker 24+
- Docker Compose 2.20+

### 脚本入口

仓库内有两个便捷脚本：

- `scripts/deploy.sh`：完整部署脚本，包含 `deploy/start/stop/restart/logs/status/update/shell/clean`
- `scripts/deploy-quick.sh`：最小化快速启动脚本，适合本地试跑

推荐优先使用 `scripts/deploy.sh deploy`，因为它会检查 Docker daemon、生成 `.env` 模板并给出更明确的失败提示。

### 生产环境配置

```bash
# 1. 创建生产环境文件
cp .env.production.example .env
# 编辑 .env

# 2. 构建并启动 team-monolith
docker compose up -d

# 或 distributed
docker compose --profile distributed up -d

# 或 distributed + mq
docker compose --profile distributed --profile mq up -d

# 3. 查看日志
docker compose logs -f

# 4. 健康检查
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

其中：

- `/health` 用于 liveness，返回 `status: "ok"` 以及统一 runtime snapshot：`product`、`packages`、`liveness`、`readiness`、`requestContext`、`dependencies`、`graphQuery`、`memory`、`uptimeSeconds`
- `/ready` 用于 traffic readiness，返回 `ok` 与同一份 runtime snapshot；当 `readiness === "not-ready"` 时，HTTP 状态码为 `503`，且 `ok` 为 `false`
- 两个端点都会返回 `deployment` 与 `dependencies.deployment` 语义，包括 `profile`、`preset`、`routeSurface`、`asyncOwnershipExpectation`、`storagePosture`、`authTeamExpectation`
- `/meta/routes` 会返回 `routeSurface`、`routeFamilies`、`publicGatewayRouteCount`、`internalRouteCount` 和对外 `documentedRoutes`，用于区分正式 gateway API、local-agent 最小外部面以及 worker/status-only surface
- 两个端点都返回 `requestContext.requestIdHeader` 与 `requestContext.traceHeader`，用于说明实例当前使用的请求链路头约定
- `dependencies.queueWorker` 的语义为：
  - `running`：PostgreSQL 模式且 worker 正常运行
  - `stopped`：PostgreSQL 模式但 worker 未运行，应视为 `not-ready`
  - `not-configured`：JSON store 模式，无后台 worker，属于预期状态
- `dependencies.graphQuery` 的语义为：
  - `disabled`：未启用 graph DB
  - `healthy`：primary backend 正常
  - `fallback`：fail-open 已触发，实例仍可服务，但应视为 `degraded`
  - `failed`：graph backend 失败且实例不可正常就绪
- 当前 Phase 1 的 readiness snapshot 是“已观测运行时依赖状态”，当前明确覆盖 graph query backend 与 candidate task worker；它不是所有后台子系统的完整健康总表

### .env.production 模板

```bash
# 必需
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
TRAPMAP_SYSTEM_ADMIN_KEY=generate-a-secure-random-string

# 数据库
TRAPMAP_DATABASE_URL=postgresql://trapmap:password@postgres:5432/trapmap
TRAPMAP_DEPLOYMENT_PROFILE=team-monolith
TRAPMAP_TASK_TRANSPORT=postgres

# Optional Neo4j graph backend
# TRAPMAP_GRAPH_DB_ENABLED=true
# TRAPMAP_GRAPH_DB_PROVIDER=neo4j
# TRAPMAP_GRAPH_DB_URI=bolt://neo4j:7687
# TRAPMAP_GRAPH_DB_USERNAME=neo4j
# TRAPMAP_GRAPH_DB_PASSWORD=change-me
# TRAPMAP_GRAPH_DB_DATABASE=neo4j
# TRAPMAP_GRAPH_DB_FAIL_OPEN=true
# TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true

# 服务器
HOST=0.0.0.0
PORT=4000

# AI 配置
AI_PROVIDER=openai
AI_CHAT_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small

# 日志
LOG_LEVEL=info
```

### Distributed 示例

保持 PostgreSQL task queue：

```bash
docker compose --profile distributed up -d
```

这会启动 distributed gateway `gateway`，并额外启动：

- `candidate-worker`
- `governance-worker`
- `outbox-worker`

分布式 operator closeout 建议紧随 compose 启动后执行：

```bash
TRAPMAP_SYSTEM_ADMIN_KEY=<your-admin-key> pnpm test:runtime-closeout
```

该命令通过现有 `/v1/auth/login` 与 `/v1/operations/status/async` contract 校验：

- 当前实例确实以 `distributed` profile 对外服务
- gateway 仍是 operator 与 CLI 的唯一对外入口
- queue/outbox 的 reclaim、recent dead letters、recent failures、stale processing 在 operator status 中可见
- retry / dead-letter policy 与 status contract 保持一致

无需占用开发机 `4000` 或准备持久管理员密钥的完整临时验收使用：

```bash
pnpm test:runtime-closeout:compose
```

该命令为单次运行分配空闲 loopback gateway 端口和 `TRAPMAP_SYSTEM_ADMIN_KEY`，只启动 PostgreSQL、gateway 和六个内部服务；重启单个 `knowledge-write` 时持续验证 gateway 健康与 job-runtime operator status，并要求 gateway → governance-review → knowledge-write 委托在 60 秒内恢复。无论结果如何都会移除该 Compose project 的容器、volumes 和孤儿容器。60 秒仅是本地可重复隔离验收阈值，不是生产 SLO，也不表示已经具备独立扩缩容或 Level 3 成熟度。

可选 RabbitMQ task transport：

```bash
TRAPMAP_TASK_TRANSPORT=rabbitmq docker compose --profile distributed --profile mq up -d
```

这个组合会：

- 保持 `server` 默认可用
- 额外启动 RabbitMQ
- 让 `candidate-worker` / `governance-worker` 可选消费 RabbitMQ task queue
- 继续用 PostgreSQL `domain_event_outbox` 处理领域事件

### docker-compose.yml

实际 compose 文件位于项目根目录，使用 PostgreSQL 作为默认存储后端（带 pgvector 扩展）：

当前 checked-in compose 采用“单镜像复用”策略：`server` 负责构建并标记 `trap-map-server:latest`，`candidate-worker`、`governance-worker`、`outbox-worker` 直接复用同一镜像，只覆盖各自的 `command` 与环境变量，避免 distributed 形态下重复构建同一个 Dockerfile。

```yaml
services:
  server:
    build:
      context: .
      dockerfile: packages/host-local/Dockerfile
    container_name: trapmap-server
    ports:
      - "4000:4000"
    volumes:
      - ./.data:/app/.data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=4000
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TRAPMAP_SYSTEM_ADMIN_KEY=${TRAPMAP_SYSTEM_ADMIN_KEY:-}
      # AI Provider
      - AI_PROVIDER=${AI_PROVIDER:-}
      - AI_BASE_URL=${AI_BASE_URL:-}
      - AI_API_KEY=${AI_API_KEY:-}
      - AI_CHAT_MODEL=${AI_CHAT_MODEL:-}
      # Embedding Provider
      - EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER:-}
      - EMBEDDING_BASE_URL=${EMBEDDING_BASE_URL:-}
      - EMBEDDING_API_KEY=${EMBEDDING_API_KEY:-}
      - EMBEDDING_MODEL=${EMBEDDING_MODEL:-}
      # Database (set to use PostgreSQL; omit for JSON file storage)
      - TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@postgres:5432/trapmap
      # Logging Configuration
      - LOG_USER_OPS_ENABLED=${LOG_USER_OPS_ENABLED:-false}
      - LOG_USER_OPS_DIR=${LOG_USER_OPS_DIR:-/app/logs/user-ops}
      - LOG_RAG_ENABLED=${LOG_RAG_ENABLED:-false}
      - LOG_RAG_DIR=${LOG_RAG_DIR:-/app/logs/rag}
      - LOG_MAX_FILE_SIZE_MB=${LOG_MAX_FILE_SIZE_MB:-10}
      - LOG_MAX_BACKUP_FILES=${LOG_MAX_BACKUP_FILES:-5}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:4000/health"]
      interval: 30s
      timeout: 10s
      start_period: 5s
      retries: 3
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    container_name: trapmap-postgres
    ports:
      - "5434:5432"
    environment:
      POSTGRES_DB: trapmap
      POSTGRES_USER: trapmap
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-trapmap}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trapmap -d trapmap"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

> 源码：`docker-compose.yml`

### 可选 Neo4j service wiring

checked-in `docker-compose.yml` 没有默认绑定 Neo4j。要在部署环境中启用它，推荐额外提供一个 override 文件，而不是直接改默认 compose：

```yaml
services:
  server:
    environment:
      - TRAPMAP_GRAPH_DB_ENABLED=true
      - TRAPMAP_GRAPH_DB_PROVIDER=neo4j
      - TRAPMAP_GRAPH_DB_URI=bolt://neo4j:7687
      - TRAPMAP_GRAPH_DB_USERNAME=neo4j
      - TRAPMAP_GRAPH_DB_PASSWORD=${NEO4J_PASSWORD}
      - TRAPMAP_GRAPH_DB_DATABASE=neo4j
      - TRAPMAP_GRAPH_DB_FAIL_OPEN=true
      - TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true
    depends_on:
      postgres:
        condition: service_healthy
      neo4j:
        condition: service_started

  neo4j:
    image: neo4j:5
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
    volumes:
      - neo4j_data:/data
    restart: unless-stopped

volumes:
  neo4j_data:
```

启动方式：

```bash
docker compose -f docker-compose.yml -f docker-compose.neo4j.yml up -d
pnpm --filter @trapmap/server graph-db:check
```

部署建议：

- 把 Neo4j 当作可选加速层，而不是新的事实源；灾备与回填仍以 PostgreSQL `graph_index_documents` 为准。
- 首次接入先保持 `TRAPMAP_GRAPH_DB_FAIL_OPEN=true`，验证日志与 smoke eval 后，再决定是否改为 fail-closed。
- 运维侧可通过启动日志里的 `Graph query backend initialized`，以及 `/health` / `/ready` 返回的 `graphQuery` 与 `dependencies` 字段确认当前 active backend 和服务降级状态。

### JSON 文件存储（兼容回退）

以上 compose 文件默认使用 PostgreSQL。如需回退到 JSON 文件存储（仅用于向后兼容），需要：

1. 移除 `postgres` 服务定义和 `depends_on` 依赖
2. 将 `TRAPMAP_DATABASE_URL` 替换为 `TRAPMAP_DATA_FILE`
3. 添加 `.data` volume

示例回退配置：

```yaml
services:
  server:
    # ... 以上配置 ...
    environment:
      # 移除 TRAPMAP_DATABASE_URL，改用 JSON 文件存储
      - TRAPMAP_DATA_FILE=/app/.data/skill-shareer.json
    volumes:
      - ./.data:/app/.data
      - ./logs:/app/logs
    # 移除 depends_on postgres
```

> **注意**：JSON 文件存储仅作为兼容回退，不推荐用于生产环境。

### Dockerfile

实际 Dockerfile 位于 `packages/host-local/Dockerfile`（light 宿主）和 `packages/host-distributed/Dockerfile`（distributed 宿主）。

> `packages/server/Dockerfile` 已于 Wave-10 删除。当前 Dockerfile 请直接查看 `packages/host-local/Dockerfile`。

---

## Kubernetes 部署

> **注意**：以下 Kubernetes/Helm 部署方案为参考架构。仓库当前未包含 Helm chart 或 k8s manifests，此章节描述的是目标部署拓扑，而非现成可用的交付物。

### 前置条件

- Kubernetes 1.28+
- Helm 3.14+
- PostgreSQL (外部或 via Helm)

### Helm Chart 值文件

```yaml
# values.yaml

replicaCount: 2

image:
  repository: ghcr.io/your-org/trapmap
  tag: latest
  pullPolicy: IfNotPresent

env:
  NODE_ENV: production
  OPENAI_API_KEY: your-api-key
  TRAPMAP_DATABASE_URL: postgresql://user:pass@postgres:5432/trapmap
  AI_PROVIDER: openai
  AI_CHAT_MODEL: gpt-4o-mini
  AI_EMBEDDING_MODEL: text-embedding-3-small

service:
  type: ClusterIP
  port: 4000

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: trapmap.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: trapmap-tls
      hosts:
        - trapmap.example.com

resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

上述 `resources` / `autoscaling` 仍是平台化样例，不是当前仓库已 check-in 的 compose 默认值。当前 Phase 4 在仓库内真实落地的资源治理默认值只冻结到 distributed DB pool budget env seam：

- `TRAPMAP_SERVICE_POOL_SIZE=5` 提供 distributed service 的 shared pool 默认值
- `TRAPMAP_<SERVICE>_POOL_SIZE=<n>` 提供 per-service override，例如 `TRAPMAP_JOB_RUNTIME_POOL_SIZE=12`

它们只影响 `packages/host-distributed/src/shared/database.ts` 创建的 `pg.Pool.max`，不代表已完成容器级 CPU/memory limit、Node heap preset、PgBouncer rollout 或 autoscaling policy。

### 部署命令

```bash
# 添加 Helm repo
helm repo add bitnami https://charts.bitnami.com/bitnami

# 安装 PostgreSQL
helm install postgres bitnami/postgresql \
  --set auth.database=trapmap \
  --set auth.username=trapmap \
  --set auth.password=your-password

# 安装 TrapMap
helm install trapmap ./helm/trapmap \
  -f values.yaml \
  --set env.TRAPMAP_DATABASE_URL="postgresql://trapmap:your-password@postgres:5432/trapmap"
```

---

## 生产配置最佳实践

### 安全配置

```bash
# 生成安全密钥
openssl rand -hex 32

# 系统管理员密钥
TRAPMAP_SYSTEM_ADMIN_KEY=generate-secure-random-string
```

### 数据库配置

```sql
-- PostgreSQL 配置建议

-- 连接池
ALTER SYSTEM SET max_connections = 200;

-- 内存
ALTER SYSTEM SET shared_buffers = 256MB;
ALTER SYSTEM SET effective_cache_size = 1GB;
ALTER SYSTEM SET work_mem = 16MB;

-- 向量扩展
CREATE EXTENSION IF NOT EXISTS vector;
```

### 备份策略

```bash
# PostgreSQL 备份脚本
#!/bin/bash
BACKUP_DIR=/backups
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME=trapmap_backup_${DATE}.sql

# 导出
pg_dump -U trapmap -d trapmap > ${BACKUP_DIR}/${FILENAME}

# 压缩
gzip ${BACKUP_DIR}/${FILENAME}

# 删除 7 天前的备份
find ${BACKUP_DIR} -name "trapmap_backup_*.sql.gz" -mtime +7 -delete

# 保留数量
find ${BACKUP_DIR} -name "trapmap_backup_*.sql.gz" -mtime +30 -delete
```

### 监控

> 当前宿主已内置 `/metrics` Prometheus scrape surface；日志链路默认保留 stdout。需要把结构化日志送入 Loki 时，使用当前 `LOKI_HOST` 配置接入外部聚合链路。

```bash
# 健康检查（内置端点）
curl http://127.0.0.1:4000/health

# 指标抓取（内置 Prometheus 端点）
curl http://127.0.0.1:4000/metrics | head -20

# 最小 observability 性能基线
pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000

# 日志聚合 (ELK/Loki)
# 应用日志输出到 ./logs 目录，可通过 LOG_RAG_ENABLED / LOG_USER_OPS_ENABLED 控制
```

---

## 升级

### Docker Compose 升级

```bash
# 1. 拉取新镜像
docker compose pull

# 2. 停止服务
docker compose down

# 3. 启动服务
docker compose up -d

# 4. 运行迁移（如有）
docker compose exec server pnpm --filter @trapmap/server db:migrate
```

### 数据库迁移

```bash
# 使用 Drizzle（通过 server 包脚本）
pnpm --filter @trapmap/server db:migrate

# 生成新迁移
pnpm --filter @trapmap/server db:generate
```

---

## 故障排查

### 查看日志

```bash
# Docker Compose
docker compose logs -f server

# Kubernetes
kubectl logs -f deployment/trapmap
kubectl logs -f statefulset/postgres
```

### 健康检查

### Distributed recovery acceptance

部署验证应单独重启 `knowledge-write`，确认 gateway 的后续 governance delegation 恢复，同时 `job-runtime` queue status 仍可访问。该验证证明局部进程故障不会要求整套进程重启，但不构成 Level 3 或独立扩缩容声明；当前部署成熟度保持 `Level 2 / transitional-microservice`。

```bash
# API 健康
curl http://127.0.0.1:4000/health

# 数据库连接
docker compose exec postgres pg_isready -U trapmap -d trapmap
```

### 常见问题

#### 数据库连接失败

```
Error: Connection refused
```

检查：
1. PostgreSQL 是否运行
2. `TRAPMAP_DATABASE_URL` 是否正确
3. 网络连通性

#### AI API 错误

```
Error: AI provider error
```

检查：
1. `OPENAI_API_KEY` 是否正确
2. API 配额是否充足
3. 网络是否能访问 OpenAI

#### 端口冲突

```
Error: listen EADDRINUSE 0.0.0.0:4000
```

解决：
```bash
# 查找占用端口的进程
lsof -i :4000

# 修改端口
PORT=4001 docker compose up
```
