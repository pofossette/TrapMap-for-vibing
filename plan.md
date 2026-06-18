# TrapMap 灵活构建部署总入口

> 根 `plan.md` 是当前“灵活构建部署 + CLI 接入 + 重后端微服务化”工作的总审计入口。具体实施细则拆分到 `docs/plans/deployment-flexibility/`，本文件负责统一状态、依赖、偏移和缺漏项。

**背景：** TrapMap 后端已经不再只是“为未来拆分预留 runtime seam”。当前仓库已出现一批实际落地：

- server runtime 已有正式 `deployment profile` 词汇：`local-agent`、`team-monolith`、`distributed`
- `deployment preset` 已退回兼容输入，解析后统一收敛到 `profile + runtimeMode + serviceUnit + capabilities`
- CLI 正式接入模型已收敛为 `gateway only`
- README / docs / runtime metadata / route surface / compose / scripts 已在推进同一条部署叙事

**总需求：** 在以下三种目标形态之间保持统一 core、统一 CLI 接入、统一文档和测试约束，并把“已经落地的部分”和“仍待完成的部分”明确分开：

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

## 本次总审计结论

### 已确认落地

- `P1 Profile 与 Capability 模型` 已不再是纯计划项，仓库已有实装痕迹：
  - README / docs / architecture 已写入 `local-agent`、`team-monolith`、`distributed`
  - server runtime 已存在 `ResolvedRuntimeDeployment` 叙事与 capability 驱动的 route surface
  - runtime metadata / readiness 已开始表达 profile 与 topology 信息
- `P2 Gateway 与 CLI 接入收敛` 也已部分完成：
  - CLI 配置层已收敛为单一 gateway URL，并兼容旧 `serverUrl`
  - 文档已把 `gateway only` 写成正式约束
- `P4 构建、部署、文档与测试收敛` 已进入落地中：
  - 根 README / docs/README / DEPLOYMENT / package scripts / compose 已有对应改动

### 仍需继续收口

- `P0` 仍需作为术语与边界的基线文档保留，但不应继续暗示“profile 尚未进入代码”。
- `P3` 仍是当前最主要的未完全收敛项：
  - distributed 服务边界虽已进入 metadata/test 叙事，但 retrieval / gateway / governance / outbox 的代码级边界与验证矩阵仍需继续固化。
- `P4` 需要补齐“实现完成后的最小验证闭环”，避免只改文档和脚本、不固化测试入口。

### 本文件修复的偏移

- 修复“计划仍假设 profile 只是未来目标”的偏移。
- 修复“CLI 仍接近单 gateway”这一过时表述，改为“gateway only 已是正式模型”。
- 修复“README / DEPLOYMENT 仍主要讲旧故事”的偏移；这些文件当前已在改动中，不应继续在总计划中按旧状态描述。

### 本文件补齐的缺漏

- 为各子计划增加状态语义，避免根入口只列链接、不说明哪些已经实现。
- 补齐跨子计划依赖关系，避免 P3/P4 重复定义 P1/P2 已确定事实。
- 补齐总体验证要求，明确计划完成不等于仅有文档更新。

---

## 计划结构

### P0. 基线与约束

- 状态：`active`
- 文件：[`docs/plans/deployment-flexibility/00-baseline-and-constraints.md`](./docs/plans/deployment-flexibility/00-baseline-and-constraints.md)

用途：
- 冻结术语、目标部署形态、非目标和兼容边界。
- 为后续子计划提供统一词汇，避免重新发明 `profile / preset / runtimeMode / serviceUnit / capability / topology`。

审计要求：
- 该文件必须承认 `deployment profile` 已进入当前代码与文档事实层。
- 不再使用“CLI 仍基于 `serverUrl` 单点接入”这类过时表述；应改成 `gatewayUrl` 为正式词汇，`serverUrl` 仅为兼容读取。

### P1. Profile 与 Capability 模型

- 状态：`partially landed`
- 文件：[`docs/plans/deployment-flexibility/01-profile-and-capability-model.md`](./docs/plans/deployment-flexibility/01-profile-and-capability-model.md)

用途：
- 定义 `local-agent` / `team-monolith` / `distributed` 三类 deployment profile。
- 把当前 `runtimeMode + serviceUnit + deployment preset` 升级为一套可解释的 capability matrix。

审计要求：
- 该文件中的“目标模型”可以保留，但必须显式区分：
  - 已落地：统一解析、capability 驱动 route surface、metadata/readiness
  - 未落地：剩余 boot strategy、边界清理、测试收口
- 不应继续把已实现项表述成纯设计提案。

### P2. Gateway 与 CLI 接入收敛

- 状态：`largely landed`
- 文件：[`docs/plans/deployment-flexibility/02-gateway-and-cli-integration.md`](./docs/plans/deployment-flexibility/02-gateway-and-cli-integration.md)

用途：
- 明确 CLI 始终只连接 gateway。
- 定义 gateway 对外 API、内部路由责任，以及轻量模式与重后端的对外一致性要求。

审计要求：
- 该文件应把“gateway-only 已成立”写成当前事实，而不是待决定方向。
- 后续重点转为：
  - 本地裁剪路由时的 capability/error 语义
  - CLI 关键命令回归测试
  - 文档中彻底移除多 URL 想象空间

### P3. 重后端微服务化拆分

- 状态：`active`
- 文件：[`docs/plans/deployment-flexibility/03-distributed-service-topology.md`](./docs/plans/deployment-flexibility/03-distributed-service-topology.md)

用途：
- 规划 `distributed` 形态下的 gateway / retrieval / candidate ingestion / governance / outbox 等服务拓扑。
- 明确第一阶段共享 PostgreSQL、后续再评估更强隔离。

审计要求：
- 该文件是当前主增量区域，需避免与 P1 重复定义 profile/capability。
- 应把重点收敛到：
  - service identity / topology metadata
  - route ownership 与 worker ownership 的代码映射
  - distributed readiness / health / smoke matrix

### P4. 构建、部署、文档与测试收敛

- 状态：`active`
- 文件：[`docs/plans/deployment-flexibility/04-build-deploy-docs-and-tests.md`](./docs/plans/deployment-flexibility/04-build-deploy-docs-and-tests.md)

用途：
- 收敛 pnpm scripts、环境变量、docker compose/profile、文档索引和测试矩阵。
- 保证实现完成后，仓库的 README / DEPLOYMENT / PACKAGES / TESTING 不会继续讲旧故事。

审计要求：
- 该文件要承认 README / docs / compose / scripts 已存在在途改动。
- 重点应从“是否命名 profile 脚本”转为“脚本、env、compose、文档、测试是否完全对齐”。

---

## 跨计划依赖

- `P0 -> P1/P2/P3/P4`
  - P0 只负责冻结词汇和边界，不重复承载实现细节。
- `P1 -> P2/P3/P4`
  - P2 的 gateway-only 约束和 P3 的 topology metadata 都应复用 P1 的 profile/capability 事实源。
- `P2 -> P4`
  - CLI 接入模型一旦固定，P4 的脚本、README、部署文档、smoke 测试都必须围绕单 gateway 入口展开。
- `P3 -> P4`
  - 只有当 distributed 拓扑边界写清楚后，compose profile、部署示例和 smoke matrix 才能真正定稿。

---

## 全局完成标准

- [x] 仓库存在统一的 deployment profile 词汇，不再仅靠零散 env/worker 模式描述部署形态。
- [x] CLI 对后端的正式接入模型固定为 `gateway only`。
- [x] `local-agent`、`team-monolith`、`distributed` 三种目标形态已进入代码和文档词汇层。
- [ ] 三种形态在代码、文档、测试里的能力边界完全一致，没有残留旧叙事。
- [ ] distributed 第一阶段服务边界、共享基础设施和非目标在实现与文档中都完全闭环。
- [ ] 构建/部署脚本、docker compose、环境变量示例与架构文档完全一致。
- [ ] 相关测试覆盖 config/profile 解析、runtime ownership、route exposure、CLI 接入和部署 smoke。

## 当前缺口清单

- `P0` 文案仍含旧事实：
  - CLI 仍写作 `serverUrl`
  - 部署文档仍被描述为 `monolith / split-pg / split-rabbitmq` 主叙事
- `P1` 文档状态已比根入口更超前，但仍缺统一“已落地/待落地”分界。
- `P3` 缺少显式引用当前已出现的 topology 代码入口：
  - `packages/server/src/lib/runtime/service-topology.ts`
  - `packages/server/src/lib/runtime/service-topology.test.ts`
- `P4` 缺少“最小必跑命令”的正式总表，根入口应要求最终至少回填到 `docs/operations/TESTING.md`。

## 执行顺序

建议按以下顺序推进剩余工作：

1. 修正 `00-baseline-and-constraints.md` 的过时事实表述
2. 收口 `03-distributed-service-topology.md` 的代码映射与边界定义
3. 收口 `04-build-deploy-docs-and-tests.md` 的脚本、compose、env、测试闭环
4. 回头对 `01`、`02` 做状态性整理，避免继续把已完成事项写成未来计划

如果实现中发现子计划需要进一步拆分，新增文件放在同目录下，并在本入口追加链接与状态。

## 现有事实入口

- 架构入口：[`architecture.md`](./architecture.md)
- 包职责：[`docs/PACKAGES.md`](./docs/PACKAGES.md)
- 部署文档：[`docs/architecture/DEPLOYMENT.md`](./docs/architecture/DEPLOYMENT.md)
- 测试文档：[`docs/operations/TESTING.md`](./docs/operations/TESTING.md)
- 代码现状：
  - [`packages/server/src/app.ts`](./packages/server/src/app.ts)
  - [`packages/server/src/lib/runtime/deployment-profile.ts`](./packages/server/src/lib/runtime/deployment-profile.ts)
  - [`packages/server/src/lib/runtime/deployment-preset.ts`](./packages/server/src/lib/runtime/deployment-preset.ts)
  - [`packages/server/src/lib/runtime/runtime-metadata.ts`](./packages/server/src/lib/runtime/runtime-metadata.ts)
  - [`packages/server/src/lib/runtime/http-surface.ts`](./packages/server/src/lib/runtime/http-surface.ts)
  - [`packages/server/src/lib/runtime/service-topology.ts`](./packages/server/src/lib/runtime/service-topology.ts)
  - [`packages/cli/src/index.ts`](./packages/cli/src/index.ts)
  - [`packages/cli/src/lib/http.ts`](./packages/cli/src/lib/http.ts)
  - [`packages/cli/src/lib/config.ts`](./packages/cli/src/lib/config.ts)

## 归档说明

此前根 `plan.md` 更接近“未来部署规划入口”，现在改为“总审计入口”。后续若某一阶段已经彻底落定，应把过时叙事归档到 `docs/archived/archived-plans/`，而不是继续让根入口同时承担旧计划和现状描述。
