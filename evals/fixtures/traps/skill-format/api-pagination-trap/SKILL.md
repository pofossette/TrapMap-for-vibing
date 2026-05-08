---
name: api-pagination-trap
description: 后端 API 分页和查询陷阱，包括 N+1、缺少限制和连接池耗尽
labels:
  - api
  - backend
  - node
  - postgresql
  - performance
  - pagination
---

# API 分页和查询陷阱

## N+1 查询问题

当 API 端点返回项目列表且每个项目需要单独的数据库查询来获取相关数据时，会导致 N+1 次查询而非 2 次。对于 100 个项目，这将变成 101 次查询，导致严重的性能下降和生产的超时错误。该端点在本地开发中使用小数据集时似乎正常，但在 Staging 和生产环境的负载下会失败。

前提条件：必须理解 SQL JOIN 操作和 ORM 预加载。
需要对相关数据使用 JOIN 或批量加载策略。

缓解方法：使用 ORM 预加载（sequelize include、TypeORM relations）或 DataLoader 进行批处理。修复方法：将 N+1 查询替换为单个 JOIN 查询或使用批量加载器模式。使用 vitest 针对已播种的 postgres 数据库进行测试。

## 缺少分页限制

不带分页返回所有记录的 API 端点会在表变大时导致内存不足错误。返回所有项目的 GET /api/items 端点在有 100 条记录时工作正常，但当生产表中有 100 万条记录时会因 OOM 错误崩溃。

需要为所有列表端点设置默认限制。修复方法：为所有列表端点添加强制 limit 和 offset 参数，并设置合理的默认值（limit=50，最大 limit=1000）。对于大数据集使用基于游标的分页。

## 连接池耗尽

当后端打开数据库连接而不释放时，连接池会耗尽。新请求在等待连接时超时，导致整个 API 的级联失败。错误在生产环境中表现为 "cannot acquire connection from pool"。

修复方法：确保在 finally 块中释放所有连接，根据预期并发配置池大小，并在 Staging 中使用连接泄漏检测。
