# TrapMap CLI 工具适配输出优化方案

## Summary

在现有 “服务端返回统一 JSON，CLI 负责展示” 的基础上，新增一层 tool-adapter rendering，让 CLI 可以按目标 coding 工具的偏好，把统一 skill / graph-plan 数据重组为更适合 Claude Code、Codex、OpenCode 等工具消费的字符串输出。

本方案采用以下默认决策：
- 适配主轴：工具优先，不直接按模型家族暴露主配置
- 输出形态：CLI 输出单一渲染字符串
- 图 skill 默认层级：计划摘要 + 激活提示，而不是完整 graph-plan 全量 JSON
- 服务端职责：继续返回统一结构化数据，不为不同模型分叉响应
- 客户端职责：根据用户配置的 tool profile 和可选 model hint，执行渲染与裁剪

## Progress

### 已完成

- CLI output profile 已落地：
  - `outputProfile.tool | modelHint | renderMode | graphPlanMode | verbosity | includeRawHints`
  - `trapmap output profile show`
  - `trapmap output profile set --tool <tool> [--model <hint>] [--verbosity <level>] [--graph-plan-mode <mode>]`
- 本地 render envelope 和 adapter 层已落地在 `packages/cli/src/lib/output-profile.ts`
- 已实现四类 tool profile renderer：
  - `generic`
  - `claude-code`
  - `codex`
  - `opencode`
- 已实现并接入的 RenderKind：
  - `retrieval-v1`
  - `retrieval-v2`
  - `graph-plan`
  - `skill-lookup`
  - `command-result`
  - `generic`
- graph-plan summary view 已在 CLI 本地渲染层实现，支持：
  - `graphPlanMode=summary | full | skill-list`
  - `verbosity=compact | balanced | detailed`
  - direct plan / capsule fallback / entry fallback 分支
- retrieval / lookup 输出已提升为“中间语义对象 + tool-specific renderer”：
  - `retrieval-v1`
  - `retrieval-v2`
  - `skill-lookup`
- `printAdaptiveResult` 已接入并验证以下命令：
  - `search`
  - `search --v2`
  - `search:plan` / graph-plan 对应命令
  - `skill search-by-content`
- `command-result` 渲染链路已实现并接入以下 skill admin 命令：
  - `skill edit`
  - `skill history`
  - `skill review:queue`
  - `skill review:approve`
  - `skill review:reject`
  - `skill duplicate-job fetch`
  - `skill duplicate-job resolve`
  - `skill duplicate-job apply-resolution`
- `--json` 仍保持输出原始服务端响应，CLI 外部 contract 未改动
- renderer failure fallback 已补强，覆盖 graph-plan 与 tool-specific renderer 抛错后回退 legacy formatter
- generic renderer 已补强为稳定测试基线
- 本轮已完成 CLI 输出层类型清理：
  - 修复 `RendererRegistry` / `Renderer` 泛型不兼容诊断
  - 修复 `createRenderEnvelope` 在 `exactOptionalPropertyTypes` 下显式写入 `undefined` 的问题
  - 修复 `loadCliState` / `normalizeOutputProfile` 的 optional `outputProfile` 构造
  - `rtk tsc -p packages/cli/tsconfig.json --noEmit` 已通过
- 本轮已按仓库要求执行 `rtk graphify update .`
- 本轮已补充 renderer 独立测试覆盖：
  - Claude retrieval-v1 XML 输出独立渲染测试
  - Codex retrieval-v1 JSON snake_case 字段独立渲染测试
  - graph-plan compact mode traps/skills/hints 限制测试（compact vs balanced 对比）
- 本轮已迁移以下命令到 `printCommandResult`：
  - `submit`（knowledge）
  - `resubmit`（knowledge）
  - `supersede`（knowledge）
  - `review-status`（knowledge，单条和列表两个分支）
  - `trap submit`
  - `trap resubmit`
  - `trap list`
  - `trap show`
- 新增 `trap.test.ts` 测试文件，覆盖 trap 命令的注册、格式化和 profile-aware 输出
- 本轮已迁移以下命令到 `printCommandResult`：
  - `decay-stale`（decay）
  - `decay-batch`（decay）
  - `decay-search`（decay）
  - `review:queue`（review）
  - `review:approve`（review）
  - `review:reject`（review）
  - `admin:evidence`（evidence）
  - `evidence:update`（evidence）
- 新增 `evidence.test.ts` 测试文件，覆盖 evidence 命令的注册、API 调用、验证和 profile-aware 输出
- `decay.test.ts` 和 `review.test.ts` 已补充 profile-aware 输出测试
- 本轮已迁移以下命令到 `printCommandResult`：
  - `feedback`（feedback）
  - `feedback-list`（feedback-admin）
  - `feedback-batch`（feedback-admin）
  - `maintenance-list`（maintenance）
  - `maintenance-assign`（maintenance）
  - `maintenance-verify`（maintenance）
- 新增 `maintenance.test.ts` 测试文件（21 个测试），覆盖 maintenance 命令的注册、API 调用、过滤参数和 profile-aware 输出
- `feedback.test.ts` 已补充 profile-aware 输出测试（feedback submit、feedback-list、feedback-batch），并修复 mock 生命周期管理
- `feedback.test.ts` 已重构为 `loadCliState` mock + `beforeEach/afterEach` 模式，与 decay/review/evidence 一致
- 本轮已迁移以下命令到 `printCommandResult`：
  - `member create`（member）
  - `member update`（member）
  - `access-key:create`（member）
  - `team list`（team）
  - `team select`（team）
  - `team create`（team）
  - `login`（auth）
  - `logout`（auth）
  - `session`（auth）
- 新增 `member.test.ts` 测试文件（17 个测试），覆盖 member 命令的注册、API 调用、认证和 profile-aware 输出
- `team.test.ts` 已重构为 `loadCliState` mock + `beforeEach/afterEach` 模式，并补充 profile-aware 输出测试（3 个），共 20 个测试
- 新增 `auth.test.ts` 测试文件（15 个测试），覆盖 auth 命令的 login/logout/session、API 调用、认证和 profile-aware 输出

### 部分完成

- “命令层统一接入 profile-aware 输出” 已覆盖 search / load / skill / knowledge / trap / decay / review / evidence / feedback / feedback-admin / maintenance / member / team / auth 十四大类命令，但尚未覆盖 `audit` / `operations/*` 命令
- “Renderer 正确性” 已覆盖主要路径，主要 tool/kind 组合已有独立断言

### 未完成

- 若需要更大范围推广，继续把更多 CLI 命令迁移到 `printCommandResult` 或其他 profile-aware 输出入口（audit / operations/*）
- 当前仍保持”服务端零改动优先”，尚未评估是否真的需要新增 `suggestedOrderNodeIds`、`displaySummary` 等 tool-agnostic 元信息
- 仍未扩展到 MCP、外部插件协议或 server-side prompt templating

## Key Changes

### 1. CLI 配置模型升级为 “tool profile + rendering preferences”

扩展 `packages/cli/src/lib/config.ts` 的 `CliState`，新增一组只影响本地输出的配置：

- `outputProfile.tool`
  - 取值：`claude-code | codex | opencode | generic`
  - 表示当前 CLI 默认面向哪个外部工具
- `outputProfile.modelHint`
  - 可选：`claude | gpt | qwen | generic`
  - 仅作为渲染细化提示，不单独主导 profile
- `outputProfile.renderMode`
  - 取值：`text | json`
  - `json` 保留现有原始 JSON 输出语义
  - `text` 进入工具适配渲染
- `outputProfile.graphPlanMode`
  - 默认：`summary`
  - 可选：`summary | full | skill-list`
  - 本方案默认实现 `summary`，其余模式只保留扩展位
- `outputProfile.verbosity`
  - 取值：`compact | balanced | detailed`
  - 默认 `balanced`
- `outputProfile.includeRawHints`
  - 布尔值
  - 是否在渲染文本尾部附少量结构化 hint（如 artifactId/path），默认 `true`

新增 CLI 命令：
- `trapmap output profile show`
- `trapmap output profile set --tool <tool> [--model <hint>] [--verbosity <level>] [--graph-plan-mode <mode>]`
- 不新增交互式 prompt，保持命令式配置

### 2. 在 CLI 内引入统一的 Render Envelope 和 Adapter 层

新增一个本地渲染抽象层，不改服务端协议。

建议新增一个输出模块，例如：
- `packages/cli/src/lib/output-profile.ts`
- `packages/cli/src/lib/renderers/`

定义统一的本地输入 envelope：
- `kind`
  - `retrieval-v1 | retrieval-v2 | graph-plan | skill-lookup | artifact-export | generic`
- `payload`
  - 服务端原始 JSON
- `context`
  - 命令来源、tool profile、model hint、verbosity、graph plan mode

定义 Renderer 接口：
- 输入：`RenderEnvelope`
- 输出：`string`

实现一个 `resolveRenderer(profile, kind)`：
- 根据 `tool + kind` 选具体 renderer
- 没有命中特化 renderer 时，回退到 `generic` renderer
- `--json` 始终绕过 renderer，直接输出原始 JSON，保持兼容

### 3. 以“统一中间语义 + 工具模板”方式渲染，而不是每个命令手写格式

不要让每个命令自己拼 Claude/XML、Codex/JSON、OpenCode/Markdown。

先把主要响应归一成少量中间语义对象：
- `SkillBundleView`
  - skill 标题、摘要、labels、适用场景、激活提示
- `GraphPlanSummaryView`
  - 核心 traps、推荐 skills、推荐顺序、关键依赖、activation hints
- `RetrievalSummaryView`
  - 胶囊或条目结果的精简摘要
- `ActivationHintView`
  - references / assets / scripts 的统一轻量表示

然后为不同工具提供模板策略：

**Claude Code**
- 默认输出 XML-like 结构化文本
- 顶层标签固定，如：
  - `<trapmap_skill_pack>`
  - `<summary>`
  - `<recommended_skills>`
  - `<blocking_traps>`
  - `<activation_hints>`
  - `<next_steps>`
- 图 plan 使用强分段、显式标签、短字段值
- 不嵌过深层级，避免 XML 噪音
- `routingTrace` 不默认展开，只在低置信度或 detailed 模式下显示

**Codex**
- 默认输出紧凑 JSON block，外加一行用途说明
- 输出内容是“面向 agent 消费的稳定对象”，但通过 CLI 打印为字符串
- JSON 顶层建议固定为：
  - `type`
  - `summary`
  - `skills`
  - `traps`
  - `activation_hints`
  - `next_steps`
  - `confidence`
- graph-plan 默认不输出全量 `graph.nodes/edges`，只输出：
  - 排序后的 `steps`
  - 每步关联的 `artifactId`
  - 与该步直接相关的 trap refs
- detailed 模式下才附 `plan_edges`

**OpenCode**
- 默认输出 Markdown
- 强调可读性和段落化，而不是强 schema
- 固定结构建议：
  - `# Goal`
  - `## Recommended Skills`
  - `## Blocking Traps`
  - `## Activation Hints`
  - `## Suggested Execution Order`
- 每个 skill 保持 3-5 行，避免长段正文
- 图 plan summary 中用编号步骤替代节点图

**Generic**
- 保留接近现有 formatter 的文本风格
- 作为兜底和测试基线

### 4. graph-plan 的外部输出默认收敛为 “Plan Summary View”

服务端 `v3/retrieval/search` 保持不变，仍返回统一 `routingTrace + plan + fallback` 结构；CLI 对 graph-plan 额外做一层摘要构造。

`GraphPlanSummaryView` 默认包含：
- `goal`
  - 由用户 query 或上层命令上下文带入
- `confidence`
  - 来自 `routingTrace.confidenceBucket`
- `selectedPath`
  - `graph-plan | capsule-fallback | entry-fallback`
- `blockingTraps`
  - 最多保留前 3 个 trap
  - 字段：`label`, `severity`, `evidence`, `sourceId`
- `recommendedSkills`
  - 最多保留前 `skillBudget` 个
  - 字段：`artifactId`, `label`, `situation`, `goal`, `score`
- `executionOrder`
  - 根据 `plan.edges` 中 `order/requires/mitigates` 推导出的线性建议顺序
  - 若无法稳定排序，则退化为 `recommendedSkills` 当前顺序
- `activationHints`
  - 每个 skill 最多展示：
    - 2 个 references
    - 1 个 script
    - 2 个 assets
- `fallbackNotice`
  - 若返回的是 fallback，则明确说明 “plan 未被选中，当前内容来自 capsule fallback / entry fallback”

不默认输出：
- 全量 `graph.nodes`
- 全量 `graph.edges`
- 全量 `citations`
- 原始 `routingTrace.channelsUsed`

这些仅在 `graphPlanMode=full` 或 `verbosity=detailed` 时才展开。

### 5. 命令层统一接入 profile-aware 输出

现有 `packages/cli/src/lib/output.ts` 只支持 `--json` 或 formatter 文本，需要升级为：
- `printResult(value, options, formatter)` 保持兼容
- 新增 `printAdaptiveResult(kind, value, cliState, commandOptions, legacyFormatter)`
- 行为规则：
  - `--json`：直接输出原始 JSON
  - 未配置 `outputProfile`：沿用 legacy formatter
  - 已配置且 `renderMode=text`：走 adapter renderer
  - renderer 失败时：回退 legacy formatter，不中断命令

优先接入这些命令：
- `search --v2`
- `search`（v1）
- `search:plan` / 对应 graph-plan 命令
- `skill search-by-content`
- 后续可扩到 export / review 等命令，但不作为首批范围

### 6. 服务端保持统一 contract，只补必要元信息

服务端不按工具定制响应，不增加 `claudeFormat` / `codexFormat` 这类字段。

仅允许在现有统一结构上补充少量有助于客户端摘要的稳定字段，且只在确有必要时添加：
- graph-plan 中若当前没有稳定线性顺序，可考虑新增可选 `suggestedOrderNodeIds`
- skill / capsule 输出若缺少稳定短摘要，可考虑新增可选 `displaySummary`
- 这些字段必须是 tool-agnostic 的，不带任何特定模型格式痕迹

如果当前数据已足够构造摘要，则服务端零改动优先。

## Test Plan

### CLI 配置与回退
- 未配置 output profile 时，现有文本输出不变
- `--json` 时，所有命令仍输出原始服务端 JSON
- 配置了 `claude-code/codex/opencode` 后，相同 payload 走不同 renderer
- renderer 抛错时，自动回退 legacy formatter

### Renderer 正确性
- `retrieval-v2` 对 Claude Code 输出带固定 XML-like section
- `graph-plan` 对 Codex 输出稳定 JSON 字符串，字段顺序固定
- `graph-plan` 对 OpenCode 输出 Markdown 标题与编号步骤
- `generic` renderer 对所有 kind 都能输出可读文本

### graph-plan 摘要策略
- 高置信 plan：输出 traps + skills + execution order + activation hints
- capsule fallback：明确标出 fallback，并输出 capsule-based summary
- entry fallback：明确标出 fallback，并输出 entry-based summary
- detailed 模式比 balanced 模式多包含 confidence / edge / hint 细节
- compact 模式下限制 traps/skills/hints 数量，避免上下文膨胀

### 兼容性
- 旧测试中依赖 `printResult` 的命令不需要整体重写
- 配置文件缺少新字段时能自动使用默认值
- 旧 CLI config 能无迁移读取并补默认值

## Assumptions
- 首批只做 CLI 本地渲染优化，不引入 MCP、外部插件协议或 server-side prompt templating
- “主流工具偏好”按以下默认映射处理：
  - `claude-code -> XML-like structured text`
  - `codex -> JSON-oriented structured text`
  - `opencode -> Markdown-oriented text`
- `modelHint` 只用于细化渲染，不覆盖 `tool` 主 profile
- graph-plan 的首要价值是“帮助 agent 快速执行”，不是完整图可视化，因此默认输出 summary 而非 full graph
- 若现有 graph-plan 无法稳定推导执行顺序，则按 `recommendedSkills` 顺序输出，并在代码中将其标注为启发式顺序
