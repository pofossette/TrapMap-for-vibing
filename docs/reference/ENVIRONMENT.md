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

`docs/reference/system-prompt-slots.default.json` 是运行期实时默认（`packages/ai-providers/src/prompt-builder.ts:40` 解析它）。你不要搬移该文件；覆盖需求走 `AI_PROMPT_TEMPLATE_FILE`，任务类型限定为 `boundary-extraction`、`knowledge-refinement`、`claim-verification`、`graph-extraction`、`graph-extraction-planner`、`label-alignment`。

## 核对命令

```bash
grep -n "process.env" packages/host-local/src/nest/config/config.ts
grep -n "process.env" packages/host-distributed/src/config/service-config.ts
grep -n "process.env" packages/ai-providers/src/provider-config.ts packages/ai-providers/src/prompt-builder.ts
```
