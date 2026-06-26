# NestJS 服务演进 Phase 4

## 角色

- 状态：`proposed`
- 目标：完成数据 owner、运维面、迁移收尾和旧实现退役

## 交付物

- [ ] 读写 owner、投影 owner、队列 owner、容量与故障语义全部收口
- [ ] 旧宿主与重复 transport/client 退役计划执行
- [ ] 文档索引、truth source、测试矩阵与归档全部收尾
- [ ] distributed 从“过渡态拆分”提升到“成熟服务可声明”所需的剩余 owner 和运维面全部补齐

## 范围

- [ ] 数据库与读模型 owner
- [ ] 运行时 profile 与部署入口
- [ ] 兼容壳退役
- [ ] 迁移窗口关闭条件
- [ ] 成熟服务 closeout 判据

## 文档回写

- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] `docs/reference/REPO_STRUCTURE.md`
- [ ] `docs/README.md`
- [ ] `docs/operations/TESTING.md`
- [ ] `docs/archived/archived-plans/` 归档记录

## 最小验证

- [ ] 受影响包最小测试集合
- [ ] `pnpm typecheck`
- [ ] `pnpm test:deployment-smoke`
- [ ] `pnpm test:runtime-foundations`
- [ ] `pnpm eval:smoke`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 完成定义

- 新主线已可自洽运行、测试、部署、文档化。
- 旧主线不再是仓库默认入口，也不会继续累积新功能。
- “成熟服务”所需的数据、投影、运维、部署判据已经闭环，而不是只剩分布式目录结构。
