---
name: database-migration-trap
description: 数据库 schema 迁移陷阱，包括破坏性变更、锁竞争和回滚失败
labels:
  - database
  - postgresql
  - migration
  - schema
  - backend
  - sql
---

# 数据库迁移陷阱

## 无向后兼容的破坏性 Schema 变更

当迁移重命名列或更改数据类型而不保持向后兼容时，已部署的应用程序会立即崩溃。旧代码引用不再存在的旧列名，导致生产环境出现 "column not found" 错误。这是一个跨领域失败，同时影响后端、CI 管道和部署流程。

前提条件：必须理解 expand-contract 迁移模式。
需要在过渡期间维护旧和新两种 schema。

缓解方法：使用 expand-contract 模式 - 先添加新列，部署同时写入两者的代码，然后在单独的迁移中删除旧列。修复方法：永远不要在单次迁移中重命名或删除列。始终拆分为添加和删除两个阶段，中间由部署分隔。

## 生产环境中的迁移锁竞争

在 PostgreSQL 中对大表运行 ALTER TABLE 会获取排他锁，阻止所有读写。在活跃流量的生产环境中，这会导致超时错误和连接池耗尽，因为查询排队等待锁。迁移本身在大表上可能需要数小时。

需要在线 schema 变更工具。修复方法：在支持的地方使用 pg_repack 或 PostgreSQL ONLINE 操作，在迁移前添加 SET lock_timeout 和 SET statement_timeout，并在低流量时段运行迁移。在 Staging 环境中使用生产级数据量测试迁移性能。

## 迁移回滚失败导致不一致状态

当迁移中途失败且回滚也失败时，数据库会留在旧和新 schema 之间的不一致状态。随后应用迁移或回滚都会产生错误，因为存在部分状态。这需要手动数据库干预来解决。

修复方法：在可能的情况下将每次迁移包装在事务中（PostgreSQL 的 DDL 可以是事务性的），包含幂等回滚脚本，并在应用到 Staging 或生产环境前始终在 CI 中测试迁移回滚。
