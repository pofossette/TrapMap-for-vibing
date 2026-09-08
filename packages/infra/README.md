# `@trapmap/infra`

你用这个包复用宿主无关的共享基础设施（pgvector SQL 构造、回退 embedding、治理过滤、gene 检索文档）。

## 入口

| 子路径 | 来源 | 内容 |
| --- | --- | --- |
| `@trapmap/infra` | `packages/infra/src/index.ts` | 全量转出 |
| `@trapmap/infra/vector` | `packages/infra/src/vector/` | `formatVectorLiteral`、`clampSimilarity`、距离 / 相似度表达式、team / scope / gene 治理过滤、`buildGeneSearchDocument` |
| `@trapmap/infra/embedding` | `packages/infra/src/embedding/` | `createFallbackEmbedding`、`embedWithFallback`（384 维确定性回退） |
| `@trapmap/infra/go-accelerator/*.js` | `packages/infra/src/go-accelerator/` | 加速器相关导出 |

```ts
import { formatVectorLiteral, appendTeamFilter } from '@trapmap/infra';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/lib` | `createDeterministicFallbackVector`、`sha256` 等纯函数 |
| `@trapmap/contracts` | `ExperienceGene` 等共享类型 |
| `build` / `typecheck` | `tsc -p tsconfig.json` 编译 / 校验 |
| `test` | 包单元测试 |

子路径导入后缀以 `packages/infra/package.json` 的 exports 映射为准，取用前你亲自核对，未知/待确认（2026-09-08）。
