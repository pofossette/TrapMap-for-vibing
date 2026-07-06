# 微服务拆分验收清单

## 目的

本清单用于回答一个单一问题：

**当前仓库是否已经具备开始物理拆分微服务的条件。**

只有当下面所有 `Gate` 都满足时，才可以把 TrapMap 从“逻辑边界已冻结、distributed host 已存在”推进到“正式开始物理拆分与独立演进”。

如果任一项不满足，结论就是：

**还不能开始拆微服务。**

## 适用范围

- 适用于 `distributed` profile
- 适用于 `packages/host-distributed`
- 适用于 candidate/review -> knowledge 写链路、read-side、runtime、auth、queue/outbox 一致性

## 前置事实

- `packages/server` 是部分 compatibility shell：maintenance batch、decay batch 已降级为 compatibility-only；candidate apply-resolution、knowledge review 也已从默认 light 主线退役，在显式 compat/rollback 入口上只保留 retired compatibility 响应
- distributed authoritative write path 已迁移到 `packages/host-distributed`
- 第一阶段仍共享 PostgreSQL；本清单不要求数据库按服务拆分

权威参考：

- [微服务拆分就绪报告](../architecture/MICROSERVICE_SPLIT_READINESS_REPORT_2026-06-22.md)
- [Runtime Recomposition Migration Guide](./MIGRATION_GUIDE.md)
- [System Truth Sources](../reference/SYSTEM_TRUTH_SOURCES.md)
- [部署指南](../architecture/DEPLOYMENT.md)

## Gate 1: Server 兼容壳边界已冻结

必须满足：

- `packages/server` 的 maintenance/decay 最终写路由统一返回 `501 capability_unsupported`
- candidate apply-resolution 与 knowledge review 若仍保留 compat 路由，则必须被显式记录为 retired rollback-only surface，不能再写成默认入口例外
- `packages/server` 仍保留 retrieval、status/readiness、必要读侧与迁移兼容面
- truth docs 明确写出 server 是 compatibility shell，而不是主写面

执行：

```bash
rtk pnpm test:file -- packages/server/src/routes/candidates.test.ts
rtk pnpm test:file -- packages/server/src/routes/review.test.ts
rtk pnpm test:file -- packages/server/src/routes/decay.test.ts
rtk pnpm test:file -- packages/server/src/routes/maintenance.test.ts
rtk pnpm test:file -- packages/server/src/app.test.ts
rtk pnpm test:file -- packages/server/src/__tests__/routes-architecture-guard.test.ts
rtk pnpm --filter @trapmap/server build
rtk pnpm typecheck
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

通过标准：

- 所有命令退出码为 `0`
- maintenance/decay 写路由测试断言的是 `501 capability_unsupported`
- 若 candidate/review compat 路由仍保留，相关文档和计划必须把它们写成 retired rollback-only surface，而不是成功编排主路径
- 文档不再声称 `packages/server` 仍是这些链路的 authoritative write surface

## Gate 2: Distributed authoritative write path 真实闭环

必须满足：

- `gateway -> internal service -> knowledge-write` 的真实链路在多进程模式下可运行
- candidate resolution、review decision、maintenance batch、decay batch 都由 distributed host 承担 authoritative write
- 不存在 server fallback 或本地伪写路径

执行：

```bash
rtk pnpm test:distributed-acceptance
rtk pnpm test:deployment-smoke
rtk pnpm test:runtime-foundations
```

如本轮同时变更 retrieval / governance eval 真实链路，再补：

```bash
rtk pnpm eval:smoke
```

必要时补充分布式启动联调：

```bash
rtk pnpm dev:distributed:gateway
rtk pnpm dev:distributed:candidate-worker
rtk pnpm dev:distributed:governance-worker
rtk pnpm dev:distributed:outbox-worker
```

或：

```bash
rtk docker compose --profile distributed up -d
```

通过标准：

- `test:distributed-acceptance` 通过，并明确覆盖 `gateway -> internal service -> knowledge-write`、auth/header/error 语义、runtime/job-runtime ownership 证据
- `deployment-smoke` 和 `runtime-foundations` 全部通过
- 若本轮运行 `eval:smoke`，失败原因不能指向 distributed write path 未接管
- 只有当 focused acceptance 证据无法解释 remote ownership 时，才追加多进程联调

证据建议：

- 记录 gateway 请求、internal route 命中、knowledge-write 落库、outbox/queue side effect
- 记录失败语义：`404`、`403`、`409`、`503`、`504`

## Gate 3: Auth 与请求语义跨服务一致

必须满足：

- gateway 鉴权链路不依赖破坏性探针或本地捷径
- trace/request headers 可以跨 gateway 与内部服务透传
- timeout、非 `2xx` body、权限错误在 gateway 对外表现稳定

执行：

```bash
rtk pnpm test:distributed-acceptance
rtk pnpm test:deployment-smoke
```

通过标准：

- distributed gateway 的 auth contract、header 透传、`403/404/409/503/504` 失败语义都由 `test:distributed-acceptance` 提供 focused evidence
- session / permission / error mapping 在跨服务路径下与单体时期一致
- CLI 仍只连接 gateway，不要求用户理解内部服务拆分

## Gate 4: Read-side 不再阻塞物理拆分

必须满足：

- `knowledge-read` 不再只是“Phase 1 临时直接读权威表”的未收口姿态
- review queue、decay entries/search、maintenance entries、retrieval read-side 的依赖边界明确
- 读侧可以解释自己的投影来源、刷新语义和一致性边界

执行：

```bash
rtk pnpm test:runtime-foundations
rtk pnpm eval:smoke
```

必要时补 focused tests：

```bash
rtk pnpm --filter @trapmap/host-distributed test --run <knowledge-read-related-tests>
```

通过标准：

- 不再需要把 `knowledge-read` 的现状描述为“还不能拆的临时债务”
- read projection contract、freshness contract、fallback 语义都有代码和文档证据
- `GET /internal/knowledge-read/projection-status` 和 gateway 的 `GET /v1/knowledge/projection-status` 能区分 temporary direct-backed entry projections、derived retrieval/search/query-trace surfaces，以及不属于 `knowledge-read` 的 governance read surfaces

## Gate 5: Job Runtime 已被证明能承接跨服务主路径

必须满足：

- queue/outbox/retry/reclaim/status 不是“存在实现”，而是“已被验证能服务 distributed 主路径”
- worker ownership、remote ownership、degraded/remote/running 语义稳定
- 没有必须依赖单进程偶然性的隐式行为
- 唯一允许剩余的 gap 只能是单一、具体、可指向的 docker / deployed runtime operator closeout 问题，不能再泛化成 read-side 或 write ownership 未接管

执行：

```bash
rtk pnpm test:distributed-acceptance
rtk pnpm test:runtime-foundations
rtk pnpm test:deployment-smoke
rtk pnpm test:runtime-closeout
```

若涉及 MQ 预设，再补：

```bash
rtk docker compose --profile distributed --profile mq up -d
```

通过标准：

- `test:distributed-acceptance` 至少证明一个 gateway 场景和一个 job-runtime ownership 场景，并覆盖 queue stale-running reclaim、outbox retryable failure、dead-letter、stale-processing reclaim 的 focused evidence
- `runtime-foundations` 继续证明 readiness / degraded / remote / running 语义
- `test:runtime-closeout` 通过，并经现有 `/v1/operations/status/async` contract 证明 queue/outbox reclaim、recent dead letters、recent failures、retry/dead-letter policy 对 operator 可见
- queue/outbox 相关失败恢复语义有 focused evidence
- 可以说明哪些工作由本进程拥有，哪些是 remote ownership
- docker / deployed runtime 若仍未完全闭环，阻塞描述必须收敛为单一 operator closeout 问题，而不是“runtime 还不稳定”

## Gate 6: Truth Docs 与执行入口一致

必须满足：

- 入口文档、migration guide、readiness report、truth source 的叙事一致
- 不再存在“代码说已拆，文档说还没拆”或相反的双重叙事

执行：

```bash
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

人工核对：

- [docs/architecture/MICROSERVICE_SPLIT_READINESS_REPORT_2026-06-22.md](../architecture/MICROSERVICE_SPLIT_READINESS_REPORT_2026-06-22.md)
- [docs/guides/MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
- [docs/reference/SYSTEM_TRUTH_SOURCES.md](../reference/SYSTEM_TRUTH_SOURCES.md)
- [docs/architecture/DEPLOYMENT.md](../architecture/DEPLOYMENT.md)

通过标准：

- 所有 guard 通过
- 文档对“现在能否开始拆”的回答一致

## 最终判定模板

只有当以下复选框全部可勾选时，才允许进入“开始拆微服务”阶段：

- [ ] Gate 1 通过：`packages/server` compatibility shell 边界已冻结
- [x] Gate 2 通过：distributed authoritative write path 多进程真实闭环成立
- [x] Gate 3 通过：auth、header、timeout、error mapping 跨服务一致
- [x] Gate 4 通过：`knowledge-read` 不再是阻塞物理拆分的临时债务
- [x] Gate 5 通过：`job-runtime` 已被证明能承接跨服务主路径
- [x] Gate 6 通过：truth docs、运行入口、验证命令叙事一致

## 当前状态记录模板

每次重新评估是否可开始拆分时，按下面模板追加一次记录：

```markdown
### Assessment YYYY-MM-DD

- Gate 1: pass | fail
- Gate 2: pass | fail
- Gate 3: pass | fail
- Gate 4: pass | fail
- Gate 5: pass | fail
- Gate 6: pass | fail

Conclusion:
- Ready to start physical microservice split | Not ready

Evidence:
- `rtk pnpm test:deployment-smoke`
- `rtk pnpm test:distributed-acceptance`
- `rtk pnpm test:runtime-closeout`
- `rtk pnpm test:runtime-foundations`
- `rtk pnpm eval:smoke`
- focused route/host tests
- docs guard results

Blocking gaps:
- ...
```

### Assessment 2026-06-23

- Gate 1: pass
- Gate 2: pass
- Gate 3: pass
- Gate 4: pass
- Gate 5: fail
- Gate 6: pass

Conclusion:
- Not ready

Evidence:
- `rtk pnpm test:distributed-acceptance`
- `rtk pnpm test:deployment-smoke`
- `rtk pnpm test:runtime-foundations`
- `rtk pnpm eval:smoke`
- focused `distributed-runtime-closeout` / `job-runtime ownership` tests

Blocking gaps:
- Gate 5 只剩 operator closeout 收口：需要在 docker 或 deployed runtime 中，用现有 `/v1/operations/status/async` contract 复现 queue/outbox reclaim、retryable failure、dead-letter、recent failure visibility；不再把阻塞描述成 read-side 未成熟或 distributed write-path 未接管。

### Assessment 2026-06-23 (Operator Closeout)

- Gate 1: pass
- Gate 2: pass
- Gate 3: pass
- Gate 4: pass
- Gate 5: pass
- Gate 6: pass

Conclusion:
- Ready to start physical microservice split

Evidence:
- `rtk docker compose --profile distributed up -d --build`
- `rtk pnpm test:runtime-closeout`
- `rtk pnpm test:deployment-smoke`
- `rtk pnpm test:runtime-foundations`
- `rtk pnpm test:distributed-acceptance`
- `rtk pnpm eval:smoke`
- local `/ready` and `/v1/operations/status/async` now report `deploymentProfile=distributed`, `preset=api`, `routeSurface=gateway-core`

Gate 5 blocking gaps:
- 无 Gate 5 阻塞：本地 Docker `distributed` 运行环境已可复现 operator closeout，`/v1/operations/status/async` 可稳定暴露 queue/outbox reclaim、recent dead letters、recent failures、retry/dead-letter policy。
- Remaining engineering work is follow-up hardening, not a split blocker: MQ transport rollout、deployed environment recheck、以及更细粒度恢复矩阵仍可继续演进。

Gate 4 blocking gaps:
- 无 Gate 4 阻塞：Phase 2 boundary-close 已把 direct-backed allowance 限定到 entry read surfaces，并把 retrieval/search/query trace 与 governance read surfaces 的 owner/backing source 固定到单一契约面。
- Remaining engineering work is follow-up hardening, not a split blocker: 独立 read-store、projection-only entry reads、outbox/retry/dead-letter 生产级恢复矩阵仍可继续演进。
