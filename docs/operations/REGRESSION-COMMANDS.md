# 回归验证命令参考

## PR 必跑

```bash
rtk pnpm typecheck
rtk pnpm --filter @trapmap/contracts test --run
rtk pnpm --filter @trapmap/backend-core test --run
rtk pnpm --filter @trapmap/server test --run
rtk pnpm --filter @trapmap/host-local test --run
```

## 阶段完成验证

```bash
rtk pnpm test:observability-closeout
rtk pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000
rtk pnpm test:discovery-closeout
rtk pnpm test:distributed-closeout
rtk pnpm test:runtime-foundations
rtk pnpm test:deployment-smoke
rtk pnpm test:distributed-acceptance
rtk pnpm test:runtime-closeout
rtk pnpm test:runtime-closeout:compose
rtk pnpm check:docs
rtk pnpm check:structure
```

## 可观测性专项

```bash
rtk pnpm test:observability-closeout
```

## 服务发现专项

```bash
rtk pnpm test:discovery-closeout
```

## 临时 Compose runtime closeout

```bash
rtk pnpm test:runtime-closeout:compose
```

该命令不使用固定 `4000`、不读取持久管理员密钥，并始终清理临时 Compose containers 与 volumes。它量化单个 `knowledge-write` 重启的 gateway 委托恢复时间（阈值 60 秒），同时要求 job-runtime status surface 持续成功；这是本地隔离证据，不是生产 SLO。

## 端到端验证（需要 docker compose）

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
rtk pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000
```
