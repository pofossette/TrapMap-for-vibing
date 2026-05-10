# TrapMap 部署指南

## 概述

本文档介绍 TrapMap 的各种部署方式，包括开发环境、Staging 环境和生产环境。

## 部署选项

| 环境 | 存储 | 适用场景 |
|------|------|----------|
| 开发 | JSON 文件 | 本地开发、快速测试 |
| Staging | PostgreSQL | 预发布验证 |
| 生产 | PostgreSQL + Docker | 正式运营 |

---

## 本地开发部署

### 前置条件

- Node.js 20+
- pnpm 10+
- OpenAI API Key

### 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/Trap-Map.git
cd Trap-Map

# 2. 安装依赖
pnpm install

# 3. 配置环境
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY

# 4. 启动服务器（使用 JSON 文件存储）
pnpm dev:server

# 5. 另一个终端运行 CLI
pnpm --filter @trapmap/cli dev -- login <username> <password>
pnpm --filter @trapmap/cli dev -- --help
```

### 环境变量 (.env)

```bash
# 必需
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx

# 服务器配置
HOST=0.0.0.0
PORT=4000

# JSON 文件存储（开发用）
TRAPMAP_DATA_FILE=.data/skill-shareer.json

# AI 提供商配置（可选）
AI_PROVIDER=openai                    # openai, openai-compatible, ollama
AI_CHAT_MODEL=gpt-4o
AI_EMBEDDING_MODEL=text-embedding-3-small

# 可选
DEBUG=false
LOG_LEVEL=info
```

---

## Docker Compose 部署

### 前置条件

- Docker 24+
- Docker Compose 2.20+

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
curl http://localhost:4000/health
```

### .env.production 模板

```bash
# 必需
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
TRAPMAP_SYSTEM_ADMIN_KEY=generate-a-secure-random-string

# 数据库
TRAPMAP_DATABASE_URL=postgresql://trapmap:password@postgres:5432/trapmap

# 服务器
HOST=0.0.0.0
PORT=4000

# AI 配置
AI_PROVIDER=openai
AI_CHAT_MODEL=gpt-4o
AI_EMBEDDING_MODEL=text-embedding-3-small

# 日志
LOG_LEVEL=info
```

### docker-compose.yml

实际 compose 文件位于项目根目录，当前使用 JSON 文件存储（开发/单机部署）：

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
      - TRAPMAP_DATA_FILE=/app/.data/trapmap.json
      - TRAPMAP_SYSTEM_ADMIN_KEY=${TRAPMAP_SYSTEM_ADMIN_KEY:-}
      # Logging Configuration
      - LOG_USER_OPS_ENABLED=${LOG_USER_OPS_ENABLED:-false}
      - LOG_USER_OPS_DIR=${LOG_USER_OPS_DIR:-/app/logs/user-ops}
      - LOG_RAG_ENABLED=${LOG_RAG_ENABLED:-false}
      - LOG_RAG_DIR=${LOG_RAG_DIR:-/app/logs/rag}
      - LOG_MAX_FILE_SIZE_MB=${LOG_MAX_FILE_SIZE_MB:-10}
      - LOG_MAX_BACKUP_FILES=${LOG_MAX_BACKUP_FILES:-5}
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      start_period: 5s
      retries: 3
    restart: unless-stopped
```

> 源码：`docker-compose.yml`

### 生产环境启用 PostgreSQL

当前 compose 文件默认使用 JSON 文件存储。如需在生产中启用 PostgreSQL，需要：

1. 添加 `postgres` 服务定义
2. 设置 `TRAPMAP_DATABASE_URL` 环境变量
3. 添加 `depends_on` 依赖

示例扩展：

```yaml
services:
  server:
    # ... 以上配置 ...
    environment:
      # 替换 TRAPMAP_DATA_FILE 为数据库连接
      - TRAPMAP_DATABASE_URL=postgresql://trapmap:${POSTGRES_PASSWORD:-trapmap}@postgres:5432/trapmap
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
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
RUN pnpm build

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
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
```

> 源码：`packages/server/Dockerfile`

---

## Kubernetes 部署

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
  AI_CHAT_MODEL: gpt-4o
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

# 会话密钥（至少 32 字符）
SESSION_SECRET=your-session-secret-min-32-chars

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

```bash
# Prometheus 指标端点
curl http://localhost:4000/metrics

# 日志聚合 (ELK/Loki)
# 应用日志格式应为 JSON
LOG_FORMAT=json
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
docker compose exec server pnpm migrate
```

### 数据库迁移

```bash
# 使用 Drizzle
pnpm drizzle-kit migrate

# 或推送 schema（开发）
pnpm drizzle-kit push
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
curl http://localhost:4000/health

# 数据库连接（ESM 项目，使用 --input-type=module）
docker compose exec server node --input-type=module -e "
  import { createStore } from './dist/persistence/create-store.js';
  const store = await createStore({ type: 'postgres', databaseUrl: process.env.TRAPMAP_DATABASE_URL });
  console.log('OK');
"
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
