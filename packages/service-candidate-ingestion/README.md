# @trapmap/service-candidate-ingestion

宿主组装体的共享候选摄取服务模块。

## Distributed scheduling boundary

候选处理 follow-up 只通过远程 `job-runtime` schedule surface 提交并返回 owner 提供的 `jobId`。本服务不取得 task queue/outbox runtime capability，也不在 `job-runtime` 返回 `409`、`503` 或 `504` 时 direct-write 或本地 enqueue；这些错误按 `InvocationError` 语义返回。
