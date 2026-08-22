# TrapMap Level 3 平台化决策冻结设计

> 状态：**已冻结（人类批准 2026-08-22，五项全批准）**。授权：主线 docs/todos/debt-mcp-platformization-mainline.md Task C1；用户裁决解除 DEPLOYMENT.md 原 Level 2 / 不做 DB 拆分 / 先不做清单冻结。

## 冻结决策

### D1 编排目标
Kubernetes ≥1.29 为目标平台；本地/CI 用 kind 验证；raw manifests（k8s/base + k8s/overlays），不引入 Helm。放弃项：Nomad/Docker Swarm/Helm chart 仓库。

### D2 消息通道
PG `task_queue`/`domain_event_outbox` 是 transport of record（SKIP LOCKED/租约/幂等已验证）；broker 仅经既有 task transport port 的特性开关适配器引入（`TRAPMAP_TASK_TRANSPORT=pg|amqp`，默认 pg）。放弃项：broker 作为默认通道、事件自动外流。

### D3 服务发现
Consul 保留；k8s DNS adapter 位于 `DiscoveryPort` 之后（发现抽象不变）。放弃项：替换 Consul 为全动态注册中心。

### D4 SLO 基线
gateway 可用性 99.5%；内部 hop p99 ≤500ms；gateway 读 p99 ≤1s；单服务重启 RTO ≤60s（沿用 closeout 阈值口径）；RPO=0（共享 PG WAL）。

### D5 数据隔离
选择性 database-per-service 逐 owner 实施，首个试点 **job-runtime**（人类确认）；不做全量拆分、跨服务事务/XA/PgBouncer 前置化。

## 资源预算推导
以 service-config 的 per-service pool budget seam 为基线：每 worker 实例 requests = pool 连接数 × 20MB + 256MB 基座；limits ×2；candidate-worker/outbox-worker HPA CPU target 70%。详见 k8s/base manifests 注释。

## 与任务映射
C2-C5 韧性硬化（已交付）；C6 k8s 资产；C7 amqp 适配器（特性开关）；C8 job-runtime 隔离试点（Tranche 6 前置证据由用户裁决豁免，记录于登记册回写）。
