# Go Accelerator Service

> 状态：Active。退役时间线以 `services/go-accelerator/DEPRECATED.md` 为准。

## 启用条件

- `TRAPMAP_DEPLOYMENT_PROFILE=distributed`（或 gateway 形态的 RUNTIME_MODE=api）
- `TRAPMAP_GO_ACCELERATOR_ENABLED=true`
- `TRAPMAP_GO_ACCELERATOR_URL` 缺省 `http://localhost:4100`（本地）或 `http://go-accelerator:4100`（容器 distributed，`docker-compose.yml:582`）

关闭时（缺省，且 host-local 下恒关闭）全部调用回落到 `@trapmap/lib` 与 `backend-core` 领域纯函数的 JS 实现。

## 架构

```text
[host-distributed gateway/services] --HTTP--> [go-accelerator :4100]
                                           fallback: JS in infra/go-accelerator/fallback.ts
```

单个 Go 二进制，chi 路由，无状态，可水平扩展。各 handler 并发安全，批量端点摊薄 HTTP 开销。无 DB 访问，只做纯计算；embedding 提供商调用留在 Node 侧。

## 端点

现行与退役端点注册以 `services/go-accelerator` 内 handler 与 `services/knowledge-read-go/internal/api/router.go` 为准，退役状态见 `services/go-accelerator/DEPRECATED.md`。

退役中（`services/go-accelerator/DEPRECATED.md` 称仍服务但带 `X-Deprecated: use knowledge-read-go` 头并记 `WARN deprecated`；本页旧文称 410 Gone，两处不一致，标未知/待确认（2026-09-08），以 DEPRECATED.md 为准）：

- `POST /v1/retrieval/ranking-batch` → `knowledge-read-go/internal/ranking`（`merge/rerank/boundary`）
- `POST /v1/retrieval/keyword-score` → `knowledge-read-go/internal/recall/service/keyword.go`
- `POST /v1/retrieval/score` → 410 或退役头（同上，未知/待确认（2026-09-08））

保留：`hash / vector / tokenize / dedup / gene-select`（纯计算、无 DB）。`knowledge-read-go` 经绞杀器 `TRAPMAP_READ_IMPL=off|shadow|dual|go` 按需接管读路径 `query→recall→ranking→assembly` 同进程闭环；新读服务 `services/knowledge-read-go :4101`，契约见 `packages/contracts/src/domain/knowledge-read-go.ts`。

## 一致性

Go 实现与 JS 对应实现逐字节对齐（hash 与 canonical JSON 同 payload 必同值），`go test` 与 infra fallback vitest 双侧验证。

## 类型对齐（SSOT：contracts Zod）

- SSOT：`packages/contracts/src/domain/go-accelerator.ts`（Zod）
- 生成：`z.toJSONSchema()`（Zod 4）→ `contracts/json-schema/go-accelerator/*.json`（draft 2020-12）→ `pkg/api/types.go`（`json.RawMessage` 承载 `payload`）
- 门禁：`pnpm generate:contracts` / `pnpm generate:contracts:check` + `pnpm check:go-contract`

## 部署与观测

- `services/go-accelerator/Dockerfile` 多阶段构建；`docker-compose.yml:582` 以 `distributed` profile 挂载，wget 健康检查。
- 类型化客户端：`packages/infra/src/go-accelerator/client.ts`（带超时与回退；路径未在本轮实测，标未知/待确认（2026-09-08））。
- 日志经 `middleware/logging.go` 结构化输出；网关健康聚合见 [服务发现架构](SERVICE-DISCOVERY.md)。

## 附录：Go 技术栈（源自 GO_TECH_STACK.md，本页为唯一生效位）

工具链为 Go `1.23`（`services/knowledge-read-go/go.mod:3`）加 `golangci-lint`。依赖版本表只在各 `services/*/go.mod` 中维护，本页不复述；手搓关键路径禁入。

防大文件：单文件 `≤300` 行，`≤400` 硬失败；单模块 `≤600` 行且不超模块总量 `30%`。`ranking.go 393` 反模式已拆为 `services/knowledge-read-go/internal/ranking/domain/{merge,rerank,boundary}.go`（已完成并归档（2026-09-01））。`cmd/server/main.go ≤150`。

文件布局：

```text
services/knowledge-read-go/internal/{api,query,recall,ranking,assembly,cache}/
  domain/*.go ≤150
  service/*.go ≤180
  port.go ≤50
```

命令（前置条件：容器外装 Go 1.23 工具链，Go 服务目录下执行）：

```bash
go vet ./...
go test ./... -count=1
golangci-lint run ./...
pnpm check:complexity
pnpm exec fallow audit --base main
```

## 常见用法

### 你在 Go 目录跑单测

前置条件：容器外装 Go 1.23 工具链；在 `services/knowledge-read-go` 下执行。

```bash
go test ./... -count=1
```

行数门禁见本页附录；退役状态以 `services/go-accelerator/DEPRECATED.md` 为准。

### 你跑 Go 契约对齐

前置条件：依赖已装；离线可跑。

```bash
pnpm check:go-contract
```

SSOT 是 `packages/contracts/src/domain/go-accelerator.ts`。

### 你校验契约产物同步

前置条件：依赖已装；离线可跑。

```bash
pnpm generate:contracts:check
```
