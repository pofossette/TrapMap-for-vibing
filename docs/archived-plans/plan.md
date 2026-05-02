# TrapMap 短期库化改造计划

## 目标

在短期内把当前项目里最容易出错、最难维护的“手搓”实现，逐步替换为成熟库或成熟基础设施，同时保留现有契约、治理和可验证性。

短期目标不是一次性重构全系统，而是先处理最影响可靠性和后续扩展的基础能力：检索索引、异步任务、日志轮转、配置校验和评测编排。

## 时间范围

- 建议窗口：1 到 2 个迭代。
- 第一迭代聚焦检索和持久化边界。
- 第二迭代聚焦任务队列、日志、配置和评测接口。

## 优先级

1. 检索与排序基础设施
   - 将手写的关键词打分、向量相似度、rerank 逻辑收敛到 PostgreSQL + `pgvector` + Drizzle 的组合上。
   - 让数据库承担召回和排序的主要职责，减少 `packages/server/src/lib/retrieval/*` 里的自定义算法面。
   - 先保留现有接口和返回 schema，内部切换召回实现，避免 CLI 和 eval 同时大改。
   - 输出物：新的检索索引表、迁移脚本、最小可用的 vector/keyword 查询路径。

2. 异步任务与重试
   - 用成熟队列库替代 `setTimeout` 式重试和状态轮询。
   - 优先考虑 PostgreSQL 原生队列方案，避免引入额外基础设施。
   - 先覆盖候选分析、重复检测和索引重建任务。
   - 输出物：任务表或队列配置、worker 启动入口、失败重试和死信策略。

3. 日志与轮转
   - 用成熟日志方案替代手写的文件轮转和 JSONL 追加。
   - 保留结构化日志，但把轮转、保留策略、错误处理交给标准组件。
   - 先统一 RAG 日志和 user ops 日志的写入路径。
   - 输出物：日志配置、统一 logger 包装、旧轮转工具的下线计划。

4. 配置与启动校验
   - 用 Zod 或等价的环境变量 schema 校验替代散落的 `process.env` 读取。
   - 启动阶段 fail-fast，避免运行期才暴露配置错误。
   - 先覆盖 server 启动所需的端口、数据库、AI provider、日志开关和系统管理员 key。
   - 输出物：`ServerConfig` schema、测试用默认配置、错误信息格式。

5. 评测与 judge
   - 将评测执行、基准回归和 LLM judge 的接口尽量标准化。
   - 保留 TrapMap 的治理判断，但把通用评测编排交给成熟工具。
   - 先补齐 summary judge 的真实 provider 接口，再评估是否引入外部评测平台。
   - 输出物：judge provider 抽象、最小 OpenAI-compatible judge、CI 可运行的 smoke eval。

## 现状判断

- 现在最“值得换库”的位置不是 CLI 命令层，而是 server 的检索、候选处理、日志和评测编排。
- `RBAC`、契约 schema、CLI 命令树目前已经足够成熟，不应优先重写。
- PostgreSQL 持久化现在仍偏兼容层，下一步库化应优先落在索引、召回和任务处理上，而不是继续扩展 JSONB snapshot。

## 近期实施拆分

### 第 1 步：检索数据模型落地

- 新增独立的检索索引表，至少覆盖 entry/capsule id、scope、team、required level、labels、content hash、embedding vector 和 keyword text。
- 保留 JSONB snapshot 作为领域状态来源，但检索不再依赖每次全量扫描 snapshot。
- 用现有 approval/lifecycle 事件触发索引 upsert/remove。
- 验证重点：现有 v1/v2/v3 retrieval tests 不退化，治理过滤仍先于结果暴露。

### 第 2 步：替换重复检测召回

- 将候选 duplicate detection 从全量循环和 Jaccard overlap 改为复用检索索引召回。
- 保留当前 duplicate case schema，不改 CLI 输出。
- 分数可以先保持兼容映射，后续再通过 eval 校准阈值。
- 验证重点：已存在的 duplicate/manual-result 测试通过，并新增至少一个“相似但不同”的负例。

### 第 3 步：引入后台任务处理

- 把 candidate processing、index rebuild、eval report generation 纳入统一任务入口。
- worker 和 API server 可以先在同一进程启动，后续再拆进独立进程。
- 重试策略至少包含最大次数、退避时间、最终失败状态。
- 验证重点：服务重启后未完成任务可恢复，不会重复发布候选结果。

### 第 4 步：收敛配置和日志

- 用 schema 定义所有 server env，并让测试环境走明确默认值。
- 替换手写日志轮转，统一结构化日志字段。
- 保留用户操作和 RAG pipeline 两类业务日志，但共用底层 logger。
- 验证重点：配置错误启动即失败，日志关闭时无文件写入副作用。

### 第 5 步：评测接口平台化

- 先把 summary judge 从规则 fallback 扩展为 provider 接口。
- smoke eval 继续本地可跑，core eval 可依赖外部 provider。
- 治理泄漏检测保留在项目内，不交给通用评测平台。
- 验证重点：无 provider 时 deterministic fallback 仍可运行，有 provider 时 judge 结果进入报告。

## 非目标

- 不重写 CLI 命令树。
- 不一次性替换所有 store 读写为完整关系模型。
- 不把 RBAC 迁移到 Casbin/Oso，除非后续出现资源级策略需求。
- 不把 TrapMap 的领域规则完全交给通用 NLP 或 LLM 自动判断。

## 风险与缓解

- 检索排序变化可能导致结果顺序漂移：用现有 retrieval eval baseline 先记录再切换。
- `pgvector` 迁移需要重建 embedding：保留 source content 和 content hash，索引可重建。
- 后台任务引入并发后可能出现重复处理：任务必须幂等，写入前检查 candidate/index 状态。
- 外部 judge 会带来成本和不稳定性：保留 deterministic fallback，CI 分 smoke/core 两层。

## 执行顺序

1. 先把检索链路拆成数据库可承载的最小闭环。
2. 再替换候选处理和重试机制。
3. 然后收敛日志/轮转和配置校验。
4. 最后把评测和 judge 接口平台化。

## 验收标准

- 手写相似度、打分、轮转、重试逻辑明显减少。
- 核心行为仍通过现有 contracts 和测试覆盖。
- 新引入库只承担通用能力，不侵入 TrapMap 的治理和领域规则。
- `pnpm typecheck` 和相关 server/CLI 测试通过。
- retrieval eval smoke 可用于判断检索变更是否可接受。

## 测试优化补充

### 现状判断

- `pnpm eval:smoke` 已通过，说明评测入口本身可用。
- `pnpm test` 仍存在失败用例，且失败集中在检索、计划编译、摘要和 eval 数据集校验。
- `pnpm eval:core` 已暴露出核心检索与 summary 分层问题，说明 smoke 通过不能代表整体质量稳定。
- `pnpm lint` 目前会被测试文件中的无效 suppression 和生成物检查干扰。
- 当前测试最大问题不是单纯“覆盖率不够”，而是基础门禁、测试契约和评测分层不同步。

### 优先优化点

1. 先修复基础测试门禁
   - 修正 eval 数据集测试里指向不存在 `packages/contracts/src/index.js` 的导入。
   - 排查 `retrieval.test.ts`、`capsule-recall.test.ts`、`plan-compiler.test.ts`、`summary.test.ts` 中的失败断言。
   - 优先区分实现回归和过时断言，避免把 fixture 问题误判为业务问题。

2. 补齐真正的 CI 基础门禁
   - 为 PR 增加 `pnpm typecheck`、`pnpm lint`、`pnpm test` 的独立工作流或 job。
   - 让 eval workflow 只承担检索和摘要评测，不再充当唯一质量门禁。
   - 避免出现“smoke eval 通过，但基础单测已坏”的情况。

3. 让 core eval 真正覆盖 summary
   - 目前 `evals/summary/core.ts` 为空，core 层没有实际摘要回归价值。
   - 补充 summary core 用例，覆盖 groundedness、coverage、forbidden claim 和空结果分支。
   - 保证 core 层和文档中的“全面覆盖”定义一致。

4. 修正 retrieval core 的 shape 与治理期望
   - 现有 core eval 已暴露 v1 semantic 和 bucket shape 的治理/结构 mismatch。
   - 优先确认是业务实现变了，还是测试 fixture 和期望过期。
   - 把治理泄漏、bucket 结构、模式差异拆成独立断言，减少一条失败掩盖多种问题。

5. 统一 eval 和 contracts 的导入方式
   - 目前 eval 目录大量使用相对路径直指 contracts 源码，容易在目录调整后失效。
   - 建议统一改成包级 alias 或共享导入封装。
   - 这样可以降低 dataset 测试和 runner 测试的路径脆弱性。

6. 收紧 lint 与生成物边界
   - 把 `reports/` 这类运行产物排除在 Biome 检查之外，避免本地评测后 lint 失败。
   - 清理无效的 Biome suppression，特别是测试文件中的过期注释。
   - 保持 lint 关注源码质量，而不是被运行时报告噪声干扰。

7. 增加高风险模块的定向覆盖
   - 优先补 coverage 的区域应是 contracts schema、治理过滤、retrieval assembly、summary/judge 和 store/indexing adapter。
   - 不建议先做全仓门槛，应该先对高风险路径设最小覆盖要求。
   - 这样更能反映真实回归风险，而不是追求表面数字。

### 近期实施拆分

### 第 1 步：修复测试断裂点

- 修正 eval 数据集测试中的错误导入。
- 处理 retrieval、plan compiler、capsule recall、summary 的失败用例。
- 验证 `pnpm test` 至少恢复到全绿或只剩明确标记的已知问题。

### 第 2 步：补齐 CI 门禁

- 新增或调整 GitHub Actions，使 `test`、`typecheck`、`lint` 成为 PR 门禁。
- 保留 eval workflow 作为质量评测，不替代基础门禁。
- 让基础测试和评测结果在同一条 PR 里都可见。

### 第 3 步：补 summary core 用例

- 为 summary core 增加可执行的真实用例。
- 覆盖摘要质量、禁止声明和空结果边界。
- 让 `eval:core` 的 core 层具有实质意义。

### 第 4 步：整理评测和 lint 边界

- 统一 eval 导入方式。
- 排除运行产物对 lint 的干扰。
- 清理无效 suppression，减少噪声。

### 验收标准

- `pnpm test` 通过，或者仅剩清晰标注的已知未修复项。
- PR 级 CI 能同时暴露基础测试、lint、typecheck 和评测结果。
- `eval:core` 的 summary 层不再为空。
- retrieval core 的失败能被清晰定位到具体实现或 fixture 问题。
- `pnpm lint` 不再被 `reports/` 等生成物干扰。
