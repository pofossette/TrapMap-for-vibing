# `@trapmap/lib`

你用这个包调用跨包复用的纯函数，它是全仓的共享工具底座。

## 入口

主入口为 `packages/lib/src/index.ts`，全部函数经此转出。

| 模块 | 导出 |
| --- | --- |
| `time` | `nowIso`、`timestamp`、`formatDate` |
| `async` | `timeout` |
| `string` | `truncate`、`normalizeLabel` |
| `array` | `uniq`、`uniqBy`、`chunk` |
| `object` | `asRecord` |
| `hash` | `sha256` |
| `id` | `prefixedId` |
| `parsing` | frontmatter 与 skill markdown 解析 |
| `cron` | `cronNextRun`、`cronValidate` |
| `vector` | `cosineSimilarity`、`normalizeVector`、确定性回退向量 |
| `strategy-gene` | `formatStrategyGene` |
| `canonical-hash` / `canonical-json` | `sha256CanonicalJson`、`canonicalJsonStringify` |

```ts
import { nowIso, sha256, truncate, uniqBy } from '@trapmap/lib';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/contracts` | `Sha256Hex` 等共享类型 |
| `croner` | cron 表达式求值 |
| `gray-matter` | markdown frontmatter 解析 |
| `mime-types` | 媒体类型识别 |
| `build` / `typecheck` | `tsc -p tsconfig.json` 编译 / 校验 |
| `test` | vitest `lib` 项目 |

本包只放纯函数，任何宿主、传输、存储逻辑都不得进入。
