# TrapMap 部署指南

## 概述

本文档介绍 TrapMap 的各种部署方式，包括开发环境、Staging 环境和生产环境。

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

Server 启动时会先把 `profile + preset + runtimeMode override + serviceUnit override` 统一解析为一份 `ResolvedRuntimeDeployment`，再驱动 route registration、worker ownership、health/readiness metadata 和 operator status surface。

三种目标 profile 的当前定义：

- `local-agent`：单用户、轻量本地服务、retrieval-first；CLI 仍通过 HTTP gateway 接入，路由面应尽量收敛到最小能力集。
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

## 当前已实现的部署形态

TrapMap 当前代码已经支持以下运行形态，详见 [OPTIONAL_SERVICE_SPLIT_AND_MQ.md](./components/OPTIONAL_SERVICE_SPLIT_AND_MQ.md)。

- `monolith`: 单进程 API + task worker + outbox worker，默认也是推荐路径。
- `split-pg`: 拆分 API / task / outbox 进程，但异步任务仍走 PostgreSQL `task_queue`。
- `split-rabbitmq`: task transport 改为 RabbitMQ，domain event outbox 仍固定在 PostgreSQL。

当前版本的明确非目标：

- 不做数据库按服务拆分。
- 不引入 Kafka、NATS、Redis Streams。
- 不把 `domain_event_outbox` 从 PostgreSQL 挪走。

这些已实现形态与目标 `deployment profile` 的关系可暂时理解为：

- `local-agent` 当前更接近“通过现有 gateway/server 收敛最小路由面”的目标，而不是新的独立进程模型。
- `team-monolith` 当前主要由 `monolith` preset 表达。
- `distributed` 当前主要由 `api` / `candidate-worker` / `governance-worker` / `outbox-worker` 这组 preset 加上可选 RabbitMQ transport 表达。

---

## 本地开发部署

### 前置条件

- Node.js 20+
- pnpm 10+
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

# 4. 启动服务器
pnpm dev:server

# 5. 另一个终端运行 CLI
pnpm dev:cli -- login --access-key <key>
pnpm dev:cli -- --help
```

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
pnpm dev:server
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

# PostgreSQL（默认存储后端）
TRAPMAP_DATABASE_URL=postgresql://localhost:5432/trapmap
TRAPMAP_DEPLOYMENT_PRESET=monolith
TRAPMAP_TASK_TRANSPORT=postgres

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
TRAPMAP_DEPLOYMENT_PRESET=api TRAPMAP_TASK_TRANSPORT=postgres pnpm dev:server
TRAPMAP_DEPLOYMENT_PRESET=candidate-worker TRAPMAP_TASK_TRANSPORT=postgres pnpm dev:server:worker
TRAPMAP_DEPLOYMENT_PRESET=outbox-worker TRAPMAP_TASK_TRANSPORT=postgres pnpm dev:server:outbox-worker
```

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
pnpm dev:server:worker
```

注意：

- 这只会把 task delivery 切到 RabbitMQ。
- `domain_event_outbox` 仍然留在 PostgreSQL，由 monolith 或 `outbox-worker` 进程处理。

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

# 2. 构建并启动
docker compose up -d

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
TRAPMAP_DEPLOYMENT_PRESET=monolith
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

### 可选 split deployment 示例

保持 PostgreSQL task queue：

```bash
docker compose --profile split up -d
```

这会额外启动：

- `candidate-worker`
- `governance-worker`
- `outbox-worker`

可选 RabbitMQ task transport：

```bash
TRAPMAP_TASK_TRANSPORT=rabbitmq docker compose --profile split --profile mq up -d
```

这个组合会：

- 保持 `server` 默认可用
- 额外启动 RabbitMQ
- 让 `candidate-worker` / `governance-worker` 可选消费 RabbitMQ task queue
- 继续用 PostgreSQL `domain_event_outbox` 处理领域事件

### docker-compose.yml

实际 compose 文件位于项目根目录，使用 PostgreSQL 作为默认存储后端（带 pgvector 扩展）：

当前 checked-in compose 采用“单镜像复用”策略：`server` 负责构建并标记 `trap-map-server:latest`，`candidate-worker`、`governance-worker`、`outbox-worker` 直接复用同一镜像，只覆盖各自的 `command` 与环境变量，避免 split deployment 下重复构建同一个 Dockerfile。

```yaml
services:
  server:
    build:
      context: .
      dockerfile: packages/server/Dockerfile
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

实际 Dockerfile 位于 `packages/server/Dockerfile`，采用 3-stage 构建（deps → build → production）：

```dockerfile
# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy contracts package (server depends on it)
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src

# Copy server package
COPY packages/server/package.json ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/server/src ./packages/server/src

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build
WORKDIR /app
RUN pnpm exec tsc -b packages/contracts/tsconfig.json packages/server/tsconfig.json

# Stage 3: Production
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist

COPY packages/server/package.json ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/
COPY --from=build /app/packages/server/dist ./packages/server/dist

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/packages/server
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

CMD ["node", "dist/index.js"]
```

> 源码：`packages/server/Dockerfile`

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

> **注意**：以下为运维建议，TrapMap 当前未内置 `/metrics` 端点或 `LOG_FORMAT` 变量。

```bash
# 健康检查（内置端点）
curl http://127.0.0.1:4000/health

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
