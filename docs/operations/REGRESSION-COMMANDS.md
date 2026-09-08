# 回归验证命令参考

> 状态：Active。本页命令全部在仓库根执行，前置条件写在每节开头。

## PR 必跑

离线可跑，PG 集成用例无库时跳过。三个包的 `test` 脚本都已核对存在：

```bash
pnpm typecheck
pnpm --filter @trapmap/contracts test --run
pnpm --filter @trapmap/backend-core test --run
pnpm --filter @trapmap/host-local test --run
```

## 阶段完成验证

closeout 类需要运行中的网关，benchmark 需要网关，compose 变体需要 Docker，守卫离线可跑：

```bash
pnpm test:observability-closeout
pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000
pnpm test:discovery-closeout
pnpm test:distributed-closeout
pnpm test:runtime-foundations
pnpm test:deployment-smoke
pnpm test:distributed-acceptance
pnpm test:runtime-closeout
pnpm test:runtime-closeout:compose
pnpm check:docs
pnpm check:structure
```

## 可观测性专项

需要运行中的网关：

```bash
pnpm test:observability-closeout
```

## 服务发现专项

离线可跑：

```bash
pnpm test:discovery-closeout
```

## 临时 Compose runtime closeout

需要 Docker。该命令不用固定 `4000`，不读持久管理员密钥，结束时清理临时 Compose containers 与 volumes。它量化单个 `knowledge-write` 重启的网关委托恢复时间（阈值 60 秒），同时要求 job-runtime 状态面持续成功。这是本地隔离证据，不是生产 SLO。

```bash
pnpm test:runtime-closeout:compose
```

## 端到端验证（需要 docker compose）

`docker-compose.observability.yml` 已核对存在。Prometheus 与 Grafana 按 compose 内端口访问：

```bash
docker compose -f docker-compose.observability.yml up -d

# 验证 Prometheus 抓取
curl http://localhost:9090/api/v1/targets

# 验证 Grafana dashboard
# 浏览器打开: http://localhost:3000/d/trapmap-overview

# 验证健康检查
curl http://localhost:4000/health | jq .status

# 验证指标
curl http://localhost:4000/metrics | head -20

# 验证追踪（传入 traceparent header）
curl -s -D /tmp/trapmap-trace-headers.txt \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  http://localhost:4000/health -o /dev/null

# 检查 traceparent header
grep -i traceparent /tmp/trapmap-trace-headers.txt

# 记录 observability 性能基线
pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000
```

对外 trace 传播只用 `traceparent`，不要写 `X-Trace-Id`（那是 distributed 内部 hop 头）。

## 常见用法

下面组合按场景取用，前置条件见上文各节。命令定义以仓库根 `package.json` 为准。

### PR 最小回归（离线）

```bash
pnpm typecheck
pnpm --filter @trapmap/contracts test --run
pnpm --filter @trapmap/backend-core test --run
pnpm --filter @trapmap/host-local test --run
```

四条无库可跑，PG 用例自动跳过。你改了 `host-distributed` 就加 `pnpm test:distributed-closeout`（要网关）。

### 文档加守卫回归（离线）

```bash
pnpm check:docs
pnpm check:structure
```

你只改文档或守卫时跑这两条，替代全量测试。

### 触及 distributed 写路径时加跑

```bash
pnpm test:distributed-acceptance
```

你改了 `packages/host-distributed` 的权威写路径、网关透传、internal client 语义或 job ownership 时，这条是必跑门，不用 `test:deployment-smoke` 代替。
