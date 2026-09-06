# AI SDK 统一 + 全量依赖升级（Goal 执行面）

> 来源：`/goal 对项目内所有依赖引入codemod,结合官方的相关说明，对所有包进行升级。同时借这次机会，将langchain彻底移除，用vercel aisdk最新版做provider,建一个统一的 ai 子包，用来封装aisdk适配器，集中所有llm调用逻辑，包括embedding模型`
> 本文件是本次 Goal 的执行记录面，不争夺根 `plan.md` 的 active mainline 位置；待本线收敛后再按归档规则决定是否转正/归档。

## 已交付（本轮）

- [x] **LangChain 彻底移除**：`packages/ai-providers` 删除 `@langchain/core` / `@langchain/openai`；
  源码内已无 `langchain` 导入（仅 `contracts` 测试夹具字符串含该词，非依赖）。
- [x] **统一 AI 子包 = `@trapmap/ai-providers`**（不新增 `packages/ai`，避免 15+ 消费方改导入）：
  新增 `src/adapters/aisdk.ts` 作为唯一 AI SDK 接入面，集中所有 LLM 调用（含 embedding）。
  - Chat 经 `generateText({ model, system, prompt, temperature })`（官方 `generateText` 形态）
  - Embedding 经 `embed({ model, value })` / 批量经 `embedMany({ model, values })`
  - Provider 映射：`openai`→`@ai-sdk/openai`；`openai-compatible`/`ollama`（`/v1`）→`@ai-sdk/openai-compatible`；
    `google-genai`→`@ai-sdk/google`；`fallback`→确定性向量
  - 历史类名 `OpenAICompatible*` / `GoogleGenAI*` 保留为薄别名；`GoogleGenAI` 手写 `fetch` 已删除
  - `EmbeddingsProvider` 新增可选 `model` + `embedMany`（非破坏性扩展）
- [x] **AI SDK 版本**：`ai@^7.0.93`（`latest`），`@ai-sdk/openai@^4.0.60`，`@ai-sdk/openai-compatible@^3.0.44`，`@ai-sdk/google@^4.0.64`
- [x] **安全小版本波**：`pnpm update -r`（respect caret，不跨 major）已执行并锁文件更新
- [x] **pg 小版本**：`overrides` + 10 个包 `pg 8.20.0→8.23.0`、`@types/pg 8.20.0→8.23.1`
- [x] **commander 14→15**：`apps/cli` bump 至 `^15.0.0`（ESM-only + Node>=22，仓库已是 ESM + Node 24，安全）
- [x] 验证：`pnpm --filter @trapmap/ai-providers test` 54/54 通过；
  `service-knowledge-write` 定向用例 10/10 通过；`pnpm typecheck` 通过；`@trapmap/cli` 547/547 通过；
  新增文件无裸断言；`eval:smoke` 因本机无 Docker PG 未能执行（已记录，需在 CI/有 Docker 环境补跑）

## 官方说明与 codemod 对应（已用 / 待用）

- AI SDK：`npx @ai-sdk/codemod upgrade` 一键升级；另有 `v6` 等版本 codemod；本次属 LangChain→AI SDK 手工迁移，
  后续 AI SDK 自身升级直接用该 codemod。
- Biome 2：`pnpm biome migrate --write` / `npx @biomejs/biome migrate --write` 处理配置 breaking；
  本轮已验证 migrate 可跑通（schema→2.5.12，`include/ignore` 合并为 `includes`），但因会放大出 2.4 万条
  `organizeImports` 级差异 + 基线 `pnpm check` 在 v1 已有 4.7 万条存量错误，为保主干绿色已回退到 `^1.9.4`，
  列入 Wave-B 单独处理（`--write` 全量排序 + 分批 review）。
- Commander 15：无 codemod，属 ESM-only + Node 门槛变更，已按官方说明直接 bump + CLI 全量测试覆盖。

## 待排 Wave（按风险从低到高，逐个 codemod + 最小验证）

- Wave-A（低风险 minors/patches 收尾）：`fastify 5.8→5.12`、`zod 4.3→4.5`、`mermaid`、`dep-cruiser`、`tsx` 等；
  均在 caret 内或纯 minor，用 `pnpm update -r` + 包级测试即可。
- Wave-B（Biome 2）：重做 `migrate --write`，评估 `assist.organizeImports` 是全量 `--write` 还是配置关闭；
  验证 `pnpm check` 增量（注意基线已红，需先定基线策略）。
- Wave-C（Sentry 9→10、commander 已完、framer-motion 12→13、vite 7→8 + plugin-react 5→6、jsdom 29→30、knip、fallow 2→3）：
  逐包查官方 migration + codemod（如 Sentry codemod），逐个 bump + 包级测试 + `test:deployment-smoke`（按 AGENTS 路由）。
- Wave-D（高风险核心）：`TypeScript 5.9→7`、`Vitest 3/4→5`（含 coverage-v8 3→5 对齐）、`Nest 11→12`（7 个包）+ `@nestjs/config 4→12`、
  `@types/node 25→26`、`@types/mime-types 2→3`。每个单独成项：官方 migration 通读 → codemod（若有）→
  `pnpm typecheck` + 对应包级测试 + `test:runtime-foundations` / `test:deployment-smoke`。
- Wave-E（收尾）：`pnpm outdated -r` 清零复查；`pnpm exec fallow audit --base main`（跨包导入变更时必需）；
  有 Docker 环境补跑 `pnpm --filter @trapmap/evals eval:smoke`；按治理回写 `reference/`/`operations/`/`architecture/`。

## 回写备忘

- 已更新：`packages/ai-providers/README.md`（AI SDK 适配器章节）、本文件
- 后续每完成一个 Wave：更新对应 `package.json` + 锁文件 + 本文件复选框；若触及 API/运行时/环境变量语义，
  按 `DOCUMENTATION_GOVERNANCE.md` 回写权威页后再更新入口索引；不回写已归档文档。

## 第二轮进展（本 turn）

- [x] **OTel 实验包 0.219→0.222**（`exporter-metrics-otlp-http`、`exporter-trace-otlp-http`、`sdk-node`）：
  官方 breaking 仅为“配置文件创建 Propagator/TracerProvider 失败时 fail-fast”，本仓不用配置文件直连，
  直接 bump，`backend-core` 测试通过。
- [x] **align `@types/mime-types` 到运行时主版本**：`^2.1.4→^3.0.1`（运行时 `mime-types` 已是 v3），`lib` 76/76 通过。
- [x] **`promptfoo 0.122.0→0.122.2`、`markdownlint-cli2 ^0.22.1→^0.23.2`**：根级补丁/小版本 bump。
- [x] **Vitest 全仓 3/4→5.0.0 + `@vitest/coverage-v8`→5.0.0**：官方要求 Vite>=6.4、Node>=22（本仓 Node 24、web-panel vite 7，
  满足）；`ai-providers` 54/54、`contracts` 955/955、`service-knowledge-write` 165/165 通过。
  附带发现 bench 配置 `benchmarks/harness/vitest.bench.config.ts` 别名缺 `lib` 子路径（`vitest bench` 预存失败，
  与 Vitest 版本无关，另行排期）。
- [x] **Zod 4.5 语义收敛**：`maintenanceEntryListRequestSchema.staleVerification` 在 zod 4.5 下
  `preprocess(fn, boolean.optional())` 对缺字段跳过 preprocess（得 `undefined`），与测试注明的
  “preprocess converts undefined to false” 意图不符；改为 `z.boolean().default(false)` 显式化，
  `generate:contracts:check` 与 `generate:openapi:check` 均通过。
- [x] **Vitest 5 类型收敛**：`service-knowledge-write/src/test-helpers.ts` 的 `createTransactionPool`
  推断返回类型泄漏 vitest chunk 类型，在 `declaration:true` 下报 TS2742；补显式
  `TestTransactionPool` 结构类型（不改运行时语义），`pnpm typecheck` 通过。
- [x] **卫生清理**：删除 `packages|apps/*/src` 下 255 个 gitignored 过期编译产物（`.js/.d.ts/.map`），
  它们曾遮蔽 `.ts` 使 vitest 运行 stale 代码；误删的 2 个受追踪 `.d.ts` 已恢复
 （`apps/web-panel/src/vite-env.d.ts`、`packages/host-local/src/types.d.ts`）。

剩余 14 项（`pnpm outdated -r`）：`@biomejs/biome` 1→2、`@nestjs/*` 11→12（6 包，含 config 4→12）、
`@sentry/node` 9→10、`@types/node` 25→26、`@vitejs/plugin-react` 5→6、`fallow` 2→3、
`framer-motion` 12→13、`jsdom` 29→30、`typescript` 5.9→7、`vite` 7→8。

## 第三轮进展（本 turn 后半）

- [x] **jsdom 29→30**（根 dev）：web-panel 全量 102/102 通过；附带修复 Vitest 5 mock 构造语义变化：
  `g6-graph-component.test.tsx` 中 `mockImplementation(() => new FakeGraph())` 箭头函数在 Vitest 5 下
  `new Graph()` 会透传构造到实现并抛 “not a constructor”，改为普通 `function` 表达式后通过。
- 当前 `pnpm outdated -r` 剩余 13 项，均为需独立波次的高风险 major：
  `@biomejs/biome` 1→2、`@nestjs/*` 11→12 + `@nestjs/config` 4→12、`@sentry/node` 9→10、
  `@types/node` 25→26、`@vitejs/plugin-react` 5→6、`fallow` 2→3、`framer-motion` 12→13、
  `typescript` 5.9→7、`vite` 7→8。
- 验证基线：`pnpm typecheck` 通过；`contracts` 955/955、`service-knowledge-write` 165/165、
  `ai-providers` 54/54、`web-panel` 102/102；`generate:contracts:check` 与 `generate:openapi:check` 通过。

## 第四轮进展（本 turn：Vitest 5 装饰器余波根治）

- 根因：Vitest 5 为其 transform 管线解析到 Vite 8（peer `^6.4||^7||^8` 取最高），Vite 8
  用 oxc 保留原生装饰器语法直接输出，而本机 Node v24.16 的 V8 无法解析标准装饰器
  （`node -e "@dec class A {}"` 报同款 `SyntaxError: Invalid or unexpected token`）。
  旧管线（Vitest 3 + Vite 7 + esbuild）把装饰器编译成 `__decorate` 调用故无事。
  附带确认：与 OTel 0.222 无关（回退到 0.219 仍复现）、与 web-panel 的 Vite 版本无关
  （Vitest 自带管线版本独立）。
- 触发面：函数体内的类装饰器（`createNestAdapter` 内的 `@Controller()`、
  `route-test-app`/`routes.test` 内的 `@Module()`、describe 回调内的 `@Injectable()` 测试 guard）。
  顶层 `@Injectable/@Module` 不受影响（host-local  observability 7 文件一直通过）。
  此前删除 `src` 下 stale 编译产物后才暴露（之前 vitest 跑的是 stale `.js`）。
- 修复（语义等价）：Nest 11 的 `Controller()/Catch()/Module()` 均为单参 legacy 风格
  元数据装饰器（已读 `node_modules` 源码确认），且所涉类均无构造函数注入，
  故改函数式调用（`Controller()(Cls)` 等），与装饰器语义完全一致：
  - `packages/backend-core/src/http/adapters/nest.ts`
  - `packages/backend-core/src/testing/route-test-app.ts`
  - `packages/backend-core/test/http/adapters/adapters.test.ts`
  - `packages/service-identity-access/test/routes.test.ts`
- 附带回退重做：为二分曾临时回退 OTel→0.219、web-panel Vite→7，均已恢复
  （OTel 0.222、Vite 8 + plugin-react 6），`pnpm install` 已同步。
- 验证：`backend-core` 40 文件 238 用例、`host-local` 36 文件 251 用例全绿；
  `adapters.test.ts` 与基线一致（17/17）；`typecheck` 通过。

## 第五轮进展（本 turn：类型/前端/工具链 + 分布式门禁修复）

- [x] **`@types/node` 25→26**（16 个包）：`pnpm typecheck` 一次通过。
- [x] **`framer-motion` 12→13**：窄升级、保留 `framer-motion` 包名与导入
  （迁到 `motion/react` 留作独立架构决策）；web-panel 102/102 通过。
- [x] **`fallow` 2→3**：官方 3.0 无 breaking（CLI/配置/JSON 契约不变）；
  `pnpm check:fallow` exit 0 通过。
- [x] **Vite 7→8 + `@vitejs/plugin-react` 5→6**（组合波，plugin-react 6 peer 要求 Vite 8）：
  官方要求 Node>=20.19/22.12（本机 24），rolldown/oxc 替代 esbuild，
  `rollupOptions` 有兼容层自动转换；web-panel `build` 与单测全绿。
- [x] **jsdom 29→30**：web-panel 全绿（含 G6 mock 的 Vitest 5 构造语义修复）。
- [x] **修分布式门禁深路径导入**（预存 bug，本轮验证中暴露）：
  `infra/go-accelerator/fallback.ts` 对 `@trapmap/lib/*` 子路径的三处深导入改为根导入
  （根已重导出）；`@trapmap/infra` exports 补 `./go-accelerator/*.js` 声明
  （沿用 backend-core `./runtime/*.js` 惯例）。`distributed-runtime-closeout` 3/3、
  `host-distributed/test/gateway` 111/111 通过。
- 备注：`pnpm test:runtime-foundations` 脚本本身路径已坏（指向 `src/...` 而测试在
  `test/...` 下，`No test files found`），与本次升级无关；已用等价直跑覆盖
  （host-local runtime 70/70 + gateway 111/111）。

剩余 8 项（4 波）：`@biomejs/biome` 1→2、`@nestjs/*` 11→12 + `@nestjs/config` 4→12、
`@sentry/node` 9→10、`typescript` 5.9→7。

## 第六轮进展（本 turn：TypeScript 5.9→7.0.2，直升不经 6.0）

- 版本现实：npm `latest=7.0.2`，`beta=6.0.0-beta`（无 6.0 正式版），故 5.9→7.0.2 直升，
  以隔离仲裁代替“先 6 后 7”。
- 官方 breaking（7.0 公告）对本仓的实际命中只有一条：`types` 默认由“全部可见 @types”
  改为 `[]`。其余（`rootDir` 默认 `./`、target/module/moduleResolution 下限、
  `asserts` 进口、`esModuleInterop=false` 等）本仓均已在安全侧（16 包全显式
  `rootDir: src`，base 为 NodeNext/ES2022）。
- 修复（12 行 diff）：`tsconfig.base.json` 加 `"types": ["node"]`；10 个依赖
  `@types/pg` 的包加 `"types": ["node", "pg"]`；`packages/lib` 加
  `"types": ["node", "mime-types"]`；web-panel 保持既有显式列表不变。
- 先用隔离安装的 TS 7.0.2（`/tmp` probe，不碰 lockfile）跑 `tsc -b` 仲裁：
  修前报数十条“找不到 node 全局”（`setTimeout`/`process`/`fetch` 等实为 @types/node
  提供），修后零错误；再 bump 16 处 `"typescript": "^5.9.3"→"^7.0.2"` +
  `pnpm install`，`pnpm typecheck`（实为 TS 7.0.2）通过。
- `experimentalDecorators`/`emitDecoratorMetadata`（host-local）在 TS 7 下继续可用，
  公告未将其列为 hard-error，`tsc -b` 全量通过为证。
- 验证：`typecheck`；contracts 955、ai-providers 54（本轮后补跑，见下）。

## 第七轮进展（本 turn：Biome 1.9.4→2.5.12，收官）

- 官方路径：升包 + `biome migrate --write` 自动处理配置 breaking（`recommended`→
  `preset`、`files.ignore`→`files.includes` + `**` 否定式、schema 2.5.12）。
- 基线策略（先定后动）：v1 全量 `biome check` 在本分支即 47,303 errors，
  其中 debris（gitignored 的 `benchmarks/results/**/df.json`、未追踪 `.vitest/`）
  占 99%；去 debris 后真实 102 条（organizeImports + 可修复 style 为主，
  均为本分支存量红）。v2 同口径首跑 24,077 errors（含新 organizer 的 439 处
  assist + 约 120 条新规则发现）。
- v2 organizer 行为变化（revamp + monorepo 感知）：自包导入（`@trapmap/cli/*` 等）
  与相对路径按新 canonical 排序，`pnpm check`（CI 门禁）下必须接受并 autofix。
  对 `apps/cli` 等共约 560 文件执行 `biome check --write`（安全修复）。
- 配置追加（与 migrate 同列，便于本地门禁可用）：`css.parser.tailwindDirectives: true`
  （Tailwind v4 `@import "tailwindcss"`/`@source`/`@custom-variant` 否则 parse 失败，
  v1 无 CSS parser 故为新增面）；`files.includes` 加 `!**/.vitest`、
  `!**/benchmarks/results`、`!**/temp`（均为生成物输出，与既有 `data/`/`reports/`
  同类；另移除游离 `.vitest/` 已移至 `/tmp/debris-backup/vitest-20260906`）。
- v2 新规则的真实发现（已修）：`noUnsafeOptionalChaining`（mcp read-tools 测试，
  `(init?.headers as …).authorization` 加 `?? {}`）、`useIterableCallbackReturn`
  （cli summarizers `forEach` 箭头改块体）、4 处测试未用导入（cli）等。
- 教训（已止损）：`--write` 会把 `useArrowFunction` 反向应用到 Vitest 5 构造 mock
  （g6 测例回退为箭头导致 “not a constructor”），已恢复 `function` 并加
  `biome-ignore`；`--write` 会把 guard 脚本注释里的 `@ts-ignore` 改写成
  `@ts-expect-error`（文档失真，已还原 + 文件级 `biome-ignore-all noTsIgnore`，
  guard 自检仍报既有 34 项，数量不变）；`noTsIgnore` 对注释/字符串的判定 +
  行号漂移曾导致误删 `KnowledgeEntry` 导入（已修复，后续一律用内容断言而非裸行号）。
- 收敛：剩余 warning/info（未用导入 41、新 `useOptionalChain/useTemplate/
  useLiteralKeys`、模板占位符 `${WORKING_DIR}`/compose `${VAR:-}` 等 intentional
  处加 suppress、3 处 stale `noDelete` suppress 删除、CSS `!important` 文件级
  ignore、v-cursor 死 state 删除）全部清零。终态 `pnpm check` 1554 文件零诊断。
- `pnpm outdated -r` 已空（57→0），`outdated` 轴正式收官。

## 终验证（本 turn）

- `pnpm typecheck`（TS 7.0.2）、`pnpm check`（Biome 2.5.12，1554 文件零诊断）全绿。
- 单测：contracts 955、cli 547、backend-core 238、host-local 251、gateway 111、
  web-panel 102、service-knowledge-write 165、service-knowledge-read 123、
  service-governance-review 69、lib/db/infra/client-core 118、job-runtime+
  identity-access 48、service-cron 50、assembly 48、candidate-ingestion 41、
  app-mcp 41、scripts 308/312（4 失败为既有归档文档外链债务，与本轮无关）。
- `pnpm check:fallow` exit 0（`audit --base main` 无 boundary/zone 违规）；
  `check:asserts` 仍为既有 34 项（本轮新增断言模式 0 行）；
  `generate:contracts:check` 与 `generate:openapi:check` 通过。
- 未跑：`eval:smoke`（本机无 Docker daemon，CI 补跑）；web-panel e2e（需浏览器，
  仅改一处 e2e helper 死代码删除，biome 干净）。
- 后续注意（TS 7 / Biome 2 新约束）：新增包 tsconfig 必须显式写 `types`
  （否则丢 node 全局）；`biome check --write` 后对含构造 mock / `@ts-ignore`
  字样的文件必须复核 diff。

## 终验复核（续 turn：完成度审计，树未改动）

- `pnpm outdated -r` 为空（57→0 保持）；`ai@7.0.93`、`@ai-sdk/openai@4.0.60`、
  `@ai-sdk/google@4.0.64`、`@ai-sdk/openai-compatible@3.0.44` 经 npm 确认为当日 latest。
- LangChain：无 package.json 依赖、无源码导入；`langchain` 字样仅存于
  `contracts/test/index.test.ts` 标签夹具字符串（数据值，非依赖）。
- 集中化：全仓仅 `ai-providers/src/adapters/aisdk.ts` 导入 `ai`/`@ai-sdk/*`；
  消费方一律经 `@trapmap/ai-providers`（chat + embedding 经 adapter）。
- 门禁：`install --frozen-lockfile`、`typecheck`（TS 7.0.2）、`check`（1554 文件零诊断）、
  `fallow --ci` 均绿；`check:asserts` 保持既有 34 项；ai-providers 54、contracts 955 通过。
- 已知非本目标项：scripts 单测 4 失败（归档文档外链，既有）、`eval:smoke` 需 Docker（本机无 daemon）。

## 第八轮进展（本 turn：TS 7.0.2→6.0.3 回退 + 本地启动链路修复 + 分布式 8 服务实活）

- 用户指令：`typescript先用6`（TS7 生态未铺开）。16 处 `"typescript": "^7.0.2"`→`"^6.0.3"`
  （根、`apps/web-panel`、14 个 packages；6.0.3 为 6 线最新，`latest=7.0.2` 不变）。
  `tsc --version` = 6.0.3；`pnpm outdated -r` 仅剩 typescript 一项（故意不跟 TS7）。
- 迁移后全量复验（TS6 下）：`typecheck` EXIT 0；20 包 + mcp 全绿
  （contracts 955、ai-providers 54、cli 547、backend-core 238、host-local 251、
  host-distributed 238、web-panel 102、assembly 48、lib 76、db 6、infra 15、
  client-core 21、knowledge-write 165、knowledge-read 123、governance-review 69、
  job-runtime 31、identity-access 17、cron 50、candidate-ingestion 41、app-mcp 41）；
  `pnpm check`（Biome 2.5.12，1554 文件零诊断）；`check:fallow` exit 0；
  `check:asserts` 保持既有 34 项（新增 0）；`generate:contracts/openapi:check` 通过；
  deployment-smoke 等价集 443/443、runtime-foundations 等价集 181/181、
  distributed-acceptance 等价集 57/57（均为 `test/` 路径直跑，根脚本仍指向过期 `src/`）；
  scripts 282/286（4 失败与终验证基线同源：归档文档外链/closeout-surface 守卫，
  零 typescript 相关）；`eval:smoke`（ coordinator 直连本地 PG，绕过 Docker）：
  migrations×6 + 临时库生命周期正常，确定性 44/44（ingestion 1/1、planning 33/33、
  alignment 10/10），retrieval 4/26、summary 1/6、graph F1=0 与基线一致
  （Google key leaked、MiMo key 无效，属凭证环境问题）。
- 本地启动连环修复（之前误判为 `app.init()` 空转，实为错误被吞 + 误导性超时文案）：
  1. `RequestContextMiddleware` 漏网：首参 `import type` 无 `@Inject`，
     `emitDecoratorMetadata` 下退化为 `Function`，`app.init()` 在 71ms 即抛
     “can't resolve dependencies … (?, HOST_LOCAL_CONFIG)”，cordis fiber 吞错后
     主流程空等 30s。修复沿用本 wave 同类模式（`@Inject(RequestContextService)` +
     值导入），网关 160ms 完整启动（create→init→listen→provide 全链路），
     `/ready`=`ready`、`/health`=`ok`（profile=local-agent）。
  2. 分布式 `startDistributedService` 同源 race：`boot()` 后立即 `ctx.get` 取
     `SERVICE_SERVER_SERVICE` 得 `undefined`（`Cannot read properties of undefined
     (reading 'start')`）。修为 30s 有界等待（config/server 必需、db 按需），
     与 host-local main 同模式；`pnpm typecheck` + Biome 干净。
  3. `packages/host-distributed` exports 缺 `./cron-scheduler/*.js`
    （`ERR_PACKAGE_PATH_NOT_EXPORTED`），补声明（沿用同文件惯例）。
  4. 本地单进程分布式 8/8 实活（无 Docker）：`node apps/distributed/dist/index.js`，
     localhost 默认拓扑（勿设 `TRAPMAP_DEPLOYMENT_PROFILE=distributed`，否则切
     docker-dns 主机名），`TRAPMAP_TASK_TRANSPORT=postgres`，
     `TRAPMAP_SERVICE_POOL_SIZE=4`（默认 7×5=35 超 30 预算），共享本地 PG，
     gateway 4000 … cron-scheduler 4007，gateway `/health`=`ok`。
- 本轮新发现、未修（记入问题池）：CLI live-login 契约漂移。
  `POST /v1/auth/login`（分布式网关）原样转发 identity-access 内部体
  `{sessionToken}`（system-admin）/`{sessionToken,userId,handle}`（普通登录），
  而 contracts `loginResponseSchema` 为严格 `{session: activeSession}`，
  CLI `login` 解析必败（实测 `Unrecognized key: "sessionToken"`）。
  全仓无任何服务端路径生产完整 `ActiveSession`（网关/CLI 测试均在接缝处 mock，
  故从未暴露；属 DDD 重组前长期漂移，非 TS6 回归）。修法应在
  service-identity-access 路由适配层补 `ActiveSession` 组装（member/team/权限），
  网关只透传契约体 + `x-session-token` 头；工作量超出本轮验证范围，另起波次。
  受其阻塞：CLI `login`→`search`→`operations status` live 链路暂无法走通
  （`search` 等命令需 session；单元层面 CLI 547 + 切片 81 全绿不受影响）。
- 仍被环境阻塞：`test:runtime-closeout:compose` 需 Docker daemon（本机无，
  本 turn 复验 `Cannot connect to the Docker daemon`）；`eval:smoke` 质量门需
  有效 LLM 凭证；web-panel e2e 需浏览器。
- 过程备注：本 goal 要求 subagent 驱动，但本环境 `spawn_agent` 不可用
 （`unsupported call`），改用同构后台分片（CLI 片 / gates 片 / 冒烟片）并行代替；
  临时探针（nest-transport boot-probe）已还原，`git diff` 仅留 3 个正式修复；
  本地 PG（`~/local/pgdata`，5432）与分布式 8 服务栈保持运行中（验证用，
  收尾时按需关闭）。

## 第九轮进展（本 turn：CLI live-login 契约修复 + 检索链路两处真实修复 + 本地 e2e 打通）

- 前情：网关/compare 路径在 mock 接缝处互相掩盖，live 链路从未真正走通过。
  本轮用 live 栈逐段打，修一处、验一处。
- [x] **CLI live-login 修复**：网关 `POST /v1/auth/login` 原样转发内部体
  `{sessionToken}`，而 contracts 要求严格 `{session}`。在 backend-core 新增
  `IdentityAccessPort.describeSession`（application 层用各 repo 组合
  `ActiveSession`，domain 新增 `toContractRoleTemplate`；system-admin 为合成
  member），service 路由返回 `{session, sessionToken}` 并以
  `loginResponseSchema` 运行时校验，网关改发 `{session}` 白名单体 +
  `x-session-token` 头（含普通登录分支，之前漏设头）。CLI `login` live 通过。
- [x] **CLI search 请求修正**：CLI 往 v1 发 `seed`，契约要求 `query`，补映射。
- [x] **检索 read-model 接缝修复**：live search 500，
  `knowledgeEntries.flatMap is not a function`——owner `listByFilter` 回
  `{items,total}` 信封而管线要裸数组（`as unknown as` 桥掩盖）。在
  `createKnowledgeReadOwnerRetrievalServices` 加显式适配（信封解包 + 数组兼容，
  零断言），并把 owner 条目投影为 `KnowledgeRecord`
  （`entryToRetrievalRecord`，沿用 `artifactToRetrievalEntry` 既定模式：
  行列优先、无验证缓存置 null fail-open、未知走 null）。
- [x] **检索响应形状修复**：`RetrievalQueryPort.search` 把管线刚建好的完整
  `RetrievalResponse` 又压成 `{results,totalEstimate,channel}`，而 v1/v3/CLI
  全都要完整体。改为原样返回；删无用 `RetrievalSearchResponse/Result`；
  更新 8 处测试 mock/断言为完整体。
- 验证：`typecheck` 绿；backend-core 242、knowledge-read 123、host-local 251、
  host-distributed 238、cli 547 全绿；Biome 干净；`check:asserts` 保持 34。
- Live（单进程分布式 8/8，localhost 拓扑）：CLI `login`→`search`（200 完整契约体）
  打通；`GET /v1/operations/status/async` 正常；`pnpm test:runtime-closeout`
  EXIT 0（非 compose 版）。
- 新发现、未修：CLI `status`（兼容性 sunset 状态）打的
  `GET /v1/operations/status` 全仓无服务端实现（只有 `/async`），属缺接口而非
  漂移，需另起波次做聚合端点，本轮不扩散。
- 仍被环境阻塞：compose 版 closeout（无 Docker daemon）、eval 质量门（坏 key）、
  检索语义相关性（fallback 向量下空结果属预期，真实 embedding 需有效 key）。

## 第十轮进展（本 turn：回归电池 + 缺口定级）

- 回归电池（响应形状变更后）：deployment-smoke 等价集 443/443、
  runtime-foundations 等价集 181/181、distributed-acceptance 等价集 57/57、
  `check:fallow` exit 0、`pnpm check` 零诊断，全绿。
- 缺口定级：`GET /v1/operations/status`（兼容性 sunset 状态）确认全仓无实现——
  需要 legacy 条目计数、迁移计数＋样本、artifact 按源计数、共存/日落判定，
  属跨服务聚合新功能（非漂移），维持 defer，另起波次。
- 仍被环境阻塞：compose 版 closeout（无 Docker daemon）、eval 质量门（坏 key）。

## 第十一轮进展（本 turn：修复批 focused review + 错误透传修复）

- Review 本轮修复批时发现真问题：`replyFromInternalLogin` 对**所有**状态码都发
  `{session}` 白名单体，非 2xx 时会吞掉上游错误包体（回 `{session: undefined}`）。
  已改为仅 2xx 整形、非 2xx 原样透传；补回归测试（401 包体 + 无头断言）。
- Live 验证（重启后 8/8）：错 key → 401 + 原文案、无 token 头；对 key →
  200 + `x-session-token` 头 + 严格 `{session}` 体（体内无 token）。
- `typecheck` 绿；gateway routes 33/33；Biome 干净。
- 缺口重申：`GET /v1/operations/status` 仍缺实现（跨服务聚合新功能，另起波次）；
  compose 部署与 eval 质量门仍被环境阻塞。

## 第十二轮进展（本 turn：Docker 可行性复探 + 变更后三包重验）

- Docker 复探（新证据）：`kernel.unprivileged_userns_clone=1`、`/etc/subuid` 有
  `wunai:100000:65536`（此前“为空”的结论已纠正）、有 `newuidmap/newgidmap`、
  用户在 `docker` 组；但仍缺 `rootlesskit`/`slirp4netns`、无 overlayfs 模块、
  无 root/sudo。结论不变：daemon 起不来，需外部变更（root 或装包）才可解。
- 错误透传修复后重验：host-distributed 239（238+1 新用例）、cli 547、
  knowledge-read 123，全绿。

## 第十三轮进展（本 turn：根级测试脚本过期路径修复 + 字面命令全绿）

- 根因：6 个文档化测试命令仍指向已搬迁的 `src/...` 路径（测试早已迁至
  `test/...`），按文档字面跑即 `No test files found`。属测试基建债务，非行为变更。
- 修复（纯路径替换，结构/顺序/`--project` 保持原样）：根 `test:deployment-smoke`、
  `test:runtime-foundations`、`test:distributed-closeout`、`test:discovery-closeout`、
  `test:observability-closeout`，以及 host-distributed `test:acceptance`
  （另含已知的 `knowledge-write/routes.test.ts`→`composition.test.ts` 替换）。
- 字面验证全绿：smoke 444、foundations 182、dist-closeout 47、discovery 22、
  observability 79、acceptance 57；`pnpm test:light-target`（build + smoke +
  foundations）EXIT 0。smoke/foundations 比等价直跑各多 1 系 `--project`
  未限定的跨项目命中，无失败，属口径差异。

## 第十四轮进展（本 turn：接缝修复后 eval:smoke 回归）

- 检索接缝修复后重跑 `eval:smoke`：retrieval 4/26→**5/26**（多过 1 个，零回退），
  summary 1/6、graph F1=0 不变（坏 key 环境问题）；确定性 44/44
  （ingestion 1/1、planning 33/33、alignment 10/10）保持。

## 第十五轮进展（本 turn：heavy-target 字面全绿，目标转 blocked）

- `pnpm test:heavy-target` EXIT 0（smoke 444 + foundations 182 + discovery 22 +
  distributed-closeout 47 + runtime-closeout JSON，全对 live 本地栈）。
- 至此测试文档中**所有不依赖外部状态的门禁**均已字面跑通。剩余三项全部需要
  外部输入，无其他可执行验证：
  1. compose 部署：要 root 或装包（`rootlesskit`/`slirp4netns` 缺失、无 overlayfs）。
  2. `GET /v1/operations/status` 兼容端点：要产品语义（legacy 定义/日落规则/
     coexistence 条件），已问三次无回复。
  3. 语义质量门：要有效 LLM key（当前 Google leaked、MiMo invalid）。
