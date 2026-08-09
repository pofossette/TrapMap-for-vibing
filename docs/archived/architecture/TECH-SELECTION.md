# 技术选型文档

> 本文档记录 TrapMap 服务发现与可观测性平台的技术选型过程及决策依据。
>
> 最后更新：2026-07-02

---

## 1. 服务发现选型

### 1.1 候选方案对比

| 维度 | Consul | etcd | Docker DNS |
|------|--------|------|------------|
| **核心定位** | 专用服务发现与配置管理 | 分布式键值存储（Kubernetes 控制面） | 容器间简单 DNS 解析 |
| **健康检查** | 内置多种模式（HTTP/TCP/gRPC/Script/TTL） | 需通过 lease TTL 实现，无专用机制 | 仅依赖 Docker 健康检查，功能有限 |
| **服务注册** | 原生支持，提供丰富元数据 | 需应用自行写入 KV | 自动（Docker 网络内），但无元数据 |
| **DNS 接口** | 内置 DNS 转发，可直接通过 DNS 查询服务 | 无原生 DNS 支持 | 原生 DNS，但仅限容器名解析 |
| **KV 存储** | 内置，支持分布式锁、Session | 核心功能，强一致性 Raft | 不支持 |
| **多数据中心** | 原生支持 WAN 联盟 | 需额外运维 | 不支持 |
| **社区成熟度** | HashiCorp 维护，生产级成熟 | CNCF 毕业项目，K8s 生态核心 | Docker 内置，无需额外部署 |
| **Nest.js 集成** | `@nestjs/consul`、`nestjs-consul` 等成熟包 | 需自行封装 | 无 SDK，纯基础设施层 |

### 1.2 决策：选择 Consul

**理由：**

1. **专门服务发现设计** — Consul 的核心使命就是服务发现与健康检查，而非像 etcd 那样作为通用 KV 存储后被借用。其服务目录、健康检查编排、流量路由等能力均为一等公民。
2. **内置完整工具链** — 健康检查（HTTP/TCP/gRPC/Script）+ DNS 接口 + KV 存储 + 多数据中心 WAN 联盟，开箱即用，无需拼装多个组件。
3. **社区成熟** — HashiCorp 持续维护，大量生产环境验证，文档完善。
4. **Nest.js 原生支持** — 官方和社区提供成熟的 Consul 集成包（`@nestjs/consul`），可直接在服务启动时自动注册、退出时自动注销。

### 1.3 适用场景

- 微服务数量增长中，需要服务发现与负载均衡
- 需要多环境/多数据中心的服务拓扑管理
- 团队使用 Docker Compose 部署，暂未引入 Kubernetes

---

## 2. 分布式追踪选型

### 2.1 候选方案对比

| 维度 | Tempo | Jaeger | Zipkin |
|------|-------|--------|--------|
| **开发者** | Grafana Labs | Uber → CNCF | Twitter → Apache |
| **CNCF 状态** | 沙箱项目 | 毕业项目 | 孵化项目 |
| **OpenTelemetry 支持** | 原生 OTLP 接收器 | 原生 OTLP 接收器 | 通过 OTLP Collector 桥接 |
| **存储后端** | 对象存储（S3/GCS/MinIO），无数据库依赖 | Elasticsearch / Cassandra / Kafka / Badger | Elasticsearch / Cassandra / MySQL / 内存 |
| **Grafana 集成** | 一等公民，原生数据源 | 支持但需额外配置 | 支持但需额外配置 |
| **部署复杂度** | 低（单二进制 + 对象存储） | 中（需存储后端 + Collector + Query） | 中（需存储后端） |
| **UI 功能** | 通过 Grafana Explore 查看 | 独立 UI，功能丰富 | 独立 UI，功能完整 |
| **运维成本** | 低（仅维护对象存储） | 高（需运维 Elasticsearch 等） | 高（需运维存储后端） |

### 2.2 决策：选择 Tempo

**理由：**

1. **Grafana 完美集成** — Tempo 作为 Grafana 原生数据源，在 Grafana 中可直接浏览 Trace、查看拓扑图、与 Metrics/Logs 无缝关联，实现真正的全链路可观测。
2. **部署简单** — 仅需单个二进制 + 对象存储（如 MinIO），无需维护 Elasticsearch 或 Cassandra 集群。
3. **配置最少** — 默认配置即可工作，无需复杂的索引规划和性能调优。TraceQL 查询语言与 PromQL 风格一致，学习成本低。

### 2.3 适用场景

- 已选定 Grafana 作为统一可视化平台，追求全链路关联能力
- 希望最小化运维负担，不想维护 Elasticsearch 集群
- Trace 量级从中小规模起步，对象存储可弹性扩展

---

## 3. 指标监控选型

### 3.1 候选方案对比

| 维度 | Prometheus | Datadog | InfluxDB |
|------|-----------|---------|----------|
| **类型** | 开源自托管 | 商业 SaaS | 开源（商业版可用） |
| **成本** | 免费（基础设施自付） | 按主机/指标计费，规模大时成本高 | 社区版免费，企业版付费 |
| **云厂商锁定** | 无，Prometheus 格式已成为标准 | 强锁定，迁移成本高 | 低锁定，支持标准协议 |
| **数据主权** | 完全自控 | 数据存储在 Datadog 云 | 完全自控 |
| **查询语言** | PromQL（业界标准） | DQL（私有） | InfluxQL / Flux |
| **社区标准** | CNCF 毕业项目，云原生事实标准 | N/A | CNCF 沙箱项目 |
| **Grafana 集成** | 原生数据源，一等支持 | 支持但非原生 | 原生数据源 |
| **生态系统** | 极其丰富（exporter 生态、AlertManager、各类集成） | 集成丰富但封闭 | 生态相对较小 |

### 3.2 决策：选择 Prometheus

**理由：**

1. **开源免费** — 无许可证费用，适合成本敏感的项目和团队。
2. **无厂商锁定** — Prometheus 格式（OpenMetrics）已成为云原生指标标准，所有主流监控方案均支持。
3. **云原生事实标准** — CNCF 毕业项目，Kubernetes 原生支持，几乎所有云原生组件都提供 Prometheus exporter。
4. **Grafana 原生支持** — PromQL 是 Grafana 的第一公民查询语言，模板变量、告警规则等均深度集成。

### 3.3 适用场景

- 云原生微服务架构，需要全面的基础设施与应用指标
- 需要长期保持数据主权和架构灵活性
- 已有或计划部署 Grafana，追求无缝的指标可视化

---

## 4. 日志聚合选型

### 4.1 候选方案对比

| 维度 | Loki | ELK Stack (Elasticsearch + Logstash + Kibana) | Fluentd |
|------|------|----------------------------------------------|---------|
| **类型** | 日志聚合系统 | 全功能日志分析平台 | 日志收集/转发层 |
| **部署复杂度** | 低（单二进制或微服务模式） | 高（Elasticsearch 集群 + Logstash + Kibana） | 中（作为日志路由器） |
| **存储成本** | 低（仅索引标签，日志以压缩块存储在对象存储） | 高（全文索引，存储膨胀快） | N/A（转发层，不存储） |
| **查询能力** | LogQL，基于标签过滤 + 正则/管道 | KQL + Lucene，全文搜索能力强 | 无查询能力（仅转发） |
| **Grafana 集成** | 一等公民，原生数据源 | 需通过 Kibana 独立使用 | 需配合后端存储 |
| **资源消耗** | 低（不构建全文索引） | 高（Elasticsearch 内存/CPU 密集） | 低（仅转发） |
| **适用场景** | 标签化日志查询，与 Metrics/Trace 关联 | 复杂日志分析、全文检索 | 日志采集路由 |

### 4.2 决策：选择 Loki

**理由：**

1. **部署简单** — 可单二进制部署，也可水平扩展为微服务架构，按需增长。
2. **存储成本低** — Loki 不对日志内容建全文索引，仅索引标签（label），日志以压缩块存储在对象存储中，存储成本远低于 Elasticsearch。
3. **Grafana 完美集成** — 作为 Grafana 原生数据源，可在 Grafana 中直接查询日志，并通过标签与 Prometheus 指标、Tempo Trace 实现无缝关联（通过 Exemplar / Derived fields）。

### 4.3 适用场景

- 日志主要用于排障和关联分析，而非复杂全文检索
- 追求低存储成本和低运维负担
- 已部署 Grafana，希望统一在同一平台查看 Metrics/Logs/Traces

---

## 5. 可视化选型

### 5.1 候选方案对比

| 维度 | Grafana | Kibana | Datadog |
|------|---------|--------|---------|
| **类型** | 开源可视化平台（商业版可用） | ELK Stack 组件 | 商业 SaaS |
| **数据源支持** | 广泛（Prometheus/Loki/Tempo/InfluxDB/Elasticsearch/SQL 等 100+ 种） | 仅 Elasticsearch | 仅 Datadog 自有数据 |
| **统一可观测性** | Metrics + Logs + Traces 统一平台，支持全链路关联 | 侧重日志，Metrics/Trace 需其他工具 | 全栈可观测，但封闭 |
| **成本** | 社区版免费，Grafana Cloud 按用量计费 | 开源免费（Elasticsearch 运维成本高） | 按主机/指标计费，规模大时昂贵 |
| **厂商锁定** | 无（开源 + 多数据源） | 低（开源但绑定 Elastic 生态） | 强锁定 |
| **告警能力** | 内置告警（Grafana Alerting），支持多渠道通知 | 内置告警 | 内置告警 |
| **社区生态** | 活跃，Dashboard 分享丰富（grafana.com） | 活跃，日志分析领域成熟 | 活跃但封闭 |

### 5.2 决策：选择 Grafana

**理由：**

Grafana 是 TrapMap 可观测性栈的统一可视化层，支持同时接入 Prometheus（指标）、Loki（日志）、Tempo（追踪）三大数据源，在一个平台内实现 Metrics → Logs → Traces 的全链路钻取和关联分析。社区版免费，无厂商锁定，Dashboard 模板生态丰富。

---

## 6. 采集标准选型

### 6.1 候选方案对比

| 维度 | OpenTelemetry | 各工具自定义采集 |
|------|--------------|----------------|
| **标准化程度** | CNCF 标准，统一 Metrics/Logs/Traces 采集协议 | 各工具各有一套采集协议和 SDK |
| **厂商锁定** | 无（OTLP 协议可对接任意后端） | 强锁定，换后端需重写采集代码 |
| **Nest.js 支持** | `@opentelemetry/sdk-node` + Nest.js 社区集成包成熟 | 需为每个工具单独集成 |
| **社区生态** | CNCF 第二活跃项目（仅次于 K8s），所有主流后端原生支持 OTLP | 各工具独立生态，碎片化 |
| **迁移成本** | 低（更换后端只需改 Collector 配置） | 高（需改应用代码） |
| **协议统一** | Metrics/Logs/Traces 统一使用 OTLP 协议 | 每种信号类型可能使用不同协议 |

### 6.2 决策：选择 OpenTelemetry

**理由：**

1. **CNCF 标准** — OpenTelemetry 是 CNCF 仅次于 Kubernetes 的活跃项目，已成为可观测性数据采集的事实标准。
2. **原生 Nest.js 支持** — 通过 `@opentelemetry/sdk-node` 和社区集成包，可在 Nest.js 应用中零侵入（或最小侵入）地自动采集 Metrics、Logs、Traces。
3. **统一采集协议** — 所有信号类型（Metrics/Logs/Traces）统一使用 OTLP 协议，只需部署一个 OpenTelemetry Collector 即可将数据分发到 Prometheus、Loki、Tempo 等后端。
4. **无厂商锁定** — 更换后端只需调整 Collector Exporter 配置，应用代码无需改动。

### 6.3 适用场景

- 需要在多个 Nest.js 微服务中统一采集可观测性数据
- 追求应用层代码与后端选择解耦
- 计划未来对接多种后端或在多环境间迁移

---

## 7. 选型总结

| 组件 | 选型 | 一句话理由 |
|------|------|-----------|
| **服务发现** | Consul | 专用服务发现设计，内置健康检查/DNS/KV，Nest.js 成熟集成 |
| **分布式追踪** | Tempo | Grafana 完美集成，部署简单仅需对象存储，运维成本最低 |
| **指标监控** | Prometheus | 开源免费，云原生事实标准，无厂商锁定 |
| **日志聚合** | Loki | 部署简单，存储成本低，Grafana 原生数据源 |
| **可视化** | Grafana | 统一 Metrics/Logs/Traces 可视化，社区版免费，100+ 数据源 |
| **采集标准** | OpenTelemetry | CNCF 标准，统一 OTLP 协议，Nest.js 原生支持，零厂商锁定 |

### 整体架构关系

```
Nest.js 微服务
    │
    ├─ [OpenTelemetry SDK] ──→ OTLP ──→ [OpenTelemetry Collector]
    │                                          │
    │                    ┌─────────────────────┼─────────────────────┐
    │                    ▼                     ▼                     ▼
    │              Prometheus             Tempo                   Loki
    │             (Metrics)            (Traces)                (Logs)
    │                    │                     │                     │
    │                    └─────────────────────┼─────────────────────┘
    │                                          ▼
    │                                      Grafana
    │                                   (统一可视化)
    │
    └─ [Consul] ← 服务注册/发现/健康检查
```

此架构遵循"最小组件数 + 最大关联能力"原则：6 个组件覆盖服务发现、指标、追踪、日志、可视化、采集六大能力域，通过 OpenTelemetry 统一采集层和 Grafana 统一展示层实现全链路关联分析。
