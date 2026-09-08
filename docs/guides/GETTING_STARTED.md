# 快速上手指南

> 状态：Active。读完本页，你可以在本地跑起 TrapMap 并发出第一批请求。

## 前置要求

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 24 | 与 CI 基线一致 |
| pnpm | 10.33.0 | 必须使用 pnpm，禁止使用 npm 或 yarn |
| Docker | ≥ 24 | 只在 Docker 部署或 PG 协调评测时需要 |
| Docker Compose | ≥ 2 | 只在 Docker 部署或 PG 协调评测时需要 |

## 1. 克隆与依赖安装

离线可跑，只需要网络拉取依赖包。

```bash
git clone <repository-url>
cd Trap-Map

corepack prepare pnpm@10.33.0 --activate

pnpm install

pnpm build
```

## 2. 环境配置

```bash
cp .env.example .env
```

起步变量见 `docs/reference/ENVIRONMENT.md`，那是环境变量唯一真相表。三个最常用的：

| 变量 | 说明 |
|------|------|
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥，只在创建或使用 system-admin 能力时需要 |
| `OPENAI_API_KEY` | OpenAI 密钥，可选；缺失时回退到确定性 fallback 向量 |
| `TRAPMAP_DATABASE_URL` | PostgreSQL 连接串，推荐设置 |

### PostgreSQL 设置（推荐）

开发主线使用 PostgreSQL。本地 `host-local` 以 `TRAPMAP_DATABASE_URL` 为准，`distributed` 宿主额外兼容 `DATABASE_URL`。迁移基线按 service owner 划分（约定见 `packages/service-*/drizzle/`，该目录布局未在此轮核对，细节以 `docs/reference/DATABASE_SCHEMA.md` 为准），distributed host 在启动时按固定依赖顺序执行。迁移只支持空库，已有开发数据库需重建。没有数据库 URL 时，部分本地姿态回退到 JSON 文件存储。

```bash
createdb trapmap
```

`createdb` 需要你本机装好 PostgreSQL 客户端并连上本地实例。

### JSON 文件存储（兼容回退）

未设置数据库 URL 时，`local-agent` 回退到 `.data/skill-shareer.json` 文件存储。该默认值仍在 `packages/host-local/src/nest/config/config.ts` 里生效，只做兼容，不做推荐。

## 3. 启动开发服务器

### 方式一：直接运行（推荐）

```bash
# 终端 1：启动最小本地网关或完整团队网关
pnpm dev -- local-agent
# 或
pnpm dev -- team-monolith

# 终端 2：启动 CLI（可选，用于发请求）
pnpm dev:cli
```

默认网关监听 `http://127.0.0.1:4000`。`local-agent` 与 `team-monolith` 由 `@trapmap/host-local` 提供，`distributed` 相关目标由 `@trapmap/host-distributed` 提供。兼容别名 `pnpm dev:local-agent`、`pnpm dev:team-monolith`、`pnpm dev:distributed:*` 照常可用。

拆分运行时（需要 PostgreSQL）：

```bash
pnpm dev -- gateway
pnpm dev -- candidate-worker
pnpm dev -- governance-worker
pnpm dev -- outbox-worker
```

### 方式二：Docker Compose

需要 Docker。

```bash
docker compose up -d

docker compose logs -f

docker compose down
```

## 4. 验证安装

### 健康检查

网关运行后可跑，不需要认证。

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

健康快照里注意这组请求上下文声明：

```json
{
  "requestContext": {
    "requestIdHeader": "x-request-id",
    "traceHeader": "traceparent"
  }
}
```

对外只用 `traceparent` 做 trace 传播。`x-trace-id` 只出现在 distributed 内部 hop，不对外暴露。`/ready` 在未就绪时返回 `503`，其余探针语义见 `docs/operations/OBSERVABILITY-OPERATIONS.md`。

### 运行测试

离线可跑（PG 集成用例在没有数据库时自动跳过）。

```bash
pnpm test

pnpm typecheck

pnpm lint
```

### 运行评测

冒烟评测需要 Docker（它经 PG 协调器拉起临时库），不需要 LLM key。

```bash
pnpm --filter @trapmap/evals eval:smoke
```

`eval:smoke` 之外的评测入口（`eval:core`、`eval:ci`、`eval:ci:core`、各 suite 分入口）见 `docs/operations/TESTING.md`。

## 5. 常用开发命令

| 命令 | 说明 | 前置条件 |
|------|------|----------|
| `pnpm build` | 构建全部包 | 无 |
| `pnpm dev -- local-agent` | 最小本地网关，热重载 | 无（PG 可选） |
| `pnpm dev -- team-monolith` | 完整团队网关，热重载 | PostgreSQL |
| `pnpm dev:cli` | 开发模式启动 CLI | 无 |
| `pnpm test` | 全部单元测试 | 无（PG 用例无库时跳过） |
| `pnpm typecheck` | 全仓类型检查 | 无 |
| `pnpm check` | Biome 检查 | 无 |
| `pnpm format` | 自动格式化 | 无 |

## 6. 目录结构

```text
Trap-Map/
├── packages/
│   ├── host-local/       # local-agent / team-monolith 宿主
│   ├── host-distributed/ # distributed 宿主
│   ├── contracts/        # 共享 Schema
│   ├── db/               # PostgreSQL schema 真源
│   ├── service-*/        # 六个领域 owner 包
│   └── skills/           # 项目 Skill 定义
├── apps/
│   ├── cli/              # CLI 客户端
│   └── mcp/              # MCP 接入封装
├── evals/                # 评估系统
├── scripts/              # 脚本与守卫
├── docs/                 # 项目文档
```

`packages/server/` 兼容壳已于 2026-07-31 删除，引用它的旧命令一律失效，见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md（已归档，路径冻结）`。

## 7. 常见问题

### 端口被占用

`4000` 端口被占用时换端口：

```bash
PORT=4001 pnpm dev:local-agent
```

### pnpm install 失败

先对齐 pnpm 版本再重装：

```bash
corepack prepare pnpm@10.33.0 --activate
pnpm install
```

### 评测前要起服务吗

`eval:smoke` 自带 PG 协调，不依赖你手动起网关。Live 评测（`eval:retrieval:live`）才需要运行中的服务加 token，见 `docs/operations/TESTING.md`。

## 常见用法

下面三条轨道分别对应一种部署形态。形态定义见 `docs/architecture/DEPLOYMENT.md`，变量默认值见 `docs/reference/ENVIRONMENT.md`。

### local-agent 轨道（单用户本地）

前置条件：§1 的 `pnpm install` 与 `pnpm build` 已过。PostgreSQL 可选，未配时回退 JSON 文件存储（见 §2）。

```bash
pnpm dev -- local-agent
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

你看到 `200` 就开跑。启动的东西：单个 `@trapmap/host-local` 进程（经 `@trapmap/app-light` 组装）。日志去向：进程 stdout（NestJS logger）；配了 `LOKI_HOST` 才多一路 Loki。文件日志路径未知/待确认（2026-09-08）。

### team-monolith 轨道（完整团队网关）

前置条件：PostgreSQL 在跑，`TRAPMAP_DATABASE_URL` 已配（见 §2）。

```bash
pnpm dev -- team-monolith
curl http://127.0.0.1:4000/health
pnpm --filter @trapmap/cli dev -- --help
```

启动的东西：同一个 `app-light` 进程，profile 切到 `team-monolith` 后注册完整路由族。验证点：`/health` 的 `deployment.profile` 为 `team-monolith`；CLI `--help` 列出全部命令族。日志去向与 local-agent 相同。

### distributed 轨道（网关加 workers）

前置条件：PostgreSQL 在跑；compose 服务划分见 `docs/architecture/DEPLOYMENT.md`。

```bash
pnpm dev:distributed:gateway
pnpm dev:distributed:candidate-worker
pnpm dev:distributed:governance-worker
pnpm dev:distributed:outbox-worker
```

启动的东西：网关进程（`4000`）加三个 worker 进程（实现见 `packages/host-distributed/src/`，可执行脚本见 `apps/distributed/package.json`）。验证点：网关 `curl http://127.0.0.1:4000/ready` 返回 `200`；各 worker 进程无报错退出。日志去向：每个进程各自的 stdout，你按终端窗口区分；需要聚合时再配 Loki。
