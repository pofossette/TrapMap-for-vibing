# 服务发现与可观测性升级 - 活跃实施细则

**状态：** 进行中  
**目标：** 为 TrapMap 建立可渐进落地、可验证、可回退的服务发现与可观测性能力  
**技术边界：** Consul + Prometheus + Tempo + Loki + Grafana + OpenTelemetry

---

## 目录

1. [实施原则](#1-实施原则)
2. [Phase 0 基础架构设计](#2-phase-0-基础架构设计)
3. [Phase 1A 应用接入骨架](#3-phase-1a-应用接入骨架)
4. [Phase 1B 服务发现 MVP](#4-phase-1b-服务发现-mvp)
5. [Phase 2A Metrics 与 Dashboard MVP](#5-phase-2a-metrics-与-dashboard-mvp)
6. [Phase 2B Tracing MVP](#6-phase-2b-tracing-mvp)
7. [Phase 2C Logging MVP](#7-phase-2c-logging-mvp)
8. [Phase 3 生产化增强](#8-phase-3-生产化增强)
9. [Phase 4 跨阶段回归与基准](#9-phase-4-跨阶段回归与基准)
10. [Phase 5 文档与交付收口](#10-phase-5-文档与交付收口)
11. [风险与注意事项](#11-风险与注意事项)
12. [依赖关系与并行策略](#12-依赖关系与并行策略)
13. [统一验收口径](#13-统一验收口径)

---

## 1. 实施原则

### 1.1 这次优化要解决的问题

旧版计划存在四个执行层面的缺口：

- 阶段定义偏线性，导致可并行工作被串行化
- 测试与文档过度后置，和仓库“每次改动跑最小验证”的约束不一致
- 计划中混入过多示例代码，约束了后续实现选择
- 健康检查、配置注入、生命周期接入等“应用骨架问题”放得太后，前置阶段缺少真正可上线的接入面

### 1.2 本版计划的执行原则

- 每个 phase 必须产出一个可以独立 review 的最小可交付面
- 每个 phase 都必须自带 `完成定义（DoD）`、最小验证命令和文档回写要求
- 每个计划任务文档都必须包含用于追踪进度的复选框；phase、任务、验收项至少一层使用 `- [ ]` / `- [x]`
- `Phase 4` 只做跨阶段回归、故障注入和性能基准，不再承担“补测试”职责
- 能并行的能力拆开推进：`discovery` 与 `observability foundation` 不强行串行
- 外部依赖默认按 `fail-open / graceful degradation` 设计，避免把基础设施不可用直接变成应用不可启动

### 1.3 运行模式矩阵

| 模式 | 目标 | 必需组件 | 可选组件 | 约束 |
|------|------|---------|---------|------|
| `dev-minimal` | 本地快速开发 | 应用本身、stdout 日志 | Consul、OTel、Loki、Tempo、Grafana | 外部依赖缺失时应用可启动 |
| `dev-observability` | 本地联调 | 应用、Prometheus、Grafana、Tempo、Loki | Consul | 允许使用 docker compose 单机栈 |
| `ci-unit` | PR 最小验证 | 单元测试、静态检查 | Testcontainers | 不依赖长期运行服务 |
| `ci-integration` | 阶段级验证 | Testcontainers / deployment smoke | Grafana UI 人工检查 | 可接受分钟级执行时间 |
| `prod-like` | 部署与回归 | 所有目标组件 | 高级告警、HA | 资源限制、保留策略、采样策略必须显式配置 |

### 1.4 最小可交付面（MVP）定义

首个可接受里程碑不是“全套 LGTM + Consul 全功能”，而是：

- 应用具备统一的 discovery / telemetry 接入骨架
- 可以注册与发现服务，且 Consul 不可用时应用仍可降级启动
- 可以暴露 `/health`、`/ready`、`/live`、`/metrics`
- 可以采集核心 HTTP 指标
- 可以将请求 trace 发送到 Tempo，并能拿到 trace id
- 可以输出统一结构化日志，并具备进入 Loki 的明确接入路径

### 1.5 默认降级策略

- Consul 不可用：应用启动不失败；服务注册失败记日志、暴露状态、保留本地 fallback
- OTel exporter 不可用：应用继续提供服务，采集器故障不阻塞主请求
- Loki 不可用：日志回退 stdout / 默认 logger
- Grafana / Tempo / Prometheus 不可用：不影响业务实例 `live`，仅影响聚合观测能力
- 健康检查语义分离：
  - `/live` 只代表进程与主循环存活
  - `/ready` 只判断实例是否能安全接流量
  - 依赖系统的细粒度状态放入 `/health`

---

## 2. Phase 0 基础架构设计

**状态：** 完成  
**目标：** 明确选型、拓扑、运行模式与降级策略，避免后续阶段在基础假设上反复返工

### 进度追踪

- [x] 明确 phase 目标与边界
- [x] 产出架构与技术选型文档
- [x] 落地本地基础设施 compose/config
- [x] 补齐运行模式矩阵、MVP 与降级策略

### 范围

- 产出可观测性与服务发现架构文档
- 产出技术选型对比和取舍边界
- 产出本地 docker compose 栈与基础配置
- 补齐运行模式矩阵、最小可交付面、默认降级策略

### 产出物

- `docs/architecture/OBSERVABILITY.md`
- `docs/architecture/SERVICE-DISCOVERY.md`
- `docs/architecture/TECH-SELECTION.md`
- `docker-compose.observability.yml`
- `config/` 下对应基础配置

### 仍需确认的设计出口

- `dev-minimal` 与 `dev-observability` 的 profile 切换方式
- 组件不可用时的默认行为是否全部实现为 `fail-open`
- 是否需要把 Consul KV 明确从 MVP 排除，延后到 Phase 3

### 完成定义（DoD）

- [x] 技术选型、拓扑、运行模式和降级策略已文档化
- [x] 本地可观测性基础设施拓扑已落地为 compose/config
- [x] 根 `plan.md` 已仅保留索引，不再承载实现细节

### 最小验证

- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

---

## 3. Phase 1A 应用接入骨架

**状态：** 完成  
**目标：** 先稳定所有后续能力共享的接入点，避免每条子链路重复造轮子

### 进度追踪

- [x] 建立统一配置入口、feature flags 与 runtime profile 映射
- [x] 建立 discovery / telemetry 抽象接口与共享类型
- [x] 固定 `/health`、`/ready`、`/live`、`/metrics` 的语义和输出 shape
- [x] 接入 Nest bootstrap 生命周期钩子
- [x] 完成本 phase 最小验证与文档回写

### 范围

- 建立统一的配置入口、feature flags 和 runtime profile 映射
- 建立 discovery / telemetry 抽象接口，避免业务包直接依赖具体实现
- 确立 `/health`、`/ready`、`/live`、`/metrics` 的语义与输出 shape
- 定义 Nest bootstrap 生命周期中的注册、关闭、flush、shutdown 钩子

### 建议文件落点

- `packages/backend-core/src/domain/` 或就近 `ports/`：抽象接口与共享类型
- `packages/server/src/config.ts` 或对应 runtime 配置入口：可观测性/服务发现开关
- `packages/server/src/routes/` 或 `packages/host-local/src/nest/`：健康检查与 metrics surface

### 必做项

- 统一配置项命名：`CONSUL_*`、`OTEL_*`、`LOKI_*`、`PROMETHEUS_*`
- 定义“关闭某个外部依赖时，应用是否继续启动”的显式策略
- 固定健康检查响应字段，避免后续每阶段改 shape

### 可延期项

- 高级配置中心能力
- 多实例自动分片
- UI 级别的深度 dashboard 美化

### 文档回写

- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/operations/ENVIRONMENT.md`
- 受影响的架构/运行时默认值文档

### 完成定义（DoD）

- [x] 存在统一 discovery/telemetry 接口，业务实现不直连具体 SDK
- [x] 健康检查和 metrics surface 的语义固定并有测试保护
- [x] 应用在 `dev-minimal` 下可在外部依赖关闭时启动
- [x] 配置项、默认值和 profile 已回写文档

### 最小验证

- 相关包最小单测
- `rtk pnpm test:runtime-foundations`
- 若触及文档入口：`rtk pnpm check:docs-drift` 和 `rtk pnpm check:structure`

---

## 4. Phase 1B 服务发现 MVP

**状态：** 完成  
**目标：** 打通服务注册、注销、查询、缓存与故障降级，先交付够用的发现能力

### 进度追踪

- [x] 接入 Consul client / adapter
- [x] 完成服务注册与注销生命周期
- [x] 完成服务查询、实例选择、TTL/缓存
- [x] 实现 Consul 故障降级与状态暴露
- [x] 完成本 phase 最小验证与文档回写

### 范围

- Consul client / adapter
- 服务注册与注销生命周期
- 服务查询、实例选择、TTL/缓存
- Consul 故障时的降级路径与状态暴露

### 明确不在本 phase 内

- Consul KV 配置中心
- Federation / 多集群
- 复杂流量策略

### 关键设计约束

- `client-core` 不直接依赖 Nest provider；通过抽象端口消费发现能力
- 缓存策略必须显式包含 TTL、失效和失败回退
- 负载均衡先采用简单策略，例如 round-robin；不要在 MVP 阶段引入复杂权重算法

### 文档回写

- `docs/architecture/SERVICE-DISCOVERY.md`
- `docs/guides/SERVICE-DISCOVERY-GUIDE.md` 或现有对等入口
- `docs/operations/ENVIRONMENT.md` 中新增或变更的 Consul 配置项

### 完成定义（DoD）

- [x] 服务实例可自动注册与注销
- [x] 查询接口返回健康实例且具备本地缓存
- [x] Consul 不可用时应用进入降级模式而非直接启动失败
- [x] 端口边界与跨包导入保持合规

### 最小验证

- Consul 相关单测
- Consul 相关集成测试或最小 Testcontainers 验证
- `rtk pnpm test:deployment-smoke`
- 若触及跨包边界：`rtk pnpm exec fallow audit --base main`

---

## 5. Phase 2A Metrics 与 Dashboard MVP

**状态：** 完成  
**目标：** 优先交付最容易产生运维价值的指标链路

### 进度追踪

- [x] 暴露 `/metrics`
- [x] 采集核心 HTTP / 进程 / 关键业务指标
- [x] 打通 Prometheus 抓取配置
- [x] 提供 Grafana 最小 dashboard
- [x] 完成本 phase 最小验证与文档回写

### 范围

- 暴露 `/metrics`
- 采集核心 HTTP 指标、进程指标、关键业务计数器
- 将 Prometheus 抓取配置与 Grafana 最小 dashboard 打通

### 指标设计要求

- 默认只保留低基数标签
- 所有新增标签必须说明 cardinality 风险
- 指标命名遵循仓库既有命名规范；无规范时使用 Prometheus 社区惯例

### 文档回写

- `docs/architecture/OBSERVABILITY.md`
- `docs/guides/OBSERVABILITY-GUIDE.md`
- 需要的话补 `docs/guides/GRAFANA-DASHBOARDS.md`

### 完成定义（DoD）

- [x] `/metrics` 可用且输出稳定
- [x] Prometheus 成功抓取至少一组业务实例
- [x] Grafana 至少有一个可用的最小 dashboard
- [x] 指标标签已过一轮高基数风险检查

### 最小验证

- metrics 单测
- `/metrics` surface 测试
- `rtk pnpm test:runtime-foundations`
- 如涉及部署链路：`rtk pnpm test:deployment-smoke`

---

## 6. Phase 2B Tracing MVP

**状态：** 完成  
**目标：** 打通请求级 tracing 链路，而不是一开始追求复杂 span 覆盖

### 进度追踪

- [x] 接入 OTel SDK bootstrap
- [x] 覆盖关键请求链路 trace 采集
- [x] 打通 trace id 注入日志或响应头
- [x] 提供 Tempo 查询入口与最小验证流程
- [x] 完成本 phase 最小验证与文档回写

### 范围

- OTel SDK bootstrap
- 关键请求链路 trace 采集
- trace id 注入日志或响应头
- Tempo 查询入口与最小查询流程

### 关键设计约束

- exporter 故障不能阻塞主请求
- 先覆盖 HTTP / 关键 job 执行链路，再扩展细粒度 span
- 采样策略必须显式，不能默认无限量采集

### 文档回写

- `docs/architecture/OBSERVABILITY.md`
- 受影响的 runtime/defaults 文档

### 完成定义（DoD）

- [x] 至少一条请求链路可在 Tempo 中检索到完整 trace
- [x] 响应头或日志中可稳定拿到 trace id
- [x] exporter 失败不会导致应用不可用
- [x] 采样、超时和 endpoint 配置已文档化

### 最小验证

- tracing 单测
- 最小 trace export 集成验证
- `rtk pnpm test:runtime-foundations`

---

## 7. Phase 2C Logging MVP

**状态：** 完成  
**目标：** 统一结构化日志 schema，并明确进入 Loki 的可靠路径

### 进度追踪

- [x] 统一 JSON 日志 schema
- [x] 打通 stdout 与 Loki 传输路径
- [x] 评审并收敛 Loki 标签设计
- [x] 验证 logger 故障回退路径
- [x] 完成本 phase 最小验证与文档回写

### 范围

- 统一 JSON 日志字段
- 关键信息包括：`timestamp`、`level`、`service`、`environment`、`traceId`、`context`
- 明确 stdout 路径与 Loki collector / transport 路径

### 关键设计约束

- 先统一 schema，再决定 transport 细节
- Loki 不可用时必须保留 stdout 可读性
- 禁止引入高基数标签污染 Loki 查询与成本

### 文档回写

- `docs/architecture/OBSERVABILITY.md`
- `docs/operations/OBSERVABILITY-OPERATIONS.md`

### 完成定义（DoD）

- [x] 结构化日志字段稳定且有测试保护
- [x] 本地或集成环境中可以在 Loki 查询到目标日志
- [x] logger 故障时应用自动回退到安全输出路径
- [x] Loki 标签设计经过高基数审视

### 最小验证

- logging 单测
- 结构化日志格式测试
- Loki 最小集成验证

---

## 8. Phase 3 生产化增强

**状态：** 完成  
**目标：** 从”能跑”提升到”可长期运维”

### 进度追踪

- [x] 补齐采样、保留和资源限制策略
- [x] 细化健康检查与依赖状态分层
- [x] 补齐告警入口与 SLO/SLI 初版
- [x] 完成成熟库替换评估与结论回写
- [x] 完成本 phase 最小验证与文档回写

### 范围

- 资源限制、保留策略、采样策略
- 健康检查细化与依赖状态分层展示
- 故障注入与恢复策略
- 告警入口、SLO/SLI 初版
- 对成熟库替换进行显式评估并落文档

### 本 phase 必须显式决策的事项

- 是否以 LangChain `.withStructuredOutput()` 替换当前结构化输出解析
- 是否以成熟 resilience 库替换 `executeWithResilience`
- 是否将 Consul KV 纳入后续主线，还是继续 deferred

### 文档回写

- `docs/operations/OBSERVABILITY-OPERATIONS.md`
- `docs/operations/SECURITY.md`
- `docs/architecture/components/GOVERNANCE.md`
- 相关 debt register / replacement decision 文档

### 完成定义（DoD）

- [x] 采样、保留、资源限制与告警入口明确
- [x] 健康检查已区分实例存活、接流量能力和依赖状态
- [x] 成熟库替换结论已落文档，未替换也有暂缓理由和触发条件
- [x] 关键风险已回写 debt register 或自动化守卫

### 最小验证

- 相关模块单测
- 健康检查与配置回滚测试
- `rtk pnpm test:runtime-foundations`
- 视改动补 `rtk pnpm eval:smoke`

---

## 9. Phase 4 跨阶段回归与基准

**状态：** 待开始  
**目标：** 对已经分阶段落地的能力做系统级确认，而不是补前面积欠的基础测试

### 进度追踪

- [ ] 打通跨链路 E2E smoke
- [ ] 覆盖故障转移与恢复测试
- [ ] 建立性能基准
- [ ] 验证部署链路
- [ ] 沉淀可重复执行的回归命令

### 范围

- 端到端 smoke
- 故障转移 / 恢复测试
- 性能基准
- 部署链路验证

### 测试分层要求

- PR 必跑：单元测试、必要的集成测试、受影响 smoke
- 阶段完成必跑：该阶段相关的 Testcontainers / deployment smoke
- 回归必跑：跨链路 E2E、故障注入、性能基准

### 完成定义（DoD）

- [ ] 至少一条业务请求同时经过 discovery、metrics、tracing、logging 链路
- [ ] 故障注入可验证降级与恢复路径
- [ ] 性能开销、延迟和资源占用有基线
- [ ] 所有验证命令可重复执行并已记录到文档

### 最小验证

- 相关 E2E 测试
- `rtk pnpm test:deployment-smoke`
- 如有专门回归命令，回写到文档并在此 phase 执行

---

## 10. Phase 5 文档与交付收口

**状态：** 待开始  
**目标：** 做最终收口，而不是第一次补文档

### 进度追踪

- [ ] 收口架构、运行、部署、运维、故障排查文档
- [ ] 统一 README、AGENTS、`docs/README.md` 与各入口链接
- [ ] 收口测试命令、依赖条件和人工验收步骤
- [ ] 验证陌生执行者可按文档走通交付路径
- [ ] 运行最终文档与交付验证

### 范围

- 收口架构、运行、部署、运维、故障排查和演示材料
- 明确各入口文档索引
- 将阶段验证命令沉淀为可重复使用的最小验证清单

### 关键原则

- 每个 phase 完成时就应该同步最小文档；Phase 5 只负责统一口径和补最后的入口索引
- 如发现重复性漂移风险，优先补守卫脚本而不是补说明文字

### 完成定义（DoD）

- [ ] README、AGENTS、`docs/README.md`、架构/运维/指南文档入口一致
- [ ] 最终测试命令、依赖条件和人工验收步骤已写清楚
- [ ] 演示或交付路径可由陌生执行者按文档走通

### 最小验证

- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`
- 对最终交付链路补跑对应 smoke

---

## 11. 风险与注意事项

### 11.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Consul 不可用 | 服务发现失败 | 本地缓存、降级启动、状态暴露 |
| OTel 性能开销过高 | 请求延迟上升 | 显式采样、分 profile 配置、仅采集关键链路 |
| Prometheus 标签高基数 | 存储与查询成本上升 | 新标签必须做 cardinality 审查 |
| Loki 标签设计失控 | 查询性能下降、成本上升 | 先定 schema，再定 label；避免 request id 级标签 |
| Tempo 数据量失控 | 存储和网络成本增加 | 采样率、保留期和批量导出策略前置配置 |

### 11.2 过程风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 文档继续后置 | 事实漂移 | 每阶段强制回写 + docs guard |
| 测试继续集中到末期 | 回归成本暴涨 | 每阶段自带最小验证出口 |
| 过早绑定具体实现 | 后续调整成本高 | 计划只定义边界、DoD 和验证，不写实现锁定 |
| 把外部依赖可用性等同于实例存活 | 级联不可用 | 分离 `live` / `ready` / `health` 语义 |

---

## 12. 依赖关系与并行策略

```text
Phase -1 六边形架构清理（已完成）
    ↓
Phase 0 基础架构设计（已完成）
    ↓
Phase 1A 应用接入骨架
    ├── Phase 1B 服务发现 MVP
    └── Phase 2A Metrics 与 Dashboard MVP
            ├── Phase 2B Tracing MVP
            └── Phase 2C Logging MVP
                    ↓
                Phase 3 生产化增强
                    ↓
           Phase 4 跨阶段回归与基准
                    ↓
           Phase 5 文档与交付收口
```

### 并行策略说明

- `Phase 1A` 是后续所有能力共享的接入底座，必须先完成
- `Phase 1B` 与 `Phase 2A` 可以并行推进
- `Phase 2B`、`Phase 2C` 依赖 `Phase 1A`，但不强依赖 `Phase 1B` 完成
- `Phase 3` 需要前述 MVP 能力至少具备最小闭环
- `Phase 4` 和 `Phase 5` 只做系统级收口，不替代前面阶段的最小验证与最小文档同步

---

## 13. 统一验收口径

### 13.1 功能验收

- [ ] 服务注册、注销和查询在目标环境可用
- [ ] `/health`、`/ready`、`/live`、`/metrics` 均可用且语义稳定
- [ ] 至少一条请求链路同时具备 metrics、trace 和 structured logs
- [ ] Grafana 中至少有一套可用于排查的最小 dashboard / query 入口

### 13.2 非功能验收

- [ ] 可观测性与服务发现组件故障不会直接导致业务实例不可启动
- [ ] 关键配置、默认值、采样与保留策略均已文档化
- [ ] 指标标签与日志标签已做高基数风险审查

### 13.3 测试验收

- [ ] 每个 phase 都有自己的最小验证命令
- [ ] 阶段级集成测试与系统级回归测试分层清晰
- [ ] 回归命令可重复执行，不依赖隐式本地状态

### 13.4 文档验收

- [ ] 根 `plan.md` 保持索引定位
- [ ] 活跃细则记录阶段边界、DoD、验证命令和 deferred 范围
- [ ] README、AGENTS 和 `docs/README.md` 的入口描述一致

---

**最后更新：** 2026-07-02
