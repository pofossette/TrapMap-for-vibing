# Optional Service Split And MQ

## Purpose

TrapMap 默认仍然以模块化单体方式运行：同一套代码、同一套 contracts、同一个 PostgreSQL 数据库。

这一能力只增加“按部署拆分进程”和“可选把 task transport 切到 RabbitMQ”两种部署期选择，不引入新的写路径事实源。

## Supported Shapes

- `monolith`: API、task worker、outbox worker 在同一进程中运行，`task_queue` 和 `domain_event_outbox` 都在 PostgreSQL。
- `split-pg`: API、task worker、outbox worker 可以拆成多个进程，但 task transport 仍然使用 PostgreSQL `task_queue`。
- `split-rabbitmq`: API 与 task worker 拆分，task transport 改为 RabbitMQ，`domain_event_outbox` 仍然固定使用 PostgreSQL。

## Deployment Presets

`TRAPMAP_DEPLOYMENT_PRESET` 只决定进程启动时的 runtime ownership，不改变 contracts，也不引入服务级数据库拆分。

| Preset | Runtime Mode | Service Unit |
|------|------|------|
| `monolith` | `combined` | `full-platform` |
| `api` | `api` | `full-platform` |
| `candidate-worker` | `task-worker` | `candidate-ingestion` |
| `governance-worker` | `task-worker` | `knowledge-governance` |
| `outbox-worker` | `outbox-worker` | `knowledge-governance` |

## Transport Invariants

- 默认值仍然是 `TRAPMAP_TASK_TRANSPORT=postgres`。
- `TRAPMAP_TASK_TRANSPORT=rabbitmq` 只影响异步任务投递，不影响领域事件持久化边界。
- `domain_event_outbox` 在所有支持模式下都保留在 PostgreSQL。
- Mixed mode 下允许 `task.provider === rabbitmq`，但 `event.provider` 必须始终是 `postgres`。

## Explicit Non-Goals

- 不做 per-service database split。
- 不引入 Kafka、NATS 或 Redis Streams。
- 不把 PostgreSQL outbox 改成 broker-published domain events。
- 不改变现有 API、contracts 和默认部署兼容性。

## Operator Guidance

- 没有持续积压、隔离或扩缩容需求时，保持默认 monolith + PostgreSQL task queue。
- 需要拆分 worker 进程时，优先采用 `split-pg`，因为它保持最少运维变量。
- 只有在 task backlog、独立扩容或隔离需求明确时，才启用 RabbitMQ task transport。
- 即使启用了 RabbitMQ，也应继续把 PostgreSQL 当作 domain event durability 的权威边界。
