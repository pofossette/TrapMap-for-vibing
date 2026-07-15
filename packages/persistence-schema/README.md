# @trapmap/persistence-schema

中立的 Drizzle PostgreSQL schema 层。它只承载物理表定义和无状态列工厂；不承载路由、repository 或服务行为。

服务与 runtime consumer 从 `@trapmap/persistence-schema` 导入表定义。新增表或共享列工厂时必须保持冻结 migration 的表名、列名、默认值、索引和约束不变。
