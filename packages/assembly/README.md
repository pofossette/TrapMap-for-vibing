# @trapmap/assembly

统一优雅组装中心（cordis-backed，TS Code-First）。Phase 1（地基）交付。

## 定位

`@trapmap/assembly` 是 TrapMap 的编程式装配内核：以 `@deepseek-ai/cordis`（DeepSeek
Harness 同源生产内核）为依赖图/生命周期/配置校验底座，能力以「能力节点」声明，
装配即 TS 组合。不引入 yml/json 装配文件，不自研 DI 图。

## API sketch

```ts
import {
  createAssembly,
  defineNode,
  defineContract,
  createShutdownController,
} from '@trapmap/assembly';

const nodeA = defineNode({
  id: 'identity-access',
  provides: ['identity', 'audit'],
  apply: (ctx, config) => {
    const guard = ctx.provide('identity', makeIdentityImpl(config));
    // ...
    return cleanup; // optional disposer
  },
});

const assembly = createAssembly({ contracts: [...] })
  .add(nodeA, { required: true })
  .build();

const running = await assembly.boot();
// running.ctx / running.dispose()
const shutdown = running.createShutdownController();
await shutdown.shutdown();
```

导出：`createAssembly` → `AssemblyBuilder`（`.add()` / `.build()`）、`Assembly.boot()`、
`RunningAssembly`、`defineNode`、`defineContract`、`startupChecks`、
`createShutdownController`、`AssemblyStartupError` 与相关类型。

## Phase 1 scope（本包当前范围）

- cordis 引入 + 能力节点注册表 + TS 组合器（`createAssembly().add()`）
- 启动校验（`startupChecks`）：重复 id、未知 inject、inject 环、重复 provide、
  拓扑规则、未知子节点、契约注册/校验；build 失败抛 `AssemblyStartupError`
- 生命周期/退出控制（`createShutdownController`：幂等、并发共享、超时兜底、abort 触发）
- 契约优先基础设施（`defineContract` + contract registry + `verify`）

**Phase 2 及以后**才落地：`profiles/`（local-agent / team-monolith / distributed 形态
builder）、真实能力节点（identity-access、knowledge-write/read、judgment 类契约节点等）、
host-local / host-distributed 收敛为 transport 插件。节点拓扑（embedded/standalone/cluster）
与子 worker 挂载的「进程拓扑解析」在本包已具备声明与校验基础，进程编排实现推迟到
对应 Phase。

## 设计

详见
[`docs/superpowers/specs/2026-08-16-unified-assembly-center-design.md`](../../docs/superpowers/specs/2026-08-16-unified-assembly-center-design.md)
（D1/D6 Phase 1/D7/D8）。
