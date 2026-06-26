# NestJS 服务演进 Phase 3

## 角色

- 状态：`proposed`
- 目标：在已收口的单体边界上做物理服务拆分和异步化

## 交付物

- [ ] 独立的 `gateway`
- [ ] 至少一个写服务与一个读/身份服务完成独立进程拆分
- [ ] outbox、queue、事件投影、失败语义进入明确 owner
- [ ] 单体与分布式双形态可验证
- [ ] 分布式拆分不改变轻后端默认 `in-process` 执行模型
- [ ] 至少一组服务达到“成熟服务”最小标准，而不是只有进程拆分
- [ ] 第一批成熟服务样板固定为 `knowledge-write + governance-review`

## 范围

- [ ] 同步调用边界
- [ ] 异步命令/事件边界
- [ ] internal transport
- [ ] 回放、重试、恢复、死信、幂等
- [ ] distributed maturity 升级判据
- [ ] 服务级 data owner / projection owner / runtime owner
- [ ] 样板组 closeout：`knowledge-write + governance-review`

## 样板优先级

### 第一批

- [ ] `knowledge-write + governance-review`
  目标：先把治理命令和最终聚合写入这条链路做成成熟服务样板。
  细则：[`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`](docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md)

### 第二批

- [ ] `candidate-ingestion + knowledge-write`
  目标：在首批样板稳定后，再补齐候选处理和结果发布链路。

### 暂缓

- [ ] `knowledge-read`
  目标：等读侧投影、freshness、distributed invalidation owner 更稳定后再成熟化。
- [ ] `identity-access`
  目标：在写侧链路成熟后，作为独立基础服务推进。
- [ ] `job-runtime`
  目标：作为横切 runtime owner 收尾，而不是第一批业务样板。

## 文档回写

- [ ] `docs/architecture/DEPLOYMENT.md`
- [ ] `docs/operations/ENVIRONMENT.md`
- [ ] `docs/operations/TESTING.md`
- [ ] `docs/reference/api-surface.md`
- [ ] 受影响服务 README

## 最小验证

- [ ] 受影响包最小测试集合
- [ ] `pnpm typecheck`
- [ ] `pnpm test:deployment-smoke`
- [ ] `pnpm eval:smoke`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 完成定义

- 物理服务拆分不再依赖隐含共享进程状态。
- 分布式形态和默认单体形态共享同一业务真相与 contract。
- 微服务只是部署展开方式，不再反向成为默认开发负担。
- distributed 成熟度至少从当前过渡态提升到可声明的数据和运维 owner 级别。
- 至少一组拆分后的服务已经具备明确边界、明确 owner、明确观测面，而不是仅靠 gateway 转发和 shared DB 存活。
- 第一批样板 `knowledge-write + governance-review` 已经能作为“成熟服务”参考模板复用到后续服务。
