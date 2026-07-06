# @trapmap/web-panel

TrapMap 的管理后台 Web 面板。

## 用途

本包提供基于浏览器的运维控制台，供管理员用于检查运行时健康状态、审查待处理的治理任务，以及执行不应通过 CLI 暴露的手动干预操作。

## 命令

```bash
rtk pnpm --filter @trapmap/web-panel dev
rtk pnpm --filter @trapmap/web-panel build
rtk pnpm --filter @trapmap/web-panel test
rtk pnpm --filter @trapmap/web-panel typecheck
```

## 运行时 API

- 默认模式使用真实网关 API。
- `VITE_ADMIN_PANEL_API_MODE=mock` 仅支持本地开发和测试。
- 生产构建会拒绝 `VITE_ADMIN_PANEL_API_MODE=mock`。
- 如需覆盖网关来源，请设置 `VITE_ADMIN_PANEL_API_BASE_URL`。

## 目录结构

- `src/app`：引导程序、Providers、路由、Shell
- `src/pages`：路由绑定的页面组合
- `src/features`：工作流/控制器边界
- `src/services`：API 适配层
- `src/stores`：Zustand 切片
- `src/shared`：可复用的 UI 辅助工具
- `src/styles`：全局样式与设计令牌

## 规划能力

- 服务与部署状态仪表盘
- 待人工审核队列
- 审核详情工作区，支持批准和驳回操作
- 内联 JSON 编辑工具，用于手动修正场景
- 管理员操作的运维审计可见性
