# @trapmap/app-migration

数据库迁移作业的**组装中心**：进程入口负责把库包的迁移能力接入进程生命周期（信号处理、退出码），**不承载任何业务逻辑**。

## 定位

- 迁移实现（六个 service 的 `run*Migrations`、pool 创建、配置加载）全部归 `@trapmap/host-distributed` 的 `migrate.ts` 所有。
- 本包只做 thin assembly：
  1. 打印开始/完成日志；
  2. `await runDistributedMigrations()`；
  3. 成功 `process.exit(0)`，失败打印错误并 `process.exit(1)`。
- 仅通过 exports 面内的子路径 `@trapmap/host-distributed/migrate.js` 调用，禁止深路径 import。

## 启动方式

```bash
pnpm --filter @trapmap/app-migration start
```

docker-compose 的 migration 服务以 `node dist/index.js` 运行本包。

## 职责边界

- **属于本包**：进程入口装配、日志输出、退出码、信号/错误处理。
- **不属于本包**：任何迁移 SQL、runner 编排、数据库连接、配置读取、服务启动逻辑——这些必须在库包中实现。

## 禁止事项

- 禁止复制或内联任何迁移逻辑；
- 禁止 import 库包文件深路径（如 `@trapmap/host-distributed/src/migrate.js`）；
- 禁止在入口内引入业务判断（分支逻辑应留在库包的工厂/runner 内）。
