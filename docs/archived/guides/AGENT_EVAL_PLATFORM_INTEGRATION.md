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

## 本地 Docker Compose 真实目标

当前 checked-in 的复跑路径是：使用 Langfuse 官方 `docker-compose.yml` 在本机起一个临时 self-host 实例，再把生成的 project keys 注入 TrapMap eval runner。

最小步骤：

```bash
git clone --depth=1 https://github.com/langfuse/langfuse.git /tmp/langfuse-closeout
cd /tmp/langfuse-closeout
```

1. 准备一份未入库的本地 env 文件，至少提供 `NEXTAUTH_SECRET`、`SALT`、`ENCRYPTION_KEY`、`POSTGRES_PASSWORD`、`MINIO_ROOT_PASSWORD` 与 `LANGFUSE_INIT_*`。
2. 若启用了 headless init，设置：
   - `LANGFUSE_INIT_ORG_ID`
   - `LANGFUSE_INIT_PROJECT_ID`
   - `LANGFUSE_INIT_PROJECT_PUBLIC_KEY`
   - `LANGFUSE_INIT_PROJECT_SECRET_KEY`
   - 可选 `LANGFUSE_INIT_USER_*`
3. 若覆盖了 `MINIO_ROOT_PASSWORD`，必须同步设置：
   - `LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY`
   - `LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY`
   - `LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY`
   以上三项都要与 `MINIO_ROOT_PASSWORD` 相同；否则 Langfuse 可能在 API 健康正常时仍在服务端日志中报 `SignatureDoesNotMatch`。
4. 启动官方 compose：

```bash
docker compose --env-file ./.env.closeout -f ./docker-compose.yml up -d
curl http://127.0.0.1:3000/api/public/health
```

health 返回 `{"status":"OK",...}` 后，再把 `LANGFUSE_BASE_URL=http://127.0.0.1:3000` 与生成的 project keys 注入 TrapMap。

## Live Validation Evidence

配置齐全并显式启用 `--platform langfuse` 时，aggregate runner 现在会输出三类可审计证据：

- `enabled`：`[eval-platform] langfuse adapter enabled: baseUrl=... flushTimeoutMs=...`
- `publish success`：`[eval-platform] langfuse adapter mirrored <N> suite events without publish warnings.`
- `flush success`：`[eval-platform] langfuse adapter flush completed without close warnings.`

若 publish 或 close 出现 warning-only fallback，runner 不会打印上述 success 行，而是继续输出现有 warning。TrapMap native report 仍是唯一 truth source；Langfuse mirror 只用于外部观测，不参与通过判定。

## 当前 closeout 状态

- 代码侧 closeout 已完成到“三个 suite 都由 owner 产出 platform events，aggregate runner 只负责发布”。
- live Langfuse closeout 已于 2026-07-07 23:24-23:25 CST 完成，目标是本地 Docker Compose 启动的官方 Langfuse v3 实例：`http://127.0.0.1:3000`。
- 同轮先执行 `printenv LANGFUSE_BASE_URL LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY TRAPMAP_EVAL_PLATFORM_FLUSH_TIMEOUT_MS`，确认当前 shell 中四项变量均非空。
- 随后执行 `pnpm eval -- smoke --platform langfuse`；runner 输出了三条 success evidence：
  - `[eval-platform] langfuse adapter enabled: baseUrl=http://127.0.0.1:3000 flushTimeoutMs=5000.`
  - `[eval-platform] langfuse adapter mirrored 1041 suite events without publish warnings.`
  - `[eval-platform] langfuse adapter flush completed without close warnings.`
- 同一轮 native TrapMap smoke 仍以 `81/81 passed` 成功结束；随后补跑 `pnpm eval:smoke` 也仍以 `81/81 passed` 结束，说明启用外部平台没有改变 TrapMap 自身退出语义。
- 额外复核：使用同一组 project keys 调 `GET /api/public/traces?limit=1` 已能读到 project trace 数据，说明这次不是“runner 侧假成功、服务端未落地”。
- 当前 active closeout 已完成；该主线只剩 `MLflow` 等 deferred follow-up，不再保留 environment-blocked 状态。
- `MLflow` 与第二平台切换验证仍属 deferred，不在当前 active closeout 范围内。

## 失败语义

- 缺少配置时，不会创建 `LangfuseAdapter`，runner 只打印 warning。
- 发布期间发生鉴权失败、网络错误或平台写入异常时，runner 只打印 warning。
- close/shutdown flush 超时时，runner 只打印 warning。
- 本地 self-host 目标若 health 正常但 Langfuse 服务端日志出现 `SignatureDoesNotMatch` / `Failed to upload event to S3`，优先检查 `MINIO_ROOT_PASSWORD` 与 `LANGFUSE_S3_*_SECRET_ACCESS_KEY` 是否对齐；这属于目标环境配置错误，不是 TrapMap adapter 契约错误。
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
