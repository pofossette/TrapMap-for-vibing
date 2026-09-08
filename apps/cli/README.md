# `@trapmap/cli`

你用这个包操作 TrapMap，`trapmap` 二进制是唯一稳定的人机入口。

## 入口

主入口为 `apps/cli/src/index.ts`，`bin` 把 `trapmap` 指向 `./dist/index.js`，命令按族注册在 `apps/cli/src/commands/` 下，共享逻辑落在 `apps/cli/src/lib/`，测试夹具见 `apps/cli/src/testing/`。

| 命令族 | 来源 |
| --- | --- |
| `audit` | `apps/cli/src/commands/audit.ts` |
| `auth` | `apps/cli/src/commands/auth.ts` |
| `cron` | `apps/cli/src/commands/cron.ts` |
| `decay` | `apps/cli/src/commands/decay.ts` |
| `evidence` | `apps/cli/src/commands/evidence.ts` |
| `feedback` | `apps/cli/src/commands/feedback.ts`、`feedback-admin.ts` |
| `knowledge` | `apps/cli/src/commands/knowledge.ts` |
| `load` | `apps/cli/src/commands/load.ts` |
| `maintenance` | `apps/cli/src/commands/maintenance.ts` |

仓库内无内置二进制时，你用 `pnpm --filter @trapmap/cli dev -- <command>` 代替 `trapmap`。

```bash
pnpm --filter @trapmap/cli dev -- --help
pnpm --filter @trapmap/cli build
pnpm --filter @trapmap/cli typecheck
pnpm --filter @trapmap/cli test
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `commander` | 命令行解析与子命令分发 |
| `@inquirer/prompts` | 交互式输入 |
| `zod` | 输入校验 |
| `@trapmap/client-core` | 网关传输 |
| `@trapmap/contracts` | 共享契约类型 |
| `@trapmap/lib` | 纯函数工具 |
| `@trapmap/skill-registry` | skill 安装与版本管理命令 |
| `dev` | `tsx src/index.ts` 本地运行 |
| `build` / `typecheck` | `tsc -p tsconfig.json` 编译 / 校验 |
| `test` | `vitest run --passWithNoTests` |

命令签名细节由 `packages/skills/trapmap-cli-usage-guide/SKILL.md` 承载，工作流取舍由 `packages/skills/workflow-with-trapmap/SKILL.md` 承载。
