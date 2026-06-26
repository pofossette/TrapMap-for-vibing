# NestJS 服务演进 Phase 1

## 角色

- 状态：`proposed`
- 目标：建立第一条可运行的 Nest 宿主与 contract 基础

## 交付物

- [ ] 一个可运行的 Nest 宿主主入口，能装配现有核心模块
- [ ] 统一配置加载、异常映射、认证上下文和生命周期钩子
- [ ] 统一外部 SDK 与 internal client 生成/维护方式
- [ ] 为 internal port 提供 `in-process` / `remote` 双 adapter
- [ ] 明确旧 `host-local` / `service-*` 的兼容窗口

## 范围

- [ ] `gateway` 宿主
- [ ] `identity-access` 或 `knowledge-read` 选择一个作为首个服务样板
- [ ] 配置模块、HTTP 过滤器、验证管线、日志/trace 中间件
- [ ] 轻后端单进程 worker/outbox 与远端 transport 的切换边界

## 文档回写

- [ ] `docs/architecture/ARCHITECTURE.md`
- [ ] `docs/architecture/DEPLOYMENT.md`
- [ ] `docs/operations/ENVIRONMENT.md`
- [ ] `docs/operations/TESTING.md`
- [ ] 受影响 package README

## 最小验证

- [ ] 受影响包 `pnpm test --run <path>` 或 `pnpm test:file -- <path>`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:deployment-smoke`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 完成定义

- 新宿主已能作为真实开发入口运行至少一条主链路。
- 共享 HTTP/contract 方案已经替代继续手写多份 `http.ts` 的路径。
- 轻后端主链路在默认模式下不需要跨进程 HTTP hop。
