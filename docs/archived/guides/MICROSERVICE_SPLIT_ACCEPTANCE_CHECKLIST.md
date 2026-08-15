# 微服务拆分验收清单

## 目的

本清单只回答一个问题：

**当前仓库是否已经具备开始物理拆分微服务的条件。**

只有当下面所有关卡都满足时，TrapMap 才能从“逻辑边界已冻结、distributed host 已存在”推进到“正式开始物理拆分与独立演进”。

## 适用范围

- 适用于 `distributed` profile
- 适用于 `packages/host-distributed`
- 适用于 candidate / review -> knowledge 写链路、read-side、runtime、auth、queue / outbox 一致性

## 前置事实

- `packages/server（Wave-10 已删除）` 是部分 compatibility shell：maintenance batch、decay batch 已降级为 compatibility-only；candidate apply-resolution、knowledge review 也已从默认 light 主线退役，只保留 retired compatibility 响应
- distributed authoritative write path 已迁移到 `packages/host-distributed`
- 第一阶段仍共享 PostgreSQL；本清单不要求数据库按服务拆分

权威参考：

- [微服务拆分就绪报告](../architecture/MICROSERVICE_SPLIT_READINESS_REPORT_2026-06-22.md)
- [运行时重组迁移指南](./MIGRATION_GUIDE.md)
- [系统权威事实源](../reference/SYSTEM_TRUTH_SOURCES.md)
- [部署指南](../architecture/DEPLOYMENT.md)

## 关卡 1：Server 兼容壳边界已冻结

必须满足：

- `packages/server（Wave-10 已删除）` 的 maintenance / decay 最终写路由统一返回 `501 capability_unsupported`
- candidate apply-resolution 与 knowledge review 若仍保留 compat 路由，必须被明确记录为 retired rollback-only surface，不能再写成默认入口例外
- `packages/server（Wave-10 已删除）` 仍保留 retrieval、status / readiness、必要读侧与迁移兼容面
- truth docs 明确写出 server 是 compatibility shell，而不是主写面

执行：

```bash
pnpm test:file -- packages/server（Wave-10 已删除）/src/routes/candidates.test.ts
pnpm test:file -- packages/server（Wave-10 已删除）/src/routes/review.test.ts
pnpm test:file -- packages/server（Wave-10 已删除）/src/routes/decay.test.ts
pnpm test:file -- packages/server（Wave-10 已删除）/src/routes/maintenance.test.ts
pnpm test:file -- packages/server（Wave-10 已删除）/src/app.test.ts
pnpm test:file -- packages/server（Wave-10 已删除）/src/__tests__/routes-architecture-guard.test.ts
pnpm --filter @trapmap/server build
pnpm typecheck
pnpm check:docs-drift
pnpm check:structure
```

通过标准：

- 所有命令退出码为 `0`
- maintenance / decay 写路由测试断言的是 `501 capability_unsupported`
- 若 candidate / review compat 路由仍保留，相关文档和计划必须把它们写成 retired rollback-only surface，而不是成功编排主路径
- 文档不再声称 `packages/server（Wave-10 已删除）` 仍是这些链路的 authoritative write surface

## 关卡 2：Distributed authoritative write path 真实闭环

必须满足：

- `gateway -> internal service -> knowledge-write` 的真实链路在多进程模式下可运行
- candidate resolution、review decision、maintenance batch、decay batch 都由 distributed host 承担 authoritative write
- 不存在 server fallback 或本地伪写路径

执行：

```bash
pnpm test:distributed-acceptance
pnpm test:deployment-smoke
pnpm test:runtime-foundations
```

如本轮同时变更 retrieval / governance eval 真实链路，再补：

```bash
pnpm eval:smoke
```

通过标准：

- `test:distributed-acceptance` 通过，并明确覆盖 `gateway -> internal service -> knowledge-write`、auth / header / error 语义、runtime / job-runtime ownership 证据
- `deployment-smoke` 和 `runtime-foundations` 全部通过
- 若本轮运行 `eval:smoke`，失败原因不能指向 distributed write path 未接管

## 关卡 3：Auth 与请求语义跨服务一致

必须满足：

- gateway 鉴权链路不依赖破坏性探针或本地捷径
- trace / request headers 可以跨 gateway 与内部服务透传
- timeout、非 `2xx` body、权限错误在 gateway 对外表现稳定

执行：

```bash
pnpm test:distributed-acceptance
pnpm test:deployment-smoke
```

通过标准：

- distributed gateway 的 auth contract、header 透传、`403/404/409/503/504` 失败语义都有 focused evidence
- session / permission / error mapping 在跨服务路径下与单体时期一致
- CLI 仍只连接 gateway，不要求用户理解内部服务拆分

## 关卡 4：Read-side 不再阻塞物理拆分

必须满足：

- `knowledge-read` 不再只是“临时直接读权威表”的未收口姿态
- review queue、decay entries / search、maintenance entries、retrieval read-side 的依赖边界明确
- 读侧可以解释自己的投影来源、刷新语义和一致性边界

执行：

```bash
pnpm test:runtime-foundations
pnpm eval:smoke
```

通过标准：

- 不再需要把 `knowledge-read` 的现状描述为“还不能拆的临时债务”
- read projection contract、freshness contract、fallback 语义都有代码和文档证据
- `GET /internal/knowledge-read/projection-status` 与 gateway 的 `GET /v1/knowledge/projection-status` 能区分 knowledge-read owned derived entry projections、derived retrieval / search / query-trace surfaces，以及不属于 `knowledge-read` 的 governance read surfaces

## 关卡 5：Job Runtime 已被证明能承接跨服务主路径

必须满足：

- queue / outbox / retry / reclaim / status 不是“存在实现”，而是“已被验证能服务 distributed 主路径”
- worker ownership、remote ownership、degraded / remote / running 语义稳定
- 没有必须依赖单进程偶然性的隐式行为

执行：

```bash
pnpm test:distributed-acceptance
pnpm test:runtime-foundations
pnpm test:deployment-smoke
pnpm test:runtime-closeout
```

通过标准：

- `test:distributed-acceptance` 至少证明一个 gateway 场景和一个 job-runtime ownership 场景
- `runtime-foundations` 继续证明 readiness / degraded / remote / running 语义
- `test:runtime-closeout` 通过，并用现有 `/v1/operations/status/async` contract 证明 queue / outbox reclaim、recent dead letters、recent failures、retry / dead-letter policy 对 operator 可见

## 关卡 6：Truth Docs 与执行入口一致

必须满足：

- 入口文档、migration guide、readiness report、truth source 叙事一致
- 不再存在“代码说已拆，文档说还没拆”或相反的双重叙事

执行：

```bash
pnpm check:docs-drift
pnpm check:structure
```

人工核对：

- [微服务拆分就绪报告](../architecture/MICROSERVICE_SPLIT_READINESS_REPORT_2026-06-22.md)
- [运行时重组迁移指南](./MIGRATION_GUIDE.md)
- [系统权威事实源](../reference/SYSTEM_TRUTH_SOURCES.md)
- [部署指南](../architecture/DEPLOYMENT.md)

通过标准：

- 所有 guard 通过
- 文档对“现在能否开始拆”的回答一致

## 最终判定模板

只有当以下复选框全部可勾选时，才允许进入“开始拆微服务”阶段：

- [ ] 关卡 1 通过：`packages/server（Wave-10 已删除）` compatibility shell 边界已冻结
- [x] 关卡 2 通过：distributed authoritative write path 多进程真实闭环成立
- [x] 关卡 3 通过：auth、header、timeout、error mapping 跨服务一致
- [x] 关卡 4 通过：`knowledge-read` 不再是阻塞物理拆分的临时债务
- [x] 关卡 5 通过：`job-runtime` 已被证明能承接跨服务主路径
- [x] 关卡 6 通过：truth docs、运行入口、验证命令叙事一致

## 当前状态记录模板

每次重新评估是否可开始拆分时，按下面模板追加一次记录：

```markdown
### 评估 YYYY-MM-DD

- 关卡 1: pass | fail
- 关卡 2: pass | fail
- 关卡 3: pass | fail
- 关卡 4: pass | fail
- 关卡 5: pass | fail
- 关卡 6: pass | fail

结论：
- 可以开始物理微服务拆分 | 仍未就绪

证据：
- `pnpm test:deployment-smoke`
- `pnpm test:distributed-acceptance`
- `pnpm test:runtime-closeout`
- `pnpm test:runtime-foundations`
- `pnpm eval:smoke`
- focused route / host tests
- docs guard results

阻塞缺口：
- ...
```

### 评估 2026-06-23

- 关卡 1: pass
- 关卡 2: pass
- 关卡 3: pass
- 关卡 4: pass
- 关卡 5: fail
- 关卡 6: pass

结论：
- 仍未就绪

证据：

- `pnpm test:distributed-acceptance`
- `pnpm test:deployment-smoke`
- `pnpm test:runtime-foundations`
- `pnpm eval:smoke`
- focused `distributed-runtime-closeout` / `job-runtime ownership` tests

阻塞缺口：

- 关卡 5 只剩 operator closeout 收口：需要在 docker 或 deployed runtime 中，用现有 `/v1/operations/status/async` contract 复现 queue / outbox reclaim、retryable failure、dead-letter、recent failure visibility；不再把阻塞描述成 read-side 未成熟或 distributed write-path 未接管。

### 评估 2026-06-23（Operator Closeout）

- 关卡 1: pass
- 关卡 2: pass
- 关卡 3: pass
- 关卡 4: pass
- 关卡 5: pass
- 关卡 6: pass

结论：
- 可以开始物理微服务拆分

证据：

- `docker compose --profile distributed up -d --build`
- `pnpm test:runtime-closeout`
- `pnpm test:deployment-smoke`
- `pnpm test:runtime-foundations`
- `pnpm test:distributed-acceptance`
- `pnpm eval:smoke`
- local `/ready` 与 `/v1/operations/status/async` 已报告 `deploymentProfile=distributed`、`preset=api`、`routeSurface=gateway-core`

关卡 5 阻塞缺口：

- 无关卡 5 阻塞：本地 Docker `distributed` 运行环境已可复现 operator closeout，`/v1/operations/status/async` 可稳定暴露 queue / outbox reclaim、recent dead letters、recent failures、retry / dead-letter policy。
- Remaining engineering work is follow-up hardening, not a split blocker: MQ transport rollout、deployed environment recheck、以及更细粒度恢复矩阵仍可继续演进。

关卡 4 阻塞缺口：

- 无关卡 4 阻塞：Phase 2 boundary-close 已把 direct-backed allowance 限定到 entry read surfaces，并把 retrieval / search / query trace 与 governance read surfaces 的 owner / backing source 固定到单一契约面。
- Remaining engineering work is follow-up hardening, not a split blocker: 独立 read-store、projection-only entry reads、outbox / retry / dead-letter 生产级恢复矩阵仍可继续演进。
