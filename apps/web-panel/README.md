# `@trapmap/web-panel`

你用这个浏览器控制台观察运行态、执行治理审核、检查 skill 工件并调试 trap / skill 图谱。

## 入口

启动入口为 `apps/web-panel/src/main.tsx`，路由定义见 `apps/web-panel/src/app/`，页面组合见 `apps/web-panel/src/pages/`，工作流逻辑见 `apps/web-panel/src/features/`，传输层见 `apps/web-panel/src/services/`（`createAdminPanelApi` 真实实现与 `createMockAdminPanelApi` 内存实现），状态切片见 `apps/web-panel/src/stores/`（zustand），复用组件与工具分别见 `apps/web-panel/src/shared/ui/` 与 `apps/web-panel/src/shared/lib/`。

| 路径 | 页面 |
| --- | --- |
| `/login` | access-key 登录 |
| `/` | 运行总览 |
| `/reviews` | 治理审核队列（`read-only-operator` 隐藏） |
| `/reviews/:id` | 审核工作区（JSON 编辑与批准 / 拒绝 / 退回） |
| `/artifacts` | skill 工件浏览 |
| `/trap-graph` | trap 拓扑图 |
| `/skill-graph` | 单工件推导 / 语义图 |
| `/activity` | 审计时间线 |

```bash
pnpm --filter @trapmap/web-panel dev
pnpm --filter @trapmap/web-panel build
pnpm --filter @trapmap/web-panel preview
pnpm --filter @trapmap/web-panel test
pnpm --filter @trapmap/web-panel test:e2e
pnpm --filter @trapmap/web-panel typecheck
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `react` / `react-dom` / `react-router-dom` | 渲染与路由 |
| `zustand` | 状态切片 |
| `framer-motion` | 页面过渡 |
| `@heroui/react` / `@heroui/styles` | 组件库 |
| `@antv/g6` | 图谱渲染 |
| `tailwindcss` | 样式 |
| `@trapmap/client-core` | API 传输（唯一后端通道） |
| `@trapmap/contracts` | 共享类型与契约 |
| `test:e2e*` | playwright 套件（含 UI / headed / debug 变体） |

面板只消费 `@trapmap/client-core` 与 `@trapmap/contracts`，后端数据一律经网关 API 获取。页面级产品定义见 `apps/web-panel/docs/requirements.md`，分层约定见 `apps/web-panel/docs/architecture.md`。
