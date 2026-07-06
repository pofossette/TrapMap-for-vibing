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

当前 `retrieval`、`summary`、`agent-planning` 都已改为 suite-owned platform event builder。aggregate runner 只消费 suite 导出的 platform events 并把它们 mirror 到 Langfuse；TrapMap native JSON report 继续是唯一 truth source。

## 当前 closeout 状态

- 代码侧 closeout 已完成到“三个 suite 都由 owner 产出 platform events，aggregate runner 只负责发布”。
- live Langfuse closeout 仍未完成。2026-07-06 11:35:08 CST 这次执行中，`LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY` 仍全为空，且仓库内没有 checked-in Langfuse deployment/config 可供对接。
- 因此当前只能把 `--platform langfuse` 的缺配置 warning 路径视为已验证；不能把本轮文档回写解释成真实平台联通已收口。
- `MLflow` 与第二平台切换验证仍属 deferred，不在当前 active closeout 范围内。

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
