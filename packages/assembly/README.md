# `@trapmap/assembly`

你用这个包以 TS 组合方式声明能力节点并校验装配，它是 TrapMap 的编程式装配内核。

## 入口

主入口为 `packages/assembly/src/index.ts`，节点定义见 `packages/assembly/src/define-node.ts`，装配器见 `packages/assembly/src/create-assembly.ts`，启动校验见 `packages/assembly/src/startup-checks.ts`，退出控制见 `packages/assembly/src/shutdown-controller.ts`，形态 builder 见 `packages/assembly/src/profiles/`。

```ts
import { createAssembly, defineNode, defineContract } from '@trapmap/assembly';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@deepseek-ai/cordis` | 依赖图 / 生命周期 / 配置校验底座 |
| `zod` | 配置校验 |
| `build` / `typecheck` | `tsc -p tsconfig.json` 编译 / 校验 |
| `test` | `vitest run --project assembly` |

装配只用 TS 组合，不引入 yml / json 装配文件。`profiles/` 下的形态收敛属于后续路线，本包当前范围以 `packages/assembly/src/` 落点为准。

## 常见用法

### 跑本包测试

```bash
pnpm --filter @trapmap/assembly test
pnpm --filter @trapmap/assembly typecheck
```

### 声明一个能力节点

```ts
import { createAssembly, defineNode, defineContract } from '@trapmap/assembly';
```

你先用 `defineContract` 定契约，再用 `defineNode` 实现，最后用 `createAssembly` 组装并跑 `startup-checks`。节点定义细节见 `packages/assembly/src/define-node.ts`。
