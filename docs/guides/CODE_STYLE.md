# 代码风格指南

> 状态： Active（2026-09-08）。本页收敛代码写法，事实细节以配置与守卫源码为准。

## 目标

你 写出可审、可测、可合并的代码。你 落笔前先对齐本页规则。你 触犯规则时守卫拦截你。

## 规则

### 格式

- 你 使用 2 空格缩进，行宽 100 ，换行保持差异小。依据见 `biome.json` :3-7 。
- 你 使用单引号，分号结尾。依据见 `biome.json` :64-68 。
- 你 运行 `package.json` :30 所载格式化命令整理差异，你 运行 `package.json` :31-32 对应检查命令前先保证格式干净。
- 你 为新增页面保留单个 H1 ，围栏代码块标注语言。新骨架严格 lint 清单见 `scripts/docs-surface.ts` :77-82 ，具体规则以 `.markdownlint-current.jsonc` :3-6 为准。
- 仓库内缺 .editorconfig 文件（未知 / 待确认（2026-09-08）），编辑器缩进以 `biome.json` 为准

### 类型

- 你 打开 `tsconfig.base.json` :8 的严格模式写作，不关闭它。
- 你 不留下未用变量与未用参数。依据见 `tsconfig.base.json` :9-10 ， `biome.json` :12-15 亦拦截未用变量。
- 你 为索引访问与可选属性写显式处理，不依赖隐式 `any` 。依据见 `tsconfig.base.json` :15-16 。
- 你 打开声明产物与一致大小写检查。依据见 `tsconfig.base.json` :11-20 。
- 你 跑 `package.json` :63 的类型检查验证改动。

### Falsy 与存在性检查

- 你 不用 truthy 检查判断值是否存在，它会错误丢弃 `''`、`0`、`false` 等合法 falsy 值。

| 场景 | 错误写法 | 正确写法 |
|------|----------|----------|
| 条件展开 | `...(value ? { value } : {})` | `...(value != null ? { value } : {})` |
| 条件渲染 | `if (data.field)` | `if (data.field != null)` |
| 数组元素检查 | `arr[0]` | `arr.some(x => x != null)` |
| 空数组 join | `arr?.join(', ') ?? 'fallback'` | 先检查 `arr.length > 0` |

- `!= null` 同时检查 `null` 与 `undefined`，保留 `''`、`0`、`false` 等合法值。

### 导入

- 你 跨包引用走 `@trapmap/*` 包名，不写跨包相对路径。同包内引用走相对路径。判例见 `scripts/check-relative-imports.mjs` :163-175 。
- 你 不在包内自引包名， `@trapmap/host-distributed` 除外。判例见 `scripts/check-relative-imports.mjs` :46-47 与 :150-161 。
- 你 新增包或移动跨包路径后跑 `package.json` :67 的导入守卫，必要时跑 `package.json` 对应的依赖巡检命令。
- 你 引用路径映射以 `tsconfig.base.json` :21-60 为准，不手写深路径别名。

### 断言

- 你 不新增 `@ts-ignore` 与 `@ts-expect-error` 。判例见 `scripts/check-naked-asserts.ts` :38-48 。
- 你 不写裸 `as never` 与 `as unknown as` 桥接类型，优先用 `packages/contracts/src/index.ts` 的运行时校验或显式收窄。判例见 `scripts/check-naked-asserts.ts` :38-48 ，路由约束见 `AGENTS.md` :31 。
- 第三方库类型缺口确需断言时，你 在同行加 `lib type gap:` 注释说明。豁免语义见 `scripts/check-naked-asserts.ts` :50-56 。
- 存量豁免清单只追踪历史包袱，新代码不得援引它新增断言。清单路径见 `scripts/check-naked-asserts.ts` :41 。

### 复用

- 你 把多包共用的枚举、字面量联合、共享接口放入就近 enum-types/ 目录，经同目录 index.ts 聚合导出。约定见 `AGENTS.md` :27 。
- 你 复用 `@trapmap/lib` 已有工具，不在各包重复实现。涉及通用第三方依赖时，你 在 `@trapmap/lib` 内声明并经其消费。约定见 `AGENTS.md` :29-30 。
- 你 写新领域规则时放入 `packages/backend-core/src/knowledge-write/domain/lifecycle.ts` 所示的纯函数层，不在基础设施层加业务判断。约定见 `AGENTS.md` :57 。
- 你 写新 HTTP 路由时经 `packages/backend-core/src/http/route-contract.ts` 的路由工厂声明，由宿主适配器消费。约定见 `AGENTS.md` :58 。

## 执行方式

你 按改动范围取最小验证集合，你 只在必要时扩大范围。

```bash
pnpm check
pnpm typecheck
pnpm check:asserts
pnpm check:imports
```

跨包改动追加架构边界验证，需联网安装产物时先完成 `pnpm install --frozen-lockfile` ：

```bash
pnpm exec fallow audit --base main
```

文档与结构改动追加文档守卫：

```bash
pnpm check:docs
pnpm check:structure
```

单文件测试走根脚本，包级测试走包过滤器：

```bash
pnpm test:file -- packages/host-local/test/nest/app.test.ts
pnpm --filter @trapmap/contracts test --run
```

## 违反后果

- 格式与 lint 失败阻断 `check` 任务， CI 对应任务见 `.github/workflows/ci.yml` :47-63 。
- 类型失败阻断 `typecheck` 任务， CI 对应任务见 `.github/workflows/ci.yml` :30-45 。
- 裸断言失败阻断 `doc-guardrails` 任务中的断言守卫， CI 对应任务见 `.github/workflows/ci.yml` :180-208 ，本地复现用 `package.json` :43 所载命令。
- 跨包相对引用与自引失败阻断同一任务中的导入守卫，本地复现用 `package.json` :67 所载命令。
- 你 修复后重跑本页执行方式所列命令，你 不绕过守卫合入。
