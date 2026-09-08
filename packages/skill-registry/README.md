# `@trapmap/skill-registry`

你用这个包管理 skill 的版本、历史与外部安装，它是 skill 的版本与包管理器。

## 入口

| 子路径 | 内容 |
| --- | --- |
| `@trapmap/skill-registry` | 主入口（adapters、domain、services 全量转出） |
| `@trapmap/skill-registry/cli` | CLI 装配 |
| `@trapmap/skill-registry/cli/add.js` | `trapmap skill add <source>` |
| `@trapmap/skill-registry/cli/search.js` | `--registry` 搜索 |

源码落点为 `packages/skill-registry/src/`（`adapters/` 含 `local`、`github`、`skills-sh`、`ai-pkgs-compat`；`domain/` 含 semver、history、diff、merge；`services/` 含 install、merge、registry、update）。本地锁文件为 `.trapmap/skills.lock`，清单为 `trapmap.skills.json`。

```bash
pnpm --filter @trapmap/cli dev -- skill add <source>
pnpm --filter @trapmap/cli dev -- skill search --registry <query>
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/contracts` | skill 契约类型 |
| `@trapmap/lib` | 纯函数工具 |
| `zod` | manifest 与 lockfile 校验 |
| `build` / `typecheck` | `tsc -p tsconfig.json` 编译 / 校验 |
| `test` | 包单元测试 |

完整设计另见 `docs/architecture/SKILL-REGISTRY.md`。
