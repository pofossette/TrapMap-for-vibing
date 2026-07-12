# @trapmap/service-job-runtime

宿主组装体的共享作业运行时服务模块。

`job-runtime` 是 `task_queue`、`domain_event_outbox` 的 claim、complete、fail、requeue、lease 和 dead-letter 运行时 owner。业务服务通过内部 job-runtime port 调度 follow-up，不直接取得这些运行时写能力；业务事实与其本地 outbox append 仍由各自 aggregate owner 负责。
