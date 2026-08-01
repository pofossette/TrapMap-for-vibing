# TrapMap 故障排查指南

## 概述

本文档收集 TrapMap 部署和运行中的常见问题及其解决方案。

> 当前正式开发入口优先使用 `pnpm dev:local-agent`、`pnpm dev:team-monolith` 和 `pnpm dev:distributed:*`。它们分别装配 `@trapmap/host-local` 与 `@trapmap/host-distributed`。本文中的部分底层排查仍会引用 `packages/server（Wave-10 已删除）`，因为现阶段大量权威实现与诊断代码仍驻留在该兼容实现面中。

---

## 服务启动问题

### 服务器无法启动

#### 症状

```bash
pnpm dev:local-agent
# Error: Cannot find module 'xxx'
# 或
# SyntaxError: Cannot use import statement outside a module
```

#### 排查步骤

```bash
# 1. 检查 Node.js 版本
node --version  # 需要 20+

# 2. 重新安装依赖
rm -rf node_modules
pnpm install

# 3. 检查 TypeScript 编译
pnpm build

# 4. 检查 ESM 配置
cat tsconfig.base.json | jq '.compilerOptions.module'
# 应该是 "NodeNext" 或 "ESNext"
```

#### 解决方案

```bash
# 如果是模块问题，重建
pnpm install
pnpm build
```

---

### 端口已被占用

#### 症状

```
Error: listen EADDRINUSE 0.0.0.0:4000
```

#### 排查步骤

```bash
# 查找占用端口的进程
lsof -i :4000
# 或
netstat -tlnp | grep 4000
```

#### 解决方案

```bash
# 方案 1: 终止占用进程
kill <PID>

# 方案 2: 使用其他端口
PORT=4001 pnpm dev:local-agent

# 方案 3: Docker 中修改
# docker-compose.yml 中修改 ports 配置
```

---

### 数据库连接失败

#### 症状

```
Error: Connection refused
  at PostgresStore.initialize
  at async createStore
```

#### 排查步骤

```bash
# 1. 检查 PostgreSQL 是否运行
docker compose ps postgres
# 或
pg_isready -h localhost -p 5432

# 2. 检查连接字符串
echo ${TRAPMAP_DATABASE_URL:-$DATABASE_URL}
# 格式应为: postgresql://user:password@host:5432/database

# 3. 测试连接
psql "${TRAPMAP_DATABASE_URL:-$DATABASE_URL}" -c "SELECT 1"
```

#### 解决方案

```bash
# Docker Compose 重启数据库
docker compose restart postgres

# 或创建新数据库
docker compose exec postgres psql -U trapmap -c "CREATE DATABASE trapmap;"

# 检查 .env 配置
cat .env | grep DATABASE
```

---

### Neo4j graph backend 启动失败

#### 症状

```bash
Graph DB configuration validation failed:
  uri: uri is required when graph DB is enabled

# 或
Connectivity check failed: Failed to connect to server

# 或
Neo.ClientError.Security.Unauthorized
```

#### 排查步骤

```bash
# 1. 确认 Neo4j 容器在运行
docker ps | grep neo4j

# 2. 检查 graph DB flags
env | grep TRAPMAP_GRAPH_DB

# 3. 用仓库内 helper 做直接连通性检查
pnpm --filter @trapmap/server graph-db:check

# 4. 查看服务当前对外暴露的 backend 状态
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

#### 解决方案

```bash
# 本地默认配置
export TRAPMAP_GRAPH_DB_ENABLED=true
export TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687
export TRAPMAP_GRAPH_DB_USERNAME=neo4j
export TRAPMAP_GRAPH_DB_PASSWORD=<your-password>
export TRAPMAP_GRAPH_DB_DATABASE=neo4j

# 首次接入建议保持 fail-open
export TRAPMAP_GRAPH_DB_FAIL_OPEN=true
pnpm dev:local-agent
```

补充说明：

- `TRAPMAP_GRAPH_DB_ENABLED=true` 但缺少 `URI`、`USERNAME`、`PASSWORD` 时，服务会在启动阶段直接失败，这是配置错误，不会触发回退。
- `TRAPMAP_GRAPH_DB_FAIL_OPEN=true` 时，Neo4j 不可达或查询报错，TrapMap 会退回内存 `graphology` backend；graph-assisted 检索仍能继续，但不会拿到 Neo4j traversal 加速。
- `TRAPMAP_GRAPH_DB_FAIL_OPEN=false` 时，同样的问题会阻断启动或请求路径，只建议在稳定部署后启用。

---

## 认证问题

### 登录失败

#### 症状

```
Error: Invalid credentials
# 或
Error: Session validation failed
```

#### 排查步骤

```bash
# 1. 检查用户是否存在
trapmap session
# 如果未登录会显示

# 2. 检查服务器日志
docker compose logs server | grep "auth"

# 3. 验证密钥是否有效
# 服务器使用 SHA-256 哈希查找访问密钥
```

#### 解决方案

```bash
# 创建新的访问密钥
trapmap access-key create --name "Recovery Key" --days 30

# 或通过数据库检查密钥状态
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT id, name, expires_at, revoked FROM access_keys;"

# 如果密钥已过期或被撤销，创建新密钥
# 如果使用 --system-admin-key，确认环境变量 TRAPMAP_SYSTEM_ADMIN_KEY 正确
```

---

### 会话过期

#### 症状

```
Error: Session expired
# 或
Error: Unauthorized
```

#### 排查步骤

```bash
# 检查会话有效期
trapmap session

# 检查服务器时间
date
docker compose exec server date
```

#### 解决方案

```bash
# 重新登录
trapmap logout
trapmap login --access-key <key>

# 延长会话 TTL（修改环境变量）
SESSION_TTL_MS=604800000  # 7 days (default)
```

---

### Access Key 无效

#### 症状

```
Error: Access key not found
# 或
Error: Access key expired
```

#### 排查步骤

```bash
# 1. 检查密钥格式（应该是 ak_ 开头）
echo $YOUR_ACCESS_KEY

# 2. 检查是否已撤销
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT * FROM access_keys WHERE key_hash = hash('xxx');"

# 3. 检查过期时间
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT id, name, expires_at FROM access_keys;"
```

#### 解决方案

```bash
# 创建新访问密钥
trapmap access-key create --name "New Key" --expires 30

# 或移除过期限制
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "UPDATE access_keys SET expires_at = NULL WHERE id = 'key-id';"
```

---

## 检索问题

### 检索无结果

#### 症状

```bash
trapmap search "OAuth2"
# 返回空结果
```

#### 排查步骤

```bash
# 1. 检查是否有已审批的条目
trapmap knowledge list --state approved

# 2. 检查索引状态
trapmap knowledge inspect <entry-id>
# 确认 indexState 全部为 synced

# 3. 检查向量索引
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT COUNT(*) FROM knowledge_vectors;"

# 4. 检查 embedding 模型配置
echo $AI_EMBEDDING_MODEL
```

#### 解决方案

```bash
# 如果条目未索引，手动触发
# 服务器启动时会自动索引

# 如果索引失败，重建索引
docker compose exec server node --input-type=module -e "
  import { createStore } from './dist/persistence/create-store.js';
  import { reconcile } from './dist/lib/indexing/reconciler.js';
  const store = await createStore({ type: 'postgres', databaseUrl: process.env.TRAPMAP_DATABASE_URL });
  await reconcile(store);
"

# 检查 OpenAI API 配额
curl https://api.openai.com/v1/usage \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

---

### 检索超时

#### 症状

```
Error: Retrieval request timeout
# 或
Error: AI provider timeout
```

#### 排查步骤

```bash
# 1. 检查 OpenAI API 响应时间
curl -w "%{time_total}\n" -o /dev/null -s \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{"model":"text-embedding-3-small","input":"test"}' \
  https://api.openai.com/v1/embeddings

# 2. 检查网络延迟
ping api.openai.com

# 3. 检查服务器资源
docker compose stats
```

#### 解决方案

```bash
# 增加超时配置
AI_TIMEOUT_MS=60000

# 或使用更快的 embedding 模型
AI_EMBEDDING_MODEL=text-embedding-3-small  # 默认已是最快

# 检查请求批大小（减少并发）
INDEX_BATCH_SIZE=10
```

---

### Neo4j 已启用但没有看到性能提升

#### 症状

- `/v1/retrieval/search` 仍然正常，但 graph-assisted 查询没有明显变快
- 日志里间歇出现 graph backend fallback

#### 排查步骤

```bash
# 1. 确认当前不是 disabled 模式
env | grep TRAPMAP_GRAPH_DB_ENABLED

# 2. 做一次直接连通性检查
pnpm --filter @trapmap/server graph-db:check

# 3. 对比三组 smoke retrieval
pnpm eval:retrieval:smoke
TRAPMAP_GRAPH_DB_ENABLED=true TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687 TRAPMAP_GRAPH_DB_USERNAME=neo4j TRAPMAP_GRAPH_DB_PASSWORD=<your-password> pnpm eval:retrieval:smoke
TRAPMAP_GRAPH_DB_ENABLED=true TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:65535 TRAPMAP_GRAPH_DB_USERNAME=neo4j TRAPMAP_GRAPH_DB_PASSWORD=<your-password> TRAPMAP_GRAPH_DB_FAIL_OPEN=true pnpm eval:retrieval:smoke
```

#### 解释

- Neo4j 的预期收益点是 graph-assisted 查询里的 one-hop expansion、relation strength、mitigation lookup 和 bounded local expansion。
- 如果数据集很小、查询主要靠 semantic/keyword 命中，或者请求经常 fallback 到 memory backend，那么总体延迟改善会很有限。

---

## 索引问题

### 索引状态不一致

#### 症状

```
KnowledgeEntry indexState shows "pending" but entry is approved
```

#### 排查步骤

```bash
# 1. 查看索引状态
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT entry_id, adapters FROM knowledge_index_state WHERE entry_id = 'xxx';"

# 2. 检查索引适配器状态
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT * FROM knowledge_vectors WHERE entry_id = 'xxx';"
```

#### 解决方案

```bash
# 运行协调进程
docker compose exec server node --input-type=module -e "
  import { createStore } from './dist/persistence/create-store.js';
  import { reconcile } from './dist/lib/indexing/reconciler.js';
  const store = await createStore({ type: 'postgres', databaseUrl: process.env.TRAPMAP_DATABASE_URL });
  const report = await reconcile(store);
  console.log(JSON.stringify(report, null, 2));
"

# 或手动重新索引单个条目
docker compose exec server node --input-type=module -e "
  import { createStore } from './dist/persistence/create-store.js';
  import { indexEntry } from './dist/lib/indexing/index.js';
  const store = await createStore({ type: 'postgres', databaseUrl: process.env.TRAPMAP_DATABASE_URL });
  await indexEntry('entry-id');
"
```

---

### 向量索引构建失败

#### 症状

```
Error: Vector dimension mismatch
# 或
Error: Embedding generation failed
```

#### 排查步骤

```bash
# 1. 检查 embedding 模型
echo $AI_EMBEDDING_MODEL
# 应该是 text-embedding-3-small (1536维)

# 2. 检查数据库向量维度
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT vector_dimensions(embedding_vector) FROM knowledge_vectors LIMIT 1;"

# 3. 检查 schema
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'knowledge_vectors';"
```

#### 解决方案

```bash
# 如果维度不匹配，可能需要重建向量表
docker compose exec postgres psql -U trapmap -d trapmap << 'EOF'
DROP TABLE IF EXISTS knowledge_vectors;
CREATE TABLE knowledge_vectors (
  entry_id UUID PRIMARY KEY,
  embedding_vector VECTOR(1536) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX ON knowledge_vectors USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);
EOF

# 然后重新索引所有条目
docker compose exec server node --input-type=module -e "
  import { createStore } from './dist/persistence/create-store.js';
  import { reconcile } from './dist/lib/indexing/reconciler.js';
  const store = await createStore({ type: 'postgres', databaseUrl: process.env.TRAPMAP_DATABASE_URL });
  await reconcile(store);
"
```

---

## API 问题

### API 返回 500

#### 症状

```
{ "error": { "code": "INTERNAL_ERROR", "message": "..." } }
```

#### 排查步骤

```bash
# 1. 查看服务器日志
docker compose logs server --tail=100

# 2. 检查错误堆栈
docker compose logs server | grep -A 5 "Error:"

# 3. 检查数据库状态
docker compose exec postgres psql -U trapmap -d trapmap -c "SELECT pg_stat_activity;"
```

#### 常见原因

```bash
# 原因 1: 数据库连接池耗尽
# 解决: 增加连接池大小或减少并发
MAX_CONNECTIONS=100

# 原因 2: 事务超时
# 解决: 增加事务超时
TRANSACTION_TIMEOUT_MS=30000

# 原因 3: 磁盘空间不足
df -h
docker system df
```

---

### 速率限制

#### 症状

```
{ "error": { "code": "RATE_LIMITED", "message": "Too many requests" } }
```

#### 排查步骤

```bash
# 检查速率限制配置
grep -r "rate" packages/server（Wave-10 已删除）/src/

# 检查当前速率
curl -I http://localhost:4000/v1/knowledge/mine
# X-RateLimit-Limit: 120
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: 1714567890
```

#### 解决方案

```bash
# 方案 1: 等待重置
# X-RateLimit-Reset 时间戳后自动恢复

# 方案 2: 增加限制（修改配置）
RATE_LIMIT_PER_MINUTE=120

# 方案 3: 使用批处理而非单个请求
trapmap import large-file.json --batch-size 100
```

---

## Docker 问题

### 容器启动失败

#### 症状

```
docker compose up
# Container immediately exits
```

#### 排查步骤

```bash
# 1. 查看容器日志
docker compose logs

# 2. 检查容器状态
docker compose ps -a

# 3. 进入容器调试
docker compose run --rm server sh
```

#### 常见原因

```bash
# 原因 1: 缺失环境变量
docker compose config | grep -A 5 environment

# 原因 2: 端口冲突
docker compose ps

# 原因 3: 挂载卷权限问题
ls -la .data/
chmod 777 .data/
```

---

### PostgreSQL 数据丢失

#### 症状

```
Error: relation "knowledge_entries" does not exist
# 或数据丢失
```

#### 排查步骤

```bash
# 1. 检查数据卷
docker volume ls | grep trapmap
docker volume inspect trapmap_postgres_data

# 2. 检查数据是否持久化
ls -la .data/  # 如果使用 JSON 存储
```

#### 解决方案

```bash
# 定期备份（使用以下脚本）
#!/bin/bash
docker compose exec postgres pg_dump -U trapmap trapmap > backup_$(date +%Y%m%d).sql

# 从备份恢复
docker compose exec -T postgres psql -U trapmap trapmap < backup_20260430.sql

# 重新创建表（如果没有备份）
docker compose exec server pnpm drizzle-kit push
```

---

## 性能问题

### 内存占用过高

#### 排查步骤

```bash
# 1. 检查容器内存
docker stats --no-stream

# 2. 检查 Node.js 内存
docker compose exec server node -e "
  const mem = process.memoryUsage();
  console.log('RSS:', Math.round(mem.rss / 1024 / 1024), 'MB');
  console.log('Heap Used:', Math.round(mem.heapUsed / 1024 / 1024), 'MB');
  console.log('Heap Total:', Math.round(mem.heapTotal / 1024 / 1024), 'MB');
"
```

#### 解决方案

```bash
# 增加内存限制
# docker-compose.yml
services:
  server:
    mem_limit: 2g
    mem_reservation: 512m

# 或使用 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=1536"
```

---

### CPU 占用过高

#### 排查步骤

```bash
# 1. 检查 CPU 使用
docker stats --no-stream

# 2. 查看慢查询
docker compose exec postgres psql -U trapmap -d trapmap \
  -c "SELECT * FROM pg_stat_activity WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 seconds';"
```

#### 解决方案

```bash
# 增加 embedding 缓存
EMBEDDING_CACHE_SIZE=1000
EMBEDDING_CACHE_TTL_MS=300000

# 减少并发索引
INDEX_CONCURRENCY=2

# 添加查询索引
docker compose exec postgres psql -U trapmap -d trapmap << 'EOF'
CREATE INDEX IF NOT EXISTS idx_entries_state_level ON knowledge_entries(lifecycle_state, required_level);
CREATE INDEX IF NOT EXISTS idx_entries_created ON knowledge_entries(created_at DESC);
EOF
```

---

## 日志分析

### 启用调试日志

```bash
# 临时启用
docker compose run -e LOG_LEVEL=debug server

# 永久启用
# .env
LOG_LEVEL=debug
```

### 日志格式

```json
{
  "level": "info",
  "time": "2026-04-30T12:00:00.000Z",
  "msg": "Knowledge entry created",
  "service": "trapmap-server",
  "entryId": "entry-xxx",
  "actorId": "user-xxx"
}
```

### 常见日志级别

| 级别 | 用途 |
|------|------|
| error | 错误情况 |
| warn | 警告情况 |
| info | 正常操作 |
| debug | 调试信息 |

---

## 已知问题

以下问题已在 v1.4 中确认，部分已在代码中实现但可能需要额外配置或工作：

### SEVAL-01 引用命中率未作为一级指标暴露

引用命中率（citation adherence）已实现但未在评估输出中作为一级指标展示。如需查看，可检查评估结果的原始数据中的引用匹配情况。

### 核心层摘要用例为空占位符

`evals/summary/core.ts` 当前为空占位符，实际评估会跳过核心层用例。如需完整评估覆盖，需补充核心层摘要测试用例。

### 统一评估运行器模块解析问题

`eval-all.ts` 在某些环境下可能有模块解析问题。如果遇到 `Cannot find module` 错误，尝试：

```bash
# 使用绝对路径运行
node --loader ts-node/esm eval-all.ts

# 或直接运行单个评估
pnpm eval:retrieval
pnpm eval:summary
```

### 候选人模块缺少专用测试文件

`candidates` 模块目前缺少专用测试文件。如需补充测试，参考 `evals/` 目录下的评估测试结构。

### v3 图规划核心场景用例较少

v3 graph-plan 的核心场景仅包含 2 个核心用例，测试覆盖可能不够充分。扩展用例可参考 `evals/retrieval/` 目录结构。

---

## 联系支持

如果问题无法解决：

1. 收集日志：`docker compose logs > debug.log`
2. 收集环境信息：`docker compose ps && docker compose exec server node --version`
3. 创建 Issue：`<repository issues URL pending update>`
