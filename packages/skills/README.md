# TrapMap Skills

你用这个目录存放随仓发布的 agent skill 工件，它定义工作流门控与 CLI 索引。

## 入口

| Skill | 入口 | 加载时机 |
| --- | --- | --- |
| `workflow-with-trapmap` | `packages/skills/workflow-with-trapmap/SKILL.md` | 你规划或实施 TrapMap 相关任务前 |
| `trapmap-cli-usage-guide` | `packages/skills/trapmap-cli-usage-guide/SKILL.md` | 你需要确认命令签名、标志或命令族映射时 |

每个 skill 下设 `references/`（分阶段详细文档），`workflow-with-trapmap` 另带 `agents/`（智能体接口配置）。本目录无 `package.json`，无构建产物，不参与 workspace 依赖。

## 行为

`workflow-with-trapmap` 把检索、trap 优先规划、知识沉淀、反馈与衰减检查设为硬门控，`trapmap-cli-usage-guide` 只回答签名问题，不回答取舍问题。你先加载工作流 skill，需要精确语法时再加载 CLI 指南。

## 常见用法

本目录无 `package.json`，下面两条是文件级操作，不走 pnpm。

### 确认一条 CLI 签名

```bash
grep -n "<命令族>" packages/skills/trapmap-cli-usage-guide/SKILL.md | head -10
```

你把 `<命令族>` 换成 `knowledge`、`retrieval` 等，先看索引命中再进 `references/` 读细节。

### 看工作流门控清单

```bash
ls packages/skills/workflow-with-trapmap/references/
ls packages/skills/workflow-with-trapmap/agents/
```

你规划 TrapMap 相关任务前先扫一遍目录名，缺哪个阶段就读哪个文件。
