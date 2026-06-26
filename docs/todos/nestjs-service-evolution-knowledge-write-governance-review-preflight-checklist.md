# 样板实施前检查表：Knowledge-Write + Governance-Review

## 角色

- 状态：`proposed`
- 目标：在开始代码迁移前，先确认 `knowledge-write + governance-review` 样板的边界、契约、现状证据和非目标

## 边界确认

- [ ] `governance-review` 只拥有治理命令，不拥有最终知识聚合写入
- [ ] `knowledge-write` 拥有最终知识聚合写入，不拥有治理命令流程判断
- [ ] `gateway` 只做对外入口与协议适配
- [ ] 任何跨服务直接读/写例外都已命名，不再允许隐含共享状态

## 当前代码入口核对

- [ ] [`packages/host-distributed/src/governance-review/server.ts`](../../packages/host-distributed/src/governance-review/server.ts)
- [ ] [`packages/host-distributed/src/governance-review/ports.ts`](../../packages/host-distributed/src/governance-review/ports.ts)
- [ ] [`packages/host-distributed/src/knowledge-write/server.ts`](../../packages/host-distributed/src/knowledge-write/server.ts)
- [ ] [`packages/service-governance-review/src/routes.ts`](../../packages/service-governance-review/src/routes.ts)
- [ ] [`packages/service-knowledge-write/src/routes.ts`](../../packages/service-knowledge-write/src/routes.ts)
- [ ] [`packages/backend-core/src/ports/internal-ports.ts`](../../packages/backend-core/src/ports/internal-ports.ts)

## Contract 核对

- [ ] `KnowledgeWritePort` 的治理命令调用面已经列清
- [ ] `governance-review -> knowledge-write` 的错误语义已列清
- [ ] `in-process` 与 `remote` adapter 将共享同一 contract
- [ ] request/trace 传播要求已列清

## 数据 owner 核对

- [ ] 哪些 repository / table 属于 `governance-review` 已列清
- [ ] 哪些 repository / table 属于 `knowledge-write` 已列清
- [ ] shared PostgreSQL 仅被视为共享实例，不再被视为共享真相边界
- [ ] 当前仍保留的跨服务读路径都已登记

## 运行时与测试前置条件

- [ ] distributed acceptance 相关测试入口已识别
- [ ] deployment/runtime smoke 相关测试入口已识别
- [ ] 与治理链路相关的 eval/smoke 触发条件已识别
- [ ] 文档回写目标文件已列清

## 非目标确认

- [ ] 本轮不同时成熟化 `knowledge-read`
- [ ] 本轮不同时成熟化 `candidate-ingestion`
- [ ] 本轮不把 `job-runtime` 做成首批业务样板
- [ ] 本轮不以拆库为前置条件

## 最小验证

- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 完成定义

- 样板迁移前的 owner、contract、数据边界、测试入口和非目标都已固定。
- 后续代码迁移不再需要边写边重新定义范围。
