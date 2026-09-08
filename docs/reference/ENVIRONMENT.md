# 环境变量

> 状态：Active。核对日期：2026-09-08。本页是环境变量唯一真相表，运维侧只引用本页，不复述变量表。每行变量都在其来源文件实测过；默认值同样来自代码。你看到行为与本页不符时，以来源文件为准并回來改本页。

前置条件：需要 PostgreSQL 的条目已在行内标注；本地 JSON 回退只适用于 light 单进程场景。

## 数据库与存储

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `TRAPMAP_DATABASE_URL` | `packages/host-local/src/nest/config/config.ts:197` | PostgreSQL 连接串（light 主用） | 未设置（`null`） |
| `DATABASE_URL` | `packages/host-distributed/src/config/service-config.ts:15` | PostgreSQL 连接串（distributed fallback） | 未设置 |
| `TRAPMAP_SERVICE_DATABASE_URL` | `packages/host-distributed/src/config/service-config.ts:320` | 按服务覆盖的库连接串，优先级高于上两项 | 未设置 |
| `TRAPMAP_DATA_FILE` | `packages/host-local/src/nest/config/config.ts:195` | JSON 文件存储路径（兼容回退） | `.data/skill-shareer.json` |
| `TRAPMAP_DATABASE_CONNECTION_BUDGET` | `packages/host-distributed/src/config/service-config.ts:268` | 全进程 DB 连接预算（超预算时各服务按比例收缩） | 未设置 |
| `TRAPMAP_SERVICE_POOL_SIZE` | `packages/host-distributed/src/config/service-config.ts:244` | 各服务共享连接池大小 | 未设置 |
| `TRAPMAP_<SERVICE>_POOL_SIZE` | `packages/host-distributed/src/config/service-config.ts:239` | 按服务覆盖池大小（如 `TRAPMAP_KNOWLEDGE_READ_POOL_SIZE`） | 未设置 |
| `TRAPMAP_<SERVICE>_TIMEOUT_MS` | `packages/host-distributed/src/config/service-config.ts:398` | 按服务覆盖超时毫秒数 | 未设置 |

## 宿主、进程与服务发现

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `HOST` | `packages/host-local/src/nest/config/config.ts:198` | 监听地址 | `127.0.0.1` |
| `PORT` | `packages/host-local/src/nest/config/config.ts:199` | 监听端口 | `4000` |
| `TRAPMAP_SERVICE_NAME` | `packages/host-distributed/src/config/service-config.ts:313` | 当前进程的服务名（网关或各 service） | `gateway` |
| `TRAPMAP_SERVICE_PORT` | `packages/host-distributed/src/config/service-config.ts:315` | 当前进程的监听端口 | 见文件解析逻辑 |
| `TRAPMAP_SERVICE_ADVERTISE_HOST` | `packages/host-distributed/src/config/service-config.ts:331` | 对外宣告的服务地址 | 按 profile 推断 |
| `TRAPMAP_GATEWAY_URL` | `packages/host-distributed/src/config/service-config.ts:364` | CLI 连接的单一网关地址（distributed 下也不拆多地址） | 见文件默认映射 |
| `TRAPMAP_IDENTITY_ACCESS_URL` | `packages/host-distributed/src/config/service-config.ts:365` | identity-access 内部地址 | 见文件默认映射 |
| `TRAPMAP_KNOWLEDGE_READ_URL` | `packages/host-distributed/src/config/service-config.ts:366` | knowledge-read 内部地址 | 见文件默认映射 |
| `TRAPMAP_KNOWLEDGE_WRITE_URL` | `packages/host-distributed/src/config/service-config.ts:367` | knowledge-write 内部地址 | 见文件默认映射 |
| `TRAPMAP_CANDIDATE_INGESTION_URL` | `packages/host-distributed/src/config/service-config.ts:368` | candidate-ingestion 内部地址 | 见文件默认映射 |
| `TRAPMAP_GOVERNANCE_REVIEW_URL` | `packages/host-distributed/src/config/service-config.ts:369` | governance-review 内部地址 | 见文件默认映射 |
| `TRAPMAP_JOB_RUNTIME_URL` | `packages/host-distributed/src/config/service-config.ts:371` | job-runtime 内部地址 | 见文件默认映射 |
| `TRAPMAP_CRON_SCHEDULER_URL` | `packages/host-distributed/src/config/service-config.ts:372` | cron-scheduler 内部地址 | 见文件默认映射 |
| `CONSUL_ENABLED` | `packages/host-distributed/src/config/service-config.ts:379` | 是否启用 Consul 服务发现 | `false`（非 `true` 即关） |
| `CONSUL_HOST` | `packages/host-distributed/src/config/service-config.ts:327` | Consul 地址 | `localhost` |
| `CONSUL_PORT` | `packages/host-distributed/src/config/service-config.ts:328` | Consul 端口 | `8500` |
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 两宿主 config（light 见 `config.ts:200`，distributed 见 `service-config.ts:339`） | 管理员密钥；distributed 网关登录由 identity-access 校验并签发 system-admin session | 未设置（`null`） |

distributed profile 下内部地址默认走 compose Docker DNS；本地进程默认走 `localhost`；显式 `TRAPMAP_*_URL` 覆盖优先级最高（见 `packages/host-distributed/src/config/service-config.ts:364` 起）。

## 部署形态与任务传输

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `TRAPMAP_DEPLOYMENT_PROFILE` | `packages/host-local/src/nest/config/config.ts:174` | 目标部署形态：`local-agent`、`team-monolith`、`distributed` | 未设置（按 preset 推断） |
| `TRAPMAP_DEPLOYMENT_PRESET` | `packages/host-local/src/nest/config/config.ts:179` | 部署预设：`monolith`、`api`、`candidate-worker`、`governance-worker`、`outbox-worker` | `monolith` |
| `TRAPMAP_TASK_TRANSPORT` | `packages/host-local/src/nest/config/config.ts:218` | 异步任务传输：`postgres` 或 `rabbitmq` | `postgres` |
| `TRAPMAP_RABBITMQ_URL` | `packages/host-local/src/nest/config/config.ts:221` | RabbitMQ 连接串（切 `rabbitmq` 时必填，缺失则启动期 fail-fast） | 未设置 |
| `TRAPMAP_RABBITMQ_TASK_EXCHANGE` | `packages/host-local/src/nest/config/config.ts:222` | task exchange 名称 | `trapmap.tasks` |
| `TRAPMAP_RABBITMQ_TASK_QUEUE` | `packages/host-local/src/nest/config/config.ts:223` | 当前 worker 绑定的 queue 名 | `trapmap.default` |
| `TRAPMAP_RABBITMQ_PREFETCH` | `packages/host-local/src/nest/config/config.ts:224` | consumer prefetch | `1` |
| `TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT` | `packages/host-distributed/src/config/service-config.ts:297` | owner-hop 传输：`http` 或 `rpc`（`rpc` 指仓库自有 envelope，不是 gRPC） | `http` |

`domain_event_outbox` 在所有模式下保留 PostgreSQL，不受 `TRAPMAP_TASK_TRANSPORT` 影响。

## Experience Gene 门控

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `TRAPMAP_EXPERIENCE_GENE_MODE` | `packages/host-local/src/nest/config/config.ts:160`，`packages/host-distributed/src/config/service-config.ts:306` | Gene task 侧 rollout 门控 | 未知/待确认（2026-09-08） |
| `TRAPMAP_EXPERIENCE_GENES_MODE` | `packages/host-local/src/nest/config/config.ts:163`，`packages/host-distributed/src/config/service-config.ts:301` | Gene 检索 rollout 门控（`off`、`shadow`、`serve`） | 未知/待确认（2026-09-08） |

## Go 读路径

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `TRAPMAP_READ_IMPL` | `packages/host-distributed/src/config/service-config.ts:474` | 分布式读路径绞杀器（`off`、`shadow`、`dual`、`go`），仅 distributed 生效 | 未知/待确认（2026-09-08） |
| `TRAPMAP_READ_SHADOW_PERCENT` | `packages/host-distributed/src/config/service-config.ts:482` | 影子比对流量百分比 | `5` |
| `TRAPMAP_KNOWLEDGE_READ_GO_ENABLED` | `packages/host-distributed/src/config/service-config.ts:479` | 是否启用 Go 读服务 | `TRAPMAP_READ_IMPL` 非 `off` 即启用 |
| `TRAPMAP_KNOWLEDGE_READ_GO_URL` | `packages/host-distributed/src/config/service-config.ts:480` | Go 读服务地址 | `http://localhost:4101` |
| `TRAPMAP_KNOWLEDGE_READ_GO_TIMEOUT_MS` | `packages/host-distributed/src/config/service-config.ts:481` | Go 读服务超时毫秒数 | `3000` |
| `TRAPMAP_GO_ACCELERATOR_ENABLED` | `packages/host-distributed/src/config/service-config.ts:493` | 是否启用 Go 加速器 | `false`（非 `true` 即关） |
| `TRAPMAP_GO_ACCELERATOR_URL` | `packages/host-distributed/src/config/service-config.ts:494` | Go 加速器地址 | `http://localhost:4100` |
| `TRAPMAP_GO_ACCELERATOR_TIMEOUT_MS` | `packages/host-distributed/src/config/service-config.ts:495` | Go 加速器超时毫秒数 | `3000` |

## 网关传输与韧性

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `CORS_ORIGINS` | `packages/host-local/src/nest/config/config.ts:165` | 跨域白名单 | `*` |
| `RATE_LIMIT_MAX_PER_MINUTE` | `packages/host-local/src/nest/config/config.ts:202` | 每分钟限流（light） | `0` |
| `SESSION_TRANSPORT` | `packages/host-local/src/nest/config/config.ts:203` | 会话传输：`bearer-header` 或 `cookie` | `bearer-header` |
| `TRAPMAP_REQUEST_ID_HEADER` | `packages/host-local/src/nest/config/config.ts:206` | request ID 头名 | `x-request-id` |
| `TRAPMAP_TRACE_HEADER_NAME` | `packages/host-local/src/nest/config/config.ts:209` | trace 头名 | `traceparent` |
| `TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS` | `packages/host-distributed/src/config/service-config.ts:439` | 内部调用重试上限 | 未知/待确认（2026-09-08） |
| `TRAPMAP_INTERNAL_BREAKER_THRESHOLD` | `packages/host-distributed/src/config/service-config.ts:440` | 熔断阈值 | 未知/待确认（2026-09-08） |
| `TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS` | `packages/host-distributed/src/config/service-config.ts:442` | 熔断冷却毫秒数 | 未知/待确认（2026-09-08） |
| `TRAPMAP_GATEWAY_RATE_LIMIT_RPS` | `packages/host-distributed/src/config/service-config.ts:452` | 网关限流 RPS | 未知/待确认（2026-09-08） |
| `TRAPMAP_GATEWAY_RATE_LIMIT_BURST` | `packages/host-distributed/src/config/service-config.ts:461` | 网关限流 burst | 未知/待确认（2026-09-08） |
| `TRAPMAP_LOG_LEVEL` | `packages/host-distributed/src/config/service-config.ts:338` | 日志级别 | `info` |

## AI 提供方与提示词模板

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `AI_PROVIDER` | `packages/ai-providers/src/provider-config.ts:65` | 显式指定 provider（未指定时按 key 自动选择） | 未设置 |
| `OPENAI_API_KEY` | `packages/ai-providers/src/provider-config.ts:74` | OpenAI 密钥；缺失时回退到确定性 fallback 向量 | 未设置 |
| `GEMINI_API_KEY` | `packages/ai-providers/src/provider-config.ts:77` | Google GenAI 密钥 | 未设置 |
| `AI_PROMPT_TEMPLATE_FILE` | `packages/ai-providers/src/prompt-builder.ts:264` | 覆盖默认提示词槽位文件的路径 | `docs/reference/system-prompt-slots.default.json` |
| `AI_BASE_URL` | `packages/ai-providers/src/provider-config.ts:133` | 兼容接口的 Base URL（openai 默认 `https://api.openai.com/v1`，随 provider 而异） | 提供商默认值 |
| `AI_API_KEY` | `packages/ai-providers/src/provider-config.ts:94` | API 密钥（provider 专属 key 优先，其次该变量） | `OPENAI_API_KEY` |
| `AI_CHAT_MODEL` | `packages/ai-providers/src/provider-config.ts:135` | 聊天模型名称 | `gpt-4o-mini`（openai 默认） |
| `AI_EMBEDDING_MODEL` | `packages/ai-providers/src/provider-config.ts:136` | Embedding 模型名称 | `text-embedding-3-small`（openai 默认） |
| `AI_PROMPT_PROVIDER` | `packages/ai-providers/src/prompt-builder.ts:261` | Prompt provider 选择：`anthropic`、`openai`、`deepseek`、`kimi`、`gemini`、`default` | 自动从模型 ID 推断 |
| `EMBEDDING_PROVIDER` | `packages/ai-providers/src/provider-config.ts:99` | 独立 Embedding 提供商类型（未设置时不分离） | 与 `AI_PROVIDER` 相同 |

`docs/reference/system-prompt-slots.default.json` 是运行期实时默认（`packages/ai-providers/src/prompt-builder.ts:40` 解析它）。你不要搬移该文件；覆盖需求走 `AI_PROMPT_TEMPLATE_FILE`，任务类型限定为 `boundary-extraction`、`knowledge-refinement`、`claim-verification`、`graph-extraction`、`graph-extraction-planner`、`label-alignment`。

## 检索 Decay 开关

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `TRAPMAP_DECAY_ENABLED` | `packages/service-knowledge-read/src/knowledge-read-support-infra-default.ts:15` | 是否启用 decay 状态计算 | `false`（非 `true` 即关） |
| `TRAPMAP_DECAY_REVIEW_DUE_DAYS` | `packages/service-knowledge-read/src/knowledge-read-support-infra-default.ts:12` | `review-due` 阈值天数 | `90` |
| `TRAPMAP_DECAY_STALE_DAYS` | `packages/service-knowledge-read/src/knowledge-read-support-infra-default.ts:13` | `stale` 阈值天数 | `180` |
| `TRAPMAP_DECAY_EXPIRE_DAYS` | `packages/service-knowledge-read/src/knowledge-read-support-infra-default.ts:14` | `expired` 阈值天数 | `365` |

decay 配置 schema 见 `packages/contracts/src/domain/decay.ts`，运行时由 knowledge-read 侧读取环境变量并做 Zod 校验。

## 可选 Graph DB 查询后端

PostgreSQL `graph_index_documents` 仍是图索引权威真相源；可选 graph DB 仅用于查询期图遍历与扩张。

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `TRAPMAP_GRAPH_DB_ENABLED` | `packages/host-local/src/nest/config/graph-db-config.ts:56` | 启用可选 graph DB 查询后端 | `false` |
| `TRAPMAP_GRAPH_DB_PROVIDER` | `packages/host-local/src/nest/config/graph-db-config.ts:57` | 图查询后端提供者；当前仅支持 `neo4j` | `neo4j` |
| `TRAPMAP_GRAPH_DB_URI` | `packages/host-local/src/nest/config/graph-db-config.ts:58` | Neo4j 连接地址；仅在启用 graph DB 时必填 | 未设置（`null`） |
| `TRAPMAP_GRAPH_DB_USERNAME` | `packages/host-local/src/nest/config/graph-db-config.ts:59` | Neo4j 用户名；仅在启用 graph DB 时必填 | 未设置（`null`） |
| `TRAPMAP_GRAPH_DB_PASSWORD` | `packages/host-local/src/nest/config/graph-db-config.ts:60` | Neo4j 密码；仅在启用 graph DB 时必填 | 未设置（`null`） |
| `TRAPMAP_GRAPH_DB_DATABASE` | `packages/host-local/src/nest/config/graph-db-config.ts:61` | Neo4j database 名称 | `neo4j` |
| `TRAPMAP_GRAPH_DB_FAIL_OPEN` | `packages/host-local/src/nest/config/graph-db-config.ts:62` | graph DB 不可用时是否自动回退到内存 `graphology` backend | `true` |
| `TRAPMAP_GRAPH_DB_SYNC_ON_WRITE` | `packages/host-local/src/nest/config/graph-db-config.ts:63` | 图索引写入时是否同步刷新 graph DB 投影 | `true` |

## 日志

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `LOG_LEVEL` | `packages/host-local/src/nest/observability/loki.service.ts:56` | 日志级别（light 侧 Loki 传输沿用该级别） | `info` |
| `LOG_USER_OPS_ENABLED` | `packages/host-local/src/nest/config/user-ops-log.ts:47` | 启用用户操作日志 | `false`（非 `true` 即关） |
| `LOG_RAG_ENABLED` | `packages/host-local/src/nest/config/rag-log.ts:8` | 启用 RAG 检索日志 | `false`（非 `true` 即关） |
| `LOG_MAX_FILE_SIZE_MB` | `packages/host-local/src/nest/config/log-rotation.ts:7` | 单个日志文件最大大小（MB） | `10` |
| `LOKI_HOST` | `packages/host-local/src/nest/observability/loki.service.ts:41` | Loki push API 地址；为空时 Loki 日志传输禁用 | 未设置（禁用） |
| `NODE_ENV` | `packages/host-local/src/nest/observability/loki.service.ts:37`，另见 `packages/host-distributed/src/shared/telemetry.ts:81` | 运行环境（Sentry `environment`、OTel `environment` 的回退来源之一） | `development`（各消费点回退值） |

## 可观测性：Langfuse、Sentry、OTel 与指标

| 变量 | 来源 | 说明 | 默认值 |
|---|---|---|---|
| `LANGFUSE_ENABLED` | `packages/host-local/src/nest/observability/langfuse-sink.ts:48` | 是否启用 Langfuse 运行时 LLM 观测（`false` 时完全禁用） | 未设置（禁用） |
| `LANGFUSE_BASE_URL` | `packages/host-local/src/nest/observability/langfuse-sink.ts:49` | Langfuse 实例 URL | 未设置（禁用） |
| `LANGFUSE_PUBLIC_KEY` | `packages/host-local/src/nest/observability/langfuse-sink.ts:50` | Langfuse public key | 未设置（禁用） |
| `LANGFUSE_SECRET_KEY` | `packages/host-local/src/nest/observability/langfuse-sink.ts:51` | Langfuse secret key | 未设置（禁用） |
| `LANGFUSE_FLUSH_TIMEOUT_MS` | `packages/host-local/src/nest/observability/langfuse-sink.ts:52` | Bounded flush 超时毫秒数（范围 100-60000，见 `packages/contracts/src/domain/observability-config.ts:370`） | `5000` |
| `LANGFUSE_PRIVACY_MODE` | `packages/host-local/src/nest/observability/langfuse-sink.ts:58` | 隐私模式：`strict`（仅 metadata/长度/哈希）或 `metadata-only` | `strict` |
| `SENTRY_DSN` | `packages/host-local/src/nest/observability/sentry.service.ts:183` | Sentry DSN；为空时 Sentry 完全禁用（no-op） | 未设置（禁用） |
| `SENTRY_ENVIRONMENT` | `packages/host-local/src/nest/observability/sentry.service.ts:184` | Sentry 环境标签 | `NODE_ENV` 或 `development` |
| `SENTRY_RELEASE` | `packages/host-local/src/nest/observability/sentry.service.ts:185` | Sentry release 标识 | `npm_package_version` 或 `0.1.0` |
| `SENTRY_TRACES_SAMPLE_RATE` | `packages/host-local/src/nest/observability/sentry.service.ts:186` | Sentry traces 采样率（0-1） | `0` |
| `OTEL_DISABLED` | `packages/host-distributed/src/shared/telemetry.ts:76`，另见 `packages/host-local/src/nest/observability/otel.service.ts:35` | 是否禁用 OpenTelemetry SDK 初始化（`true` 时所有 OTel 操作为空操作） | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `packages/host-distributed/src/shared/telemetry.ts:78`，另见 `packages/host-local/src/nest/observability/otel.service.ts:37` | OTLP exporter 端点 | `http://localhost:4318` |
| `TRAPMAP_METRICS_ENABLED` | `packages/host-local/src/nest/observability/prometheus.service.ts:26` | 是否暴露 `/metrics` Prometheus 端点并收集 `prom-client` 指标 | `true` |
| `TRAPMAP_JOB_RUNTIME_DATABASE_URL` | `packages/host-distributed/src/shared/database.ts:98` | job-runtime 可选隔离库；设置时 `job-runtime` 使用独立 PostgreSQL，缺省回退共享库；其余服务不读取该变量 | 未设置（回退共享库） |

缺少任一 Langfuse 凭证时 observation 不加载、不传输，对请求零影响；缺少 `SENTRY_DSN` 时 Sentry 不加载、不传输，对请求和异步任务零影响。

## 已退役/预留变量族（不收录）

经代码核查，以下变量族在当前工作树无源码读取（`grep -rn` 覆盖 `packages/`、`apps/`、`services/`、`scripts/`，仅命中文档与注释），属预留/已退役，故不收录：

| 变量族 | 说明 |
|---|---|
| `TRAPMAP_BULK_WRITE_*` | 经代码核查无引用，属预留/已退役，故不收录 |
| `TRAPMAP_CACHE_INVALIDATION_*` | 经代码核查无引用，属预留/已退役，故不收录 |
| `TRAPMAP_REMOTE_CACHE_*` | 经代码核查无引用，属预留/已退役，故不收录 |
| `TRAPMAP_INTERNAL_*`（除主表已收录的 `TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS`、`TRAPMAP_INTERNAL_BREAKER_THRESHOLD`、`TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS` 三项外） | 其余 MODE/URL/TIMEOUT/HEADERS/QUEUE 预留面经代码核查无引用，属预留/已退役，故不收录 |
| `TRAPMAP_EVAL_PLATFORM*` | 经代码核查无引用（eval 平台启用走显式 `--platform` 参数），属预留/已退役，故不收录 |
| `TRAPMAP_RETRIEVAL_*` 本地缓存/warmup | 经代码核查无引用，属预留/已退役，故不收录 |
| `MINIO_ROOT_PASSWORD` | 经代码核查无引用（本地 Langfuse self-host compose 侧变量，非 TrapMap 读取），属预留/已退役，故不收录 |
| `RUNTIME_MODE` | 经代码核查无引用，属预留/已退役，故不收录 |
| `RETRIEVAL_CAPSULE_PG_*` | 经代码核查无引用，属预留/已退役，故不收录 |

## 核对命令

```bash
grep -n "process.env" packages/host-local/src/nest/config/config.ts
grep -n "process.env" packages/host-distributed/src/config/service-config.ts
grep -n "process.env" packages/ai-providers/src/provider-config.ts packages/ai-providers/src/prompt-builder.ts
```
