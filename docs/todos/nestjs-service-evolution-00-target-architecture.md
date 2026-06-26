# NestJS 服务演进 Phase 0

## 角色

- 状态：`proposed`
- 目标：冻结长期目标架构、边界、命名和迁移策略

## 交付物

- [ ] 新后端目标形态图：`Nest host + framework-free domain core + gradual service extraction`
- [ ] 三档运行模型：`embedded/local-agent`、`team-monolith`、`distributed`
- [ ] 包级迁移矩阵：保留、拆分、重命名、退役
- [ ] `contracts`、HTTP contract、internal contract、event contract 的主线方案
- [ ] 单体优先、服务后拆的判据
- [ ] distributed 成熟度基线评估与分级标准
- [ ] 第一批成熟服务样板组与后续优先级

## 关键决策

- [ ] 是否保留 `backend-core` 作为单包，还是拆成多个 `domain-*` 包
- [ ] 是否采用 contract-first 方案统一外部和内部 SDK
- [ ] Nest 只负责宿主/transport/DI，领域规则不依赖 Nest
- [ ] 默认轻量开发模式仍保留单进程主入口
- [ ] 轻后端默认使用 `in-process` invocation，远端 hop 只属于 `distributed`

## 文档回写

- [ ] `README.md`
- [ ] `docs/README.md`
- [ ] `docs/PACKAGES.md`
- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] `docs/reference/REPO_STRUCTURE.md`

## 最小验证

- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 完成定义

- 仓库内不再同时存在两套互相竞争的长期后端叙事。
- 所有后续阶段都能明确落到具体包与具体 owner。
- “轻后端优先，微服务为部署选项”的原则已经冻结，不再回到“先拆服务再补轻模式”。
- 当前 distributed 的定位已经冻结为可验证的成熟度等级，而不是模糊口径。
