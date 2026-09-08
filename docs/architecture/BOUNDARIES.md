# 架构边界守护

> 本文档是 TrapMap 项目架构边界检测的说明。边界规则的实施配置见仓库根目录 [`.fallowrc.json`](../../.fallowrc.json)，该文件是唯一生效源；下表镜像它。状态：Active。

## 工具

你用 [fallow](https://github.com/fallow-rs/fallow) 检查静态导入方向。fallow 只认 `.fallowrc.json` 的 `boundaries.zones` 与 `boundaries.rules`，本页文字不参与判定。

```bash
pnpm exec fallow audit --base main
```

## Zone 定义

项目共定义 18 个 zone：`contracts`、`lib`、`infra`、`db`、`client-core`、`ai-providers`、`backend-core`、`assembly`、`service-standard`、`service-knowledge-read`、`host-local`、`host-distributed`、`cli`、`web-panel`、`mcp`、`app-light`、`app-distributed`、`skill-registry`。路径模式与 allow 列表只在 [`.fallowrc.json`](../../.fallowrc.json)（`boundaries.zones` / `boundaries.rules`）中维护，本页不复述；你改配置后跑 `pnpm exec fallow audit --base main` 验证（核对日期见页尾）。

## 契约落点

跨包共享的判断契约固定在这三处，你不要在实现或装配处重定义：

- 端口接口：`packages/backend-core/src/ports/` 下 6 个 `<node>-ports.ts`（`intent-ports.ts`、`dedup-ports.ts`、`conflict-ports.ts`、`artifact-derivation-ports.ts`、`label-alignment-ports.ts`、`channel-merge-ports.ts`），零框架、零宿主依赖
- 节点配置 schema：`packages/contracts/src/domain/judgment.ts`
- 契约注册表：`packages/assembly/src/contracts/judgment-contracts.ts`（assembly zone 内，只依赖 cordis + zod），`verify` 要求约定的 cordis service 名、configSchema 与显式 topology（三者见该文件第 28-42 行）

## 依赖方向

- `contracts` 与 `client-core` 是叶子，你不要让它们导入其他 zone。
- `cli`、`web-panel`、`mcp` 只做客户端封装，不导入任何 `service-*` 或 `host-*` 包。
- 宿主包（`host-local`、`host-distributed`）是最高层组合根；`apps/light`、`apps/distributed` 只做 thin assembly，不新增业务逻辑。
- `assembly` 只做装配与校验（cordis Context 封装、能力节点注册表、生命周期与退出控制、startupChecks、拓扑与契约校验），不承载业务逻辑。
- `service-knowledge-read` 的历史 server 内部依赖是迁移债务，不是 zone 例外。

## 关键约束（压缩，OLD `git show ec0e4c99:docs/architecture/BOUNDARIES.md:51-311`）

> 唯一生效源是 `.fallowrc.json`；下表是其文字镜像，冲突时以配置文件为准。

| # | 约束 |
|---|---|
| 3 | `backend-core` 只依赖 `contracts` 与 `lib`（`.fallowrc.json` 的 allow 列表另有 `db` 但当前无消费方）。外部框架依赖（`fastify`、`@nestjs/*`）只允许出现在 `src/http/adapters/`（测试接缝 `src/testing/` 除外），不得扩散到 `domain/`、`application/`、`ports/`、`use-cases/`；`backend-core → lib` 仅限纯函数工具消费，不得引入框架。 |
| 5 | `cli` 与 `web-panel` 只依赖 `client-core`、`contracts`（`cli` 另可依赖 `lib`），不依赖任何服务端包；代码落点现为 `apps/cli/src/**`、`apps/web-panel/src/**`。`mcp` zone（`apps/mcp/src/**`）同属客户端封装层，只依赖 `client-core`、`contracts`、`lib`，禁止导入任何 `service-*` / `host-*` 包。 |
| 6 | 宿主包（`host-local`、`host-distributed`）是最高层组合根，可依赖所有下游 zone；可执行组装中心在 `apps/light`、`apps/distributed`，仅做 thin assembly，不得新增业务逻辑。 |
| 7 | `lib` 是共享工具叶子，type-only 依赖 `contracts`，不依赖任何服务 / 宿主 / 框架代码；`contracts` 不得反向依赖 `lib`。 |
| 8 | `ai-providers` 是独立 zone：作为共享 AI 服务层只依赖 `lib`（type-only 可依赖 `contracts`），被 `service-standard`、`service-knowledge-read` 与两个宿主消费；不得依赖任何服务 / 宿主包。 |

## 已知耦合 Category A–D（债务说明）

| Category | 位置 | 模式 | 状态（2026-09-08 代码核对） |
|---|---|---|---|
| A · 结构化 Store Pool 接缝（Medium） | `packages/host-local/src/nest/runtime/store-pool.ts`、`host-nodes.ts:76` | 以 `typeof store.getPool === 'function'` 结构探针取 `Pool`，替代 `instanceof PostgresStore` | 现行。`instanceof PostgresStore` 在生产路径已清零（已偿还）；结构性 `getPool` 探针仍在，长期应收敛为 port 级 pool 能力抽象。 |
| B · service-knowledge-read 深耦合（High） | `packages/service-knowledge-read/src/` | 历史上依赖已删共享包（`@trapmap/server` / `@trapmap/runtime-infra`）的 server 内部实现 | 已偿还。工作树内无对上述两包的生产导入；若再出现即为边界回归。 |
| C · Recall 通道直引 Drizzle schema（Low） | OLD 点名 `pg-keyword.ts` 与 capsule repositories | 热点检索路径为避抽象开销直查 schema，而非经 repository | 待确认。`pg-keyword.ts` 在现行 `service-knowledge-read/src/` 下已无此文件名（疑似迁入 `recall/`），需按现行 recall 文件逐个核对。 |
| D · Recall 内具体图后端工厂（Low） | `packages/service-knowledge-read/src/graph-query.ts:149`（`createMemoryGraphQueryBackend`，`index.ts:28` 重导出） | 无图后端配置时回落内存图，保证检索 fail-open 而非失败 | 现行。属有意设计，文档备查即可。 |

## 添加新 Zone

你在 `.fallowrc.json` 的 `boundaries.zones` 加条目，在 `boundaries.rules` 加 `from → allow`，再 Mirror 到上表。若新包需被宿主消费，你把 zone 名加入 `host-local` 与 `host-distributed` 的 allow 列表。

> 核对：上列 18 zone 名与 `.fallowrc.json` 一致（2026-09-08）。旧文案中的 14 zone 计数已作废。

## 常见用法

### 你跑边界审计

前置条件：依赖已装；`--base main` 需本地含 `main` 基准。

```bash
pnpm exec fallow audit --base main
```

唯一生效源是仓库根 `.fallowrc.json`。CI 口径用另一条命令：

```bash
pnpm check:fallow
```

### 你核对判断契约注册表

前置条件：离线可跑。

```bash
grep -n "id:" packages/assembly/src/contracts/judgment-contracts.ts
```

注册位置见本页「契约落点」节；descriptor 清单见 [TrapMap 架构](ARCHITECTURE.md)「有界上下文」节。
