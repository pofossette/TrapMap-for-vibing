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
rtk pnpm test:runtime-foundations
rtk pnpm test:deployment-smoke
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

## 可观测性专项

```bash
rtk pnpm --filter @trapmap/server test --run src/lib/runtime/metrics.test.ts
rtk pnpm --filter @trapmap/server test --run src/lib/runtime/tracing-port-adapter.test.ts
rtk pnpm --filter @trapmap/server test --run src/lib/runtime/health-adapter.test.ts
rtk pnpm --filter @trapmap/server test --run src/lib/runtime/observability-integration.test.ts
rtk pnpm --filter @trapmap/contracts test --run src/domain/log-schema.test.ts
```

## 服务发现专项

```bash
rtk pnpm --filter @trapmap/backend-core test --run src/discovery/
rtk pnpm --filter @trapmap/host-local test --run src/nest/service-discovery/
```

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
curl -H "traceparent: 00-abc123-def456-01" http://localhost:4000/health

# 检查 X-Trace-Id header
curl -v http://localhost:4000/health 2>&1 | grep X-Trace-Id
```
