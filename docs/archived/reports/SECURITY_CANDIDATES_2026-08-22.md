# 安全候选验证与文档校准（2026-08-22，A13）

## 候选矩阵

| 来源候选 | reachability | 结论 |
|---|---|---|
| gateway actorId 自报（历史） | 已由 requireTrustedActor 会话覆盖 + A6 恢复必填 | 关闭（双保险） |
| feedback schema passthrough | remediation-complete 已恢复 strict（2026-08-13） | 无新增面 |
| 服务发现 optional overlay 文档误写为必需 | SERVICE-DISCOVERY.md 现文明确 Consul 可选、静态 URL 兜底 fail-open | 校准完成 |
| pnpm audit advisory | 2026-08-30 已在线补跑，见下方基线与分包矩阵，不再离线 needs-evidence | 基线已回填，处置列待分批升级 |

## 文档事实校准

- CLIENT_INTEGRATION.md 的 search-by-content curl 示例指向未实现路由 —— 已在主线问题池登记，tranche-2 文档修正随本报告一并提醒（真实端点 /v1/retrieval/search 已由 MCP 工具采用）。
- AI_PROVIDER.md MCP 占位注入与 apps/mcp 职责边界已澄清（互不替代）。

## pnpm audit 基线（2026-08-30）

### 审计命令与环境

- 执行：`pnpm audit --prod --registry=https://registry.npmjs.org 2>&1 | head -200`（`--prod` 仅统计 prod dependencies）
- 本机：`pnpm 10.33.0` / `node v24.16.0` / registry `https://registry.npmmirror.com` 默认不支持 audit，CI 与本地均需显式 `--registry=https://registry.npmjs.org` 或在 `.npmrc` 覆盖 registry（已在 open-debt 登记 CI 必跑标记）。
- JSON 归档：`pnpm audit --prod --registry=https://registry.npmjs.org --json > /tmp/pnpm-audit-prod.json`（CI 应持久化为制品，落点见后续）。

### 汇总

- 依赖规模：`650 prod dependencies`（`0 devDependencies` 计入 `--prod`）。
- 告警规模：`22 advisories` / `23 vulnerability instances` / `11 distinct packages` / `8 moderate` / `15 high` / `0 critical` / `0 low`。
- 时间戳：`2026-08-30` 本地在线；对比 `2026-08-22` 离线 `needs-evidence（CI）` 已补齐。
- 展示截断：首 200 行已覆盖 15 high + 8 moderate 的包名与 GHSA，完整 JSON 可重跑获取（见上）。

### 分包可达性矩阵

> 列说明：`路径` 为 pnpm audit `findings[].paths[0]` 简写（`>` 分隔 workspace 依赖链）；`安装版本` 为 findings 命中版本；`已修复` 为 advisory `patched_versions`；`可达性` 按 T5 约定分四档：**直接可达**（外部输入直达 prod 请求路径）、**条件可达**（需特性开关/外部集成启用）、**打包绑定**（随镜像打包但非请求路径触发）、**不可达**（功能未启用/前端隔离）。historical 三候选 reachable 仍为 0，已关闭。

| 包 | GHSA | 严重度 | 安装版本 | 已修复 | 路径 | 可达性 | 处置 |
|---|---|---|---|---|---|---|---|
| js-yaml | GHSA-h67p-54hq-rp68 | moderate | 3.14.2 | >=3.15.0 | packages__lib>gray-matter>js-yaml | 条件可达 | `gray-matter@4.0.3` 仍钉 `3.14.2`，需 `pnpm.overrides: js-yaml >=3.15.1` 或替换 frontmatter 解析；service-knowledge-write 解析外部 skill markdown（认证后上传）可触达二次 DoS，非匿名远程；排期升级 |
| js-yaml | GHSA-52cp-r559-cp3m | high | 3.14.2 | >=3.15.0 | packages__lib>gray-matter>js-yaml | 条件可达 | 同上，merge-key 链二次 CPU 消耗，同 remediation |
| js-yaml | GHSA-5p4m-2wfm-xmqj | high | 3.14.2 | >=3.15.1 | packages__lib>gray-matter>js-yaml | 条件可达 | 同上，!!omap 二次 CPU，`>=3.15.1` 才彻底修复，override 目标 `>=3.15.1` |
| brace-expansion | GHSA-3jxr-9vmj-r5cp | high | 2.1.0 | >=2.1.2 | packages__host-local>@sentry/node>minimatch>brace-expansion | 打包绑定 | @sentry/node 内部 minimatch 非外部请求直达 brace，悲观 DoS；等 @sentry/node 上游 bump 或 override `brace-expansion >=2.1.4`，低优先级 |
| brace-expansion | GHSA-mh99-v99m-4gvg | high | 2.1.0 | >=2.1.3 | packages__host-local>@sentry/node>minimatch>brace-expansion | 打包绑定 | 同上，OOM 展开，同一 remediation |
| brace-expansion | GHSA-rgw5-rvv9-x895 | high | 2.1.0 | >=2.1.4 | packages__host-local>@sentry/node>minimatch>brace-expansion | 打包绑定 | 同上，绕过 CVE-2026-14257 缓解，需 `>=2.1.4` |
| langsmith | GHSA-rr7j-v2q5-chgv | moderate | 0.5.18 | >=0.5.19 | packages__ai-providers>@langchain/core>langsmith | 条件可达 | 仅当启用 LangSmith 且 `hideOutputs` 且流式输出时 token 泄露；prod 需审查是否启用 tracing，升级目标 `langsmith >=0.6.0`（覆盖 0.5.19）随 @langchain/core 联动 |
| langsmith | GHSA-3644-q5cj-c5c7 | high | 0.5.18 | >=0.6.0 | packages__ai-providers>@langchain/core>langsmith | 条件可达 | public `pullPrompt(owner/name)` 误信外部 manifest 可 SSRF/劫持 LLM 流量；仅当拉取 Hub 公开 prompt 时可达，需审查 ai-providers 是否有任意 owner/name 拉取，升级 `>=0.6.0` |
| uuid | GHSA-w5hq-g745-h8pq | moderate | 10.0.0 / 11.1.0 | >=11.1.1 | packages__ai-providers>@langchain/core>langsmith>uuid, >uuid | 打包绑定 | v3/v5/v6 buf+offset 越界需显式传 buf，本仓仅 `v4()` 无 buf，无外部可控 offset；随 langsmith 升级自动带 `uuid >=11.1.1` |
| protobufjs | GHSA-j3f2-48v5-ccww | moderate | 7.6.4 | >=7.6.5 | packages__backend-core>@opentelemetry/sdk-node>@opentelemetry/exporter-logs-otlp-grpc>@grpc/grpc-js>@grpc/proto-loader>protobufjs | 条件可达 | 仅 OTLP gRPC 且解析外部 .proto 时无限循环，OTLP 默认未启用（pg 兜底）；override `protobufjs >=7.6.5` 或升级 sdk-node |
| @opentelemetry/propagator-jaeger | GHSA-45rx-2jwx-cxfr | high | 2.8.0 | >=2.9.0 | packages__backend-core>@opentelemetry/sdk-node>@opentelemetry/propagator-jaeger | 条件可达 | JaegerPropagator 未捕获畸形 header 可 DoS；需显式启用 Jaeger propagation 才可达，但属 prod 入站 header 面；升级目标 `>=2.9.0` |
| fast-uri | GHSA-v2hh-gcrm-f6hx | high | 3.1.0 | >=3.1.4 | apps__mcp>@modelcontextprotocol/sdk>ajv>fast-uri | 条件可达 | MCP 侧 AJV URI 校验 host confusion，MCP 对外暴露时外部 URI 可触发；待 @modelcontextprotocol/sdk 上游升级 ajv->fast-uri `>=3.1.5`，可临 pnpm override |
| fast-uri | GHSA-7p8r-x3mc-p8w7 | high | 3.1.0 | >=3.1.5 | apps__mcp>@modelcontextprotocol/sdk>ajv>fast-uri | 条件可达 | 同上，backslash authority introducer，同 remediation |
| fast-uri | GHSA-q3j6-qgpj-74h6 | high | 3.1.0 | >=3.1.1 | apps__mcp>@modelcontextprotocol/sdk>ajv>fast-uri | 条件可达 | percent-encoded dot 段路径遍历，同 remediation（`>=3.1.5` 覆盖） |
| fast-uri | GHSA-4c8g-83qw-93j6 | high | 3.1.0 | >=3.1.3 | apps__mcp>@modelcontextprotocol/sdk>ajv>fast-uri | 条件可达 | IDN canonicalization 失败 host confusion，同 remediation |
| fast-uri | GHSA-v39h-62p7-jpjc | high | 3.1.0 | >=3.1.2 | apps__mcp>@modelcontextprotocol/sdk>ajv>fast-uri | 条件可达 | percent-encoded authority delimiters，同 remediation |
| find-my-way | GHSA-c96f-x56v-gq3h | high | 9.6.0 | >=9.7.0 | packages__backend-core>fastify>find-my-way | 直接可达 | fastify 路由层 HTTP2 DDoS，任意 HTTP 请求可触达路由匹配；升级 `fastify` 至带 `find-my-way >=9.7.0` 的补丁版 |
| ip-address | GHSA-mwp4-54f8-5fhr | high | 10.2.0 | >=10.3.1 | apps__mcp>@modelcontextprotocol/sdk>express-rate-limit>ip-address | 直接可达 | SSRF/trust-boundary 绕过，X-Forwarded-For/remoteAddr 可伪造；升级目标 `>=10.3.1` |
| ip-address | GHSA-4xrf-jv44-h6hh | moderate | 10.2.0 | >=10.2.2 | apps__mcp>@modelcontextprotocol/sdk>express-rate-limit>ip-address | 直接可达 | CIDR 后缀抑制 special-use 分类，同 remediation |
| ip-address | GHSA-22jq-vg5j-6vgg | moderate | 10.2.0 | >=10.2.1 | apps__mcp>@modelcontextprotocol/sdk>express-rate-limit>ip-address | 直接可达 | IPv4-mapped/NAT64 误分类绕过，同 remediation |
| react-router | GHSA-qwww-vcr4-c8h2 | high | 7.18.0 | >=7.18.2 | apps__web-panel>react-router-dom>react-router | 不可达 | 仅 unstable RSC APIs 时 CSRF 旁路，web-panel 未启用 RSC（advisory 备注）；但属 prod 前端，打包面建议升级 `react-router-dom ^7.18.2` |
| @opentelemetry/core | GHSA-8988-4f7v-96qf | moderate | 1.30.1 | >=2.8.0 | packages__host-local>@sentry/node>@opentelemetry/core | 条件可达 | W3C Baggage unbounded allocation，Node 16KB 头限制缓解，非 HTTP 传输风险更高；@sentry/node 钉 `1.30.1` 需等 sentry 升级 OTEL 2.8.0+ 或关闭 baggage 透传；中低优先级 |

### 可达性归类与统计

- historical 3 候选：`reachable=0` 不变，已关闭。
- pnpm 22 advisories 归类：`直接可达 4`（find-my-way 1 + ip-address 3，含 1 high + 3 混合）、`条件可达 12`（js-yaml 3 + langsmith 2 + protobufjs 1 + propagator-jaeger 1 + fast-uri 5）、`打包绑定 4`（brace-expansion 3 + uuid 1）、`不可达 1`（react-router RSC）、`条件可达（OTEL via sentry）1`（@opentelemetry/core）。无 critical，high 15 中仅 4 为直接可达，其余需配置触发。
- 汇总可达性对外口径：**生产 HTTP 直达面为 `find-my-way` 与 `ip-address`（MCP 限流），其余为条件/打包**；前端 RSC 为不可达但建议小版本补丁。

### 处置建议与 CI 门控

1. **分批升级优先级**：
   - P0（请求路径）：`fastify -> find-my-way >=9.7.0`、`express-rate-limit -> ip-address >=10.3.1`（MCP 侧）、验证后回填本表 `安装版本`。
   - P1（小补丁低风险）：`react-router-dom ^7.18.2`、`js-yaml >=3.15.1` via `pnpm.overrides`（gray-matter 上游滞后）、`langsmith >=0.6.0` + `@langchain/core` 联动。
   - P2（MCP/OTEL）：`fast-uri >=3.1.5` via override 或等 `@modelcontextprotocol/sdk` 新版、`@opentelemetry/propagator-jaeger >=2.9.0` + `protobufjs >=7.6.5` 随 `sdk-node` 升级、`brace-expansion >=2.1.4` 与 `@opentelemetry/core` 随 `@sentry/node` 升级。
2. **CI 门控**：
   - `.github/workflows/ci.yml` 建议新增 `audit` job（不改 `.npmrc` 时显式覆盖 registry）：

     ```yaml
     audit:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
           with: { version: 10.33.0 }
         - uses: actions/setup-node@v4
           with: { node-version: '24' }
         - run: pnpm install --frozen-lockfile
         - run: pnpm audit --prod --registry=https://registry.npmjs.org
     ```

   - 或在 CI 环境配置 `NPM_CONFIG_REGISTRY` / `--registry` 覆盖 npmmirror；`--prod` 保持不变以免 dev 噪音。
   - 本 tranche 按分区约束**仅文档化建议，不直接修改 `.github/workflows/ci.yml`**（详见 `docs/todos/open-debt-and-compromises.md` 安全节 CI 必跑标记与报告本节）。
3. **后续回填**：每次依赖升级后重跑 `pnpm audit --prod --registry=https://registry.npmjs.org --json`，更新本表 `安装版本`/`已修复`/`处置`，并在 `docs/todos/open-debt-and-compromises.md` 核销对应条目；`reachable` 重算后若 direct reachable 归零且无 high 可达，可申请关闭债务或转常态跟踪。

## 后续落点

- historical 三候选：`reachable=0` 已关闭，保持。
- pnpm audit：`2026-08-30` 基线已回填，完成度 `基线采集 100% / 处置 0%`；reachable 统计见上，处置待分批升级与 CI 持久化。CI 接入且不利可达 high 归零后关闭或转常态跟踪。
