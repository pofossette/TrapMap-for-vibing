# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线目录：说明任务背景、总体要求和验收边界；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在链接的 active detail 中。

## 当前主线

- **主题：** Documentation Validation and Observability Platform
- **目标：** 让文档事实可由源码验证，并将 OTel 发展为可运营的统一遥测标准，以可选 Sentry 异常智能层补足错误聚合。
- **状态：** `进行中`
- **主细则：** [Documentation Validation and Observability Platform](docs/todos/documentation-validation-and-observability-platform.md)

## 任务背景

当前文档 guard 不能验证权威源码路径仍存在，CI 对链接错误也不阻断；OTel 已有接缝但部分指标不来自真实运行时，Sentry 尚未接入。本主线先建立事实与信号的正确性，再推进异常聚合和运营闭环。

## 总体要求

- **优先考虑长期维护，接受短期工作量膨胀。** 当额外工作能消除重复 truth source、长期漂移、无 owner 的 telemetry seam 或未经测试的隐私边界时，必须优先完成；不得为压缩本轮工作量保留这些已知缺口。
- `packages/contracts` 是 correlation、脱敏和配置 contract 的唯一来源；`backend-core` 只定义 port，不依赖 OTel/Sentry SDK；host composition root 拥有外部 SDK。
- 遥测只记录最小必要数据：动态 ID 不得成为 Prometheus label，prompt、知识正文、request body、headers、cookie、credential、token 和 session 不得传出。
- `OTEL_DISABLED=true`、缺失 `SENTRY_DSN` 和 exporter/backend 故障均不得影响业务请求或异步任务。
- 不把 Collector、LGTM、Sentry、dashboard、retention 或 SLO 平台写成仓库内默认部署资产；成熟平台能力只能在满足明确进入条件后新建主线。
- 每个完成阶段必须包含代码、focused test、相关 closeout、文档回写与 CI evidence；跨包边界变化必须运行 Fallow audit。

## 验收边界

- Active docs、源码 authority、scripts、CI、环境变量、runtime routes 和 workspace package facts 一致且由 blocking CI 验证。
- HTTP、内部 hop、异步任务和关键领域操作能通过 request/trace/operation/causation 关联；metrics 来自真实运行时且标签低基数。
- Sentry 仅聚合可行动系统错误，具有严格脱敏和 no-op 降级；不成为第二条 traces/metrics 管线。
- 告警、runbook 和 SLO 只基于实际验证过的信号与多轮基线；长期平台化需求进入显式 deferred landing spot。

## 长期债务与历史入口

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：不构成第二条 active mainline。
- [已归档 compatibility-shell retirement 主线](docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md)：保留 Wave-10 未完成证据，必要时按 debt 条件新建 scoped mainline。
- [历史归档总表](docs/archived/README.md)。
