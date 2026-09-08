# `@trapmap/contracts`

你用这个包在 CLI、服务端与异步 worker 之间共享 Zod schema、类型与端口接口，它是运行时的契约边界。

## 入口

主入口为 `packages/contracts/src/index.ts`，按领域组织在 `packages/contracts/src/domain/`（`admin`、`artifacts`、`async`、`auth`、`boundary`、`candidates`、`common`、`conflict`、`cron`、`decay`、`evidence`、`feedback`、`graph-extraction`、`health`、`knowledge`、`retrieval`、`review`、`skills`、`team` 等），枚举类型见 `packages/contracts/src/enum-types/`。

```ts
import { knowledgeEntrySchema } from '@trapmap/contracts';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `zod` | 唯一的运行时依赖，schema 即契约 |
| `build` / `typecheck` | `tsc -p tsconfig.json` 编译 / 校验 |
| `test` | `vitest run --project contracts` |

评测专用契约已迁往 `evals/types/`，`@trapmap/contracts/evals` 已退役，产品代码禁止从 `evals/` 导入。本包为私有包，你通过 workspace 引用它。
