# Agent Eval Platform Integration

本文档说明如何为 TrapMap aggregate eval runner 启用外部平台 mirror，以及失败时会发生什么。

## 启用方式

当前只支持 aggregate suite：

```bash
pnpm eval -- smoke --platform langfuse
pnpm eval -- core --platform langfuse
pnpm eval -- all --tier core --platform langfuse
```

启用 `langfuse` 前，至少配置：

```bash
export LANGFUSE_BASE_URL=https://langfuse.example
export LANGFUSE_PUBLIC_KEY=pk-...
export LANGFUSE_SECRET_KEY=sk-...
```

可选：

```bash
export TRAPMAP_EVAL_PLATFORM_FLUSH_TIMEOUT_MS=5000
```

当前 `agent-planning` 是首条 closeout 过的 suite-owned 事件流。aggregate runner 会消费 suite 导出的 platform events，并把它们 mirror 到 Langfuse；TrapMap native JSON report 继续是唯一 truth source。

## 失败语义

- 缺少配置时，不会创建 `LangfuseAdapter`，runner 只打印 warning。
- 发布期间发生鉴权失败、网络错误或平台写入异常时，runner 只打印 warning。
- close/shutdown flush 超时时，runner 只打印 warning。
- 上述失败都不会改变 eval 退出码，也不会替代 TrapMap 原生终端输出或 JSON report。

## 关闭与回退

关闭外部平台 mirror：

```bash
pnpm eval -- smoke
```

回退到本地 archive mirror：

```bash
pnpm eval -- smoke --platform json-archive --platform-output-dir ./reports/platform-events
```

`json-archive` 仍然遵循同一套 unified platform event schema，但输出落在本地文件，而不是外部平台。
