# TrapMap 灵活构建部署总入口

> 根 `plan.md` 是当前“灵活构建部署 + CLI 接入 + 重后端微服务化”工作的总入口。具体实施细则拆分到 `docs/plans/deployment-flexibility/`。

**背景：** TrapMap 现有后端已经具备 `runtimeMode`、`serviceUnit`、PostgreSQL queue/outbox、CLI + HTTP API、可选 RabbitMQ task transport 等基础能力，但当前主叙事仍然以模块化单体为中心，尚未把“轻量本地服务”和“支持多用户的重后端”收敛成同一套明确的部署/构建模型。

**总需求：** 让项目能够在以下三种目标形态之间有意识地切换，并保持共享 core、统一 CLI 接入和清晰文档/测试约束：

1. `local-agent`
   面向单用户、轻量本地服务，保留 retrieval-first 的最小能力面。
2. `team-monolith`
   面向小团队或单实例部署，保留完整 HTTP API 和 PostgreSQL 主路径。
3. `distributed`
   面向多用户重后端，通过 gateway + 多服务/多 worker 运行，逐步引入微服务化部署。

**开发要求：**

- 不做 MCP 协议；CLI 仍是正式接入面。
- CLI 默认且优先只连接统一 gateway，不直接感知后端微服务拆分。
- 第一阶段允许共享 PostgreSQL，不要求一开始就拆库。
- 新能力必须优先复用现有 `repos`、application service、queue/outbox、runtime seams，而不是平行实现第二套逻辑。
- 每个子计划都必须同步写明：
  - 代码改动范围
  - 需要更新的文档
  - 需要补充或调整的测试
  - 兼容性/回滚边界

---

## 计划结构

### P0. 基线与约束

- [`docs/plans/deployment-flexibility/00-baseline-and-constraints.md`](./docs/plans/deployment-flexibility/00-baseline-and-constraints.md)

用途：
- 冻结术语、目标部署形态、非目标和兼容边界。
- 明确哪些现有 runtime / transport / store 能力要保留，哪些旧叙事需要修订。

### P1. Profile 与 Capability 模型

- [`docs/plans/deployment-flexibility/01-profile-and-capability-model.md`](./docs/plans/deployment-flexibility/01-profile-and-capability-model.md)

用途：
- 定义 `local-agent` / `team-monolith` / `distributed` 三类 deployment profile。
- 把当前 `runtimeMode + serviceUnit + deployment preset` 升级为一套可解释的 capability matrix。

### P2. Gateway 与 CLI 接入收敛

- [`docs/plans/deployment-flexibility/02-gateway-and-cli-integration.md`](./docs/plans/deployment-flexibility/02-gateway-and-cli-integration.md)

用途：
- 明确 CLI 始终只连接 gateway。
- 定义 gateway 对外 API、内部路由责任，以及轻量模式与重后端的对外一致性要求。

### P3. 重后端微服务化拆分

- [`docs/plans/deployment-flexibility/03-distributed-service-topology.md`](./docs/plans/deployment-flexibility/03-distributed-service-topology.md)

用途：
- 规划 `distributed` 形态下的 gateway / retrieval / candidate ingestion / governance / outbox 等服务拓扑。
- 明确第一阶段共享 PostgreSQL、后续再评估更强隔离。

### P4. 构建、部署、文档与测试收敛

- [`docs/plans/deployment-flexibility/04-build-deploy-docs-and-tests.md`](./docs/plans/deployment-flexibility/04-build-deploy-docs-and-tests.md)

用途：
- 收敛 pnpm scripts、环境变量、docker compose/profile、文档索引和测试矩阵。
- 保证实现完成后，仓库的 README / DEPLOYMENT / PACKAGES / TESTING 不会继续讲旧故事。

---

## 全局完成标准

- [ ] 仓库存在统一的 deployment profile 词汇，不再仅靠零散 env/worker 模式描述部署形态。
- [ ] `local-agent`、`team-monolith`、`distributed` 三种目标形态在代码、文档、测试里都有一致定义。
- [ ] CLI 对后端的正式接入模型固定为 `gateway only`。
- [ ] 重后端微服务化的第一阶段服务边界、共享基础设施和非目标写入正式文档。
- [ ] 构建/部署脚本、docker compose、环境变量示例与架构文档一致。
- [ ] 相关测试覆盖 config/profile 解析、runtime ownership、route exposure、CLI 接入和部署 smoke。

## 执行顺序

建议按以下顺序推进：

1. `00-baseline-and-constraints.md`
2. `01-profile-and-capability-model.md`
3. `02-gateway-and-cli-integration.md`
4. `03-distributed-service-topology.md`
5. `04-build-deploy-docs-and-tests.md`

如果实现中发现子计划需要进一步拆分，新增文件放在同目录下，并在本入口追加链接。

## 现有事实入口

- 架构入口：[`architecture.md`](./architecture.md)
- 包职责：[`docs/PACKAGES.md`](./docs/PACKAGES.md)
- 部署文档：[`docs/architecture/DEPLOYMENT.md`](./docs/architecture/DEPLOYMENT.md)
- 代码现状：
  - [`packages/server/src/app.ts`](./packages/server/src/app.ts)
  - [`packages/server/src/lib/runtime/deployment-preset.ts`](./packages/server/src/lib/runtime/deployment-preset.ts)
  - [`packages/server/src/lib/runtime/runtime-contract.ts`](./packages/server/src/lib/runtime/runtime-contract.ts)
  - [`packages/server/src/lib/runtime/service-unit.ts`](./packages/server/src/lib/runtime/service-unit.ts)
  - [`packages/cli/src/index.ts`](./packages/cli/src/index.ts)
  - [`packages/cli/src/lib/http.ts`](./packages/cli/src/lib/http.ts)

## 归档说明

此前根 `plan.md` 聚焦“后端工程化总规约”，现已被本入口取代。若后续仍需保留旧版叙事，应归档到 `docs/archived/archived-plans/`，而不是在根目录并存多个计划入口。
