# 检索

在进行 TrapMap 规划和实现之前，使用检索作为硬性门控。目标不是加载所有内容；而是选择一个小规模的控制集。

## CLI 调用

优先使用内置二进制：

```bash
trapmap <command> [options]
```

在此 monorepo 中，当未安装二进制时使用 dev 模式：

```bash
pnpm --filter @trapmap/cli dev -- <command> [options]
```

`--` 分隔符是必需的，以便 pnpm 将参数转发给 CLI 脚本。

## 认证预检

如果检索状态不确定，运行：

```bash
trapmap session --json
```

如果未认证，请用户提供适当的访问密钥/服务器详情，或报告 TrapMap 检索被阻塞。不要伪造空结果。

## 先技能后规划

在形成计划之前运行此命令：

```bash
trapmap skill search-by-content "<任务或领域种子>" --max-results 5 --json
```

`skill search-by-content` 支持 `--max-results` 和 `--json`。不要在此命令中添加 trap 搜索标志。

选择前 1-3 个直接相关的匹配。将较弱的匹配放入引用或忽略它们。

## 先实现后检索

在规划之后、代码更改之前运行此命令：

```bash
trapmap search "<计划的实现区域或风险种子>" --scope project --mode graph-assisted --max-results 5 --json
```

有用的 `search` 标志包括 `--label`、`--scope`、`--mode semantic|hybrid|graph-assisted`、`--v2`、`--summary`、`--stdin` 和 `--no-refinement`。

当你需要胶囊原生输出或激活提示时使用 `--v2`：

```bash
trapmap search "<计划的实现区域或风险种子>" --scope project --v2 --max-results 5 --json
```

## 代理上下文加载

使用 `load` 获取预格式化的代理可用上下文（包含路由、计划和技能部分的 Markdown）：

```bash
trapmap load "<种子>" --scope project --json
```

`load` 标志：`--scope`、`--label`（可重复）、`--skill-budget`、`--max-depth`、`--fallback`、`--stdin`、`--json`。

默认输出是包装在 `<!-- trapmap-load-context -->` 标记中的 Markdown。使用 `--json` 获取原始结构化数据。

## 陷阱优先选择

按以下顺序编译结果：

1. 阻塞的陷阱和硬性约束。
2. 直接缓解这些陷阱的技能/胶囊。
3. 验证命令或可观察的确认。
4. 额外的匹配仅作为引用。

如果陷阱与技能冲突，在计划明确缓解之前，陷阱优先。

如果命令或标志不确定，运行：

```bash
trapmap --help
trapmap <command> --help
```
