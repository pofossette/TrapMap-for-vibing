# 服务发现架构

> 服务注册、动态发现与静态 URL 回退的事实以 `packages/host-local`、`packages/host-distributed` 和 `packages/backend-core` 的源码为准。状态：Active。

## 角色

- `packages/host-local/src/nest/service-discovery/`（`consul.module.ts`、`consul.service.ts`、`index.ts`）拥有 Consul client、注册、注销、KV 与 health check 接线。
- `packages/host-distributed/src/gateway/` 拥有消费侧：`discovery-factory.ts` 选型、`consul-discovery-adapter.ts` 适配、`discovery-resolver.ts` 解析、`health-aggregator.ts` 聚合。
- Consul 是可选注册中心。Consul 不可用时 gateway 靠静态 URL 继续工作。

## 注册与注销

`ConsulService.onModuleInit` 读 `CONSUL_ENABLED`、`CONSUL_HOST`、`CONSUL_PORT`，可用且允许自动注册时构造 `ServiceRegistration` 并注册；`onModuleDestroy` 时发送注销。健康检查复用既有 HTTP health contract，不另起探针体系。

## 健康语义映射

TrapMap 健康状态映射到 Consul 语义（ Concept 保留，实现以 `health-aggregator.ts` 与各服务 `/internal/health|live|readiness|ready` 为准）。gateway 健康聚合在 distributed 下计入 `go-accelerator /ready` 与 `knowledge-read-go /health /ready`（`packages/host-distributed/src/gateway/routes.ts:194-322` 经 `getKnowledgeReadGoConfig()`）。

## 环境变量

| 变量 | 缺省 | 说明 |
|---|---|---|
| `CONSUL_ENABLED` | `false` | 是否启用 Consul-backed discovery / registration |
| `CONSUL_HOST` | `localhost` | Consul host |
| `CONSUL_PORT` | `8500` | Consul HTTP API 端口 |
| `SERVICE_NAME` | `trapmap` | host-local Consul 注册服务名 |

`docker-compose.yml` 中 Consul 相关服务使用 `distributed` profile；`host-local` 零 Go 依赖，Consul 可选注册与其他服务一致。
