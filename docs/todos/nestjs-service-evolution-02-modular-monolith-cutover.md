# NestJS 服务演进 Phase 2

## 角色

- 状态：`proposed`
- 目标：把默认开发主线切到模块化单体

## 交付物

- [ ] 主要 bounded context 完成 Nest module + domain/application 分层
- [ ] 默认本地开发入口切到新的 modular monolith
- [ ] `embedded/local-agent` 与 `team-monolith` 共用同一主实现面，只在 capability 和依赖上裁剪
- [ ] 旧 `packages/server` / `packages/host-local` 进入兼容层或只读维护状态

## 范围

- [ ] `identity-access`
- [ ] `knowledge-read`
- [ ] `knowledge-write`
- [ ] `candidate-ingestion`
- [ ] `governance-review`
- [ ] `job-runtime`

## 文档回写

- [ ] `README.md`
- [ ] `docs/PACKAGES.md`
- [ ] `docs/architecture/ARCHITECTURE.md`
- [ ] `docs/reference/REPO_STRUCTURE.md`
- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md`

## 最小验证

- [ ] 受影响包最小测试集合
- [ ] `pnpm typecheck`
- [ ] `pnpm test:deployment-smoke`
- [ ] `pnpm test:runtime-foundations`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 完成定义

- 新单体形态已成为默认开发主线。
- 旧实现不再承担“主实现面”，只保留迁移所需兼容职责。
- 轻后端已成为第一等形态，而不是为了 distributed 存在的过渡壳。
