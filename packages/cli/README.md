# TrapMap CLI

Commander.js 命令行客户端，用于与 TrapMap API 交互。

## 入口

- `src/index.ts` — CLI 入口点

## 目录结构

- `src/commands/` — CLI 命令定义
- `src/lib/` — CLI 辅助工具（配置、HTTP、输出格式化等）

## 内部导航

- 命令入口：[`src/commands/`](src/commands/)
- 辅助工具：[`src/lib/`](src/lib/)

## 配置

CLI 状态文件存储在 `~/.trapmap/cli.json`。若 `os.homedir()` 不可用时，会退回到系统临时目录。配置文件支持以下输出配置（`outputProfile` 字段）：

`CliState` 还包含一个后端形态字段 `backendTarget`：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `backendTarget` | `"light" \| "heavy"` | `"light"` | 目标后端构建形态偏好；`light` 对应 `local-agent` / `team-monolith`，`heavy` 对应 `distributed` |

兼容迁移规则：

- 旧配置缺省 `backendTarget` 时按 `"light"` 解释。
- 非法值会被规范化回 `"light"`。
- 该字段不改变单一 `gatewayUrl`、认证模型或任何内部服务发现逻辑。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `tool` | `"claude-code" \| "codex" \| "opencode" \| "generic"` | `"generic"` | 目标渲染工具 |
| `modelHint` | `"claude" \| "gpt" \| "qwen" \| "generic"` | `"generic"` | 模型提示 |
| `renderMode` | `"text" \| "json"` | `"text"` | 渲染模式 |
| `graphPlanMode` | `"summary" \| "full" \| "skill-list"` | `"summary"` | 图计划渲染模式 |
| `verbosity` | `"compact" \| "balanced" \| "detailed"` | `"balanced"` | 输出详细程度 |
| `includeRawHints` | `boolean` | `true` | 是否包含原始提示 |

当配置文件中 `outputProfile` 值无效（空字符串、非对象等）时，会被规范化为 `undefined`，从而回退到传统格式化输出。未知的额外属性（如 `colorScheme`）会被过滤，不会泄露。

## JSON 行协议

通过 `--json` 参数或 `renderMode: "json"` 输出配置时，所有 JSON 输出均保证为**单行紧凑 JSON**（`JSON.stringify` 不带缩进），确保每行是一个独立、完整的 JSON 对象，便于逐行管道解析：

```bash
trapmap search "OAuth2" --json | while read line; do echo "$line" | jq '.results[0].title'; done
```

## 渲染器选择

输出渲染器根据 `outputProfile.tool` 选择：

| 工具 | 渲染方式 | 说明 |
|---|---|---|
| `generic` | 纯文本 | 传统人类可读格式 |
| `claude-code` | XML 标签 | `<trapmap_skill_pack>` 包裹结构 |
| `codex` | 紧凑 JSON | snake_case 键名 |
| `opencode` | Markdown | `# Header` / `- List` 格式 |

当 `tool` 值不在注册表中时，自动回退到 `generic` 渲染器。当 `kind` 不匹配时，回退到通用输出。渲染失败时回退到传统格式化函数，不会抛出异常。
