# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线目录：说明任务背景、总体要求和验收边界；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为“仍有参考价值”而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。

## 当前主线

- **主题：** Documentation Validation and Observability Platform
- **目标：** 让文档事实可由源码验证，并将 OTel 收敛为统一、可运营的遥测标准，以 Sentry 错误智能和 Langfuse LLM/eval 观测通道补齐运营闭环。
- **状态：** `进行中`
- **主细则：** [Documentation Validation and Observability Platform](docs/todos/documentation-validation-and-observability-platform.md)
- **设计规格：** [Documentation Validation and Observability Platform Design](docs/superpowers/specs/2026-08-01-documentation-validation-and-observability-platform-design.md)
- **状态口径：** `进行中` 只表示该主细则仍是 active execution surface；任务完成度、阻塞项和证据以主细则复选框与 closeout 记录为准。

## 执行路线图

| 阶段 | 主细则任务 | 阶段交付 | 放行条件 |
|---|---|---|---|
| 1. 事实边界 | Task 1-2 | active docs、权威源码路径和历史/当前边界对齐 | 退役路径不再被 active docs 当作现行事实，文档基础检查通过 |
| 2. 文档守卫 | Task 3-4 | source-aware reference/truth guard，CI 独立阻断 | reference、truth、links 三类守卫均可定位失败并在 CI 阻断 |
| 3. 运行时信号 | Task 5-8 | 统一 OTel policy，以及 HTTP、internal-hop、async、domain live signals | 真实运行时信号可导出，关联字段稳定，指标标签保持低基数 |
| 4. 运营闭环 | Task 9-11 | Sentry 错误智能、Langfuse LLM/eval 观测、live verification、runbook 和 deferred gates | 两个外部通道均可选且可降级，跨信号关联和隐私边界有可复核证据 |

阶段必须按顺序推进；任一阶段未通过放行条件，不得用后续阶段的实现掩盖前置事实或守卫失败。具体步骤和证据位置见[主细则](docs/todos/documentation-validation-and-observability-platform.md)。

## 任务背景

当前文档 guard 不能验证权威源码路径仍存在，CI 对链接错误也不阻断；OTel 已有接缝但部分指标不来自真实运行时。Sentry 的 shared policy、host-local module、host-distributed adapter 和脱敏测试已经存在，但 distributed 生命周期、全局异常边界和异步终态仍需接线与 closeout。Langfuse 当前只有显式 `--platform langfuse` 的 eval mirror，已覆盖 run/case/score/assertion/trace-step 和 self-host live evidence；产品运行时尚未记录 LLM/embedding generation，也没有和 OTel correlation 共用的 Langfuse privacy/config contract。本主线先建立事实与信号的正确性，再完成 Sentry 和 Langfuse 的可选运营闭环。

## 范围边界

本轮纳入：

- active Markdown 的本地链接、源码路径和声明事实校验，并将结果接入阻断 CI；
- `contracts`、`host-local` 和 `host-distributed` 之间统一的 OTel 配置、生命周期、关联和脱敏语义；
- HTTP、内部 hop、异步任务和关键领域操作的真实运行时信号；
- 现有 Sentry adapter 的 composition-root、全局异常、异步终态和 live transport closeout；
- Langfuse 的显式 eval mirror、运行时 LLM/embedding observation、OTel correlation 映射和统一脱敏/失败语义；
- 无密钥的运营验证、runbook 和外部平台采用门槛。

本轮不纳入：

- Collector、LGTM、Sentry、dashboard、retention 或 SLO 平台的默认部署资产；
- 将 prompt、知识正文、request body、headers、cookie、credential、token、session 或动态 ID 写入遥测出口；
- `backend-core` 或领域包直接依赖 OTel/Sentry/Langfuse SDK，或引入第二条 trace/metrics 管线；
- 在缺少真实环境基线前冻结生产告警阈值、正式 SLO 或更高成熟度的服务自治承诺。

## 总体要求

- **优先考虑长期维护，接受短期工作量膨胀。** 当额外工作能消除重复 truth source、长期漂移、无 owner 的 telemetry seam 或未经测试的隐私边界时，必须优先完成；不得为压缩本轮工作量保留这些已知缺口。
- `packages/contracts` 是 correlation、脱敏和配置 contract 的唯一来源；`backend-core` 只定义 port，不依赖 OTel/Sentry SDK；host composition root 拥有外部 SDK。
- 遥测只记录最小必要数据：动态 ID 不得成为 Prometheus label，prompt、知识正文、request body、headers、cookie、credential、token 和 session 不得传出。
- `OTEL_DISABLED=true`、缺失 `SENTRY_DSN`、`LANGFUSE_ENABLED=false`、Langfuse 配置不完整和任一 exporter/backend 故障均不得影响业务请求、异步任务或 eval 退出语义。
- Langfuse mirror 的 native TrapMap JSON report 仍是唯一 eval truth source；Langfuse 不参与通过判定，也不复制全量 OTel metrics。
- 不把 Collector、LGTM、Sentry、Langfuse、dashboard、retention 或 SLO 平台写成仓库内默认部署资产；成熟平台能力只能在满足明确进入条件后新建主线。
- 每个完成阶段必须包含代码、focused test、相关 closeout、文档回写与 CI evidence；跨包边界变化必须运行 Fallow audit。

## 验证门禁

- 文档或目录规则变更至少运行 `rtk pnpm check:docs` 和 `rtk pnpm check:structure`；新增 reference/truth/Markdown 规则时补跑对应 guard。
- 检索、摘要、治理、feedback、fixtures 或 eval runner 受影响时，至少运行 `rtk pnpm eval:smoke`。
- 跨包导入或边界变化必须运行 `rtk pnpm exec fallow audit --base main`，并记录基线限制而不是降低检查强度。
- 每个阶段的 focused test、typecheck、closeout 和文档回写证据必须落在主细则；根索引只呈现路线和门禁，不替代证据。

## 验收边界

- Active docs、源码 authority、scripts、CI、环境变量、runtime routes 和 workspace package facts 一致且由 blocking CI 验证。
- HTTP、内部 hop、异步任务和关键领域操作能通过 request/trace/operation/causation 关联；metrics 来自真实运行时且标签低基数。
- Sentry 仅聚合可行动系统错误，具有严格脱敏和 no-op 降级；不成为第二条 traces/metrics 管线。
- Langfuse 在显式启用时能观测 runtime LLM/embedding generation 与三类 eval suite，使用 OTel trace/request/operation 关联字段，默认只发送经过策略化脱敏的 metadata、hash、长度、耗时、provider/model 和结果分类。
- 告警、runbook 和 SLO 只基于实际验证过的信号与多轮基线；长期平台化需求进入显式 deferred landing spot。

完成主线还必须满足：所有 active detail completion gates 均有命令输出或测试证据，CI 中的文档守卫为 blocking，未完成事项已在主细则或长期债务登记册中标明后续落点。

## 长期债务与历史入口

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：不构成第二条 active mainline。
- [已归档 compatibility-shell retirement 主线](docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md)：保留 Wave-10 未完成证据，必要时按 debt 条件新建 scoped mainline。
- [历史归档总表](docs/archived/README.md)。
