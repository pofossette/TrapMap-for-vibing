# PostgreSQL 与 Graphology 上手

面向“不熟悉 `pg` 和 `graphology`，但需要在 TrapMap 里读代码和定位问题”的贡献者。

## 先建立正确心智模型

- `pg` 在本项目里是**底层数据库连接与事务入口**。`pg.Pool` 先建立起来，Drizzle 再按需包在上面。
- `graphology` 在本项目里是**运行时图引擎和 memory query backend**，不是图数据库。项目会先把图索引文档持久化为普通记录，再在查询、校验、规划时临时组装成图；这现在是 `GraphQueryBackend` 的一种实现，而不是唯一图查询路径。
- 如果你只想最快建立直觉，先跑两个测试：

```bash
TRAPMAP_DATABASE_URL=postgresql://trapmap:trapmap@127.0.0.1:5434/trapmap \
pnpm test -- --run packages/server/src/lib/retrieval/recall/pg-keyword.test.ts

pnpm test -- --run packages/server/src/lib/indexing/graph-lite/graphology.test.ts
```

---

## 1. `pg` 在 TrapMap 里怎么用

### 1.1 从哪里建连

入口在 `packages/server/src/lib/persistence/create-store.ts`。

- 设置了 `TRAPMAP_DATABASE_URL`：创建 `pg.Pool`，返回 `PostgresStore`
- 没设置：回退到 `JsonStore`

这意味着 PostgreSQL 不是“附加功能”，而是服务端的正式存储模式；JSON store 主要是兼容回退和轻量测试路径。

### 1.2 `PostgresStore` 扮演什么角色

核心文件：`packages/server/src/lib/persistence/postgres-store.ts`

它不是传统 ORM repository，而是一个**兼容层 store**：

- 把整份 `StoreData` 快照存在 `store_snapshot` 的 JSONB 行里
- 保留 `snapshot()` / `transact()` / `nextId()` 这套旧接口
- 在 `transact()` 里用 `SELECT ... FOR UPDATE` 做串行化写入

这个层的意义是：老代码不必一次性全部重写成关系型 repository，就能先切到底层 PostgreSQL。

### 1.3 启动时 PG 会做什么

主链路如下：

1. `packages/server/src/app.ts`
2. `packages/server/src/bootstrap/bootstrap-repositories.ts`
3. `packages/server/src/lib/persistence/migration-runner.ts`

启动后会发生这些事：

- 运行 `CREATE EXTENSION IF NOT EXISTS vector`
- 执行 `drizzle/` 下的迁移
- 创建各领域 repository
- 为向量检索确保 HNSW 索引
- 注册后续检索/图通道

所以你看到 `pg` 时，不要只盯着 CRUD；它同时支撑了迁移、向量索引、任务流和检索基础设施。

### 1.4 业务代码里怎么写 PG

TrapMap 里有三种常见写法。

#### 写法 A：兼容层 store

适合还没有彻底拆成关系表的旧路径。

重点文件：

- `packages/server/src/lib/persistence/postgres-store.ts`
- `packages/server/src/lib/store.ts`

你会看到：

- 先读出整份快照
- 在事务里修改内存对象
- 再整行 JSONB upsert 回去

#### 写法 B：领域 repository + 显式事务

适合聚合写入、子表较多、需要锁语义的场景。

最典型的是：

- `packages/server/src/lib/knowledge/pg-repository.ts`

这个仓储会：

- 从 `Pool` 拿 `client`
- 手动 `BEGIN / COMMIT / ROLLBACK`
- 先写主表，再写 revisions、lifecycle、labels、boundary、maintenance 等子表

这里的风格非常“SQL-first”，不是把所有逻辑都交给 ORM。

#### 写法 C：`pg` + Drizzle 查询构建

适合查询条件多、表结构明确、想保留类型约束的场景。

推荐看：

- `packages/server/src/lib/retrieval/recall/pg-keyword.ts`
- `packages/server/src/lib/graph-index/repository.ts`

`pg-keyword.ts` 展示了项目里很典型的 PG 检索写法：

- `drizzle(pool, { schema })`
- 用 `and` / `eq` / `inArray` / `sql` 拼过滤条件
- 利用 `text[] && ARRAY[...]` 做 token overlap
- 把团队、权限级别、scope 过滤直接下推到数据库

`graph-index/repository.ts` 则展示了另一种模式：

- 表结构是关系型的
- 但 `nodes` / `edges` 仍以 JSONB 数组落库
- 适合图索引文档这类“结构稳定，但内部仍是树/图对象”的数据

### 1.5 测试上要注意什么

- `packages/server/src/lib/persistence/postgres-store.test.ts` 主要验证兼容层语义，不要求真实 PostgreSQL
- `packages/server/src/lib/store.test.ts` 里有 `pg-mem`，适合先理解接口语义
- 大多数 `pg-*repository`、`pg-keyword`、`outbox` 测试都要求真实 PostgreSQL，并通过 `TRAPMAP_DATABASE_URL` 控制是否跳过

换句话说，看到测试“自动 skip”并不代表代码没走到，只是你当前没有连真实库。

---

## 2. `graphology` 在 TrapMap 里怎么用

### 2.1 它不是存储层

先记住这一点：TrapMap 并不把 `graphology` 当图数据库使用。

同时也要记住：PostgreSQL `graph_index_documents` 仍是图索引的权威真相源。可选 graph DB 只是在查询期提供另一种 `GraphQueryBackend` 实现；关闭或故障时，系统仍可回退到 `graphology`。

真实的数据形态是 `GraphIndexDocumentRecord`，也就是“某个 trap / skill 对应的一份图索引文档”。主要位置：

- 图文档类型：`packages/server/src/lib/indexing/graph-lite/documents.ts`
- PG 表结构：`packages/server/src/lib/persistence/schema/retrieval.ts`
- repository 抽象：`packages/server/src/lib/graph-index/repository.ts`

`graphology` 做的是把这些文档组装成可遍历、可校验、可裁剪的运行时图。在当前架构里，它同时承担默认 / fallback query backend 的职责。

### 2.2 核心运行时在 `graphology.ts`

重点文件：

- `packages/server/src/lib/indexing/graph-lite/graphology.ts`

这里集中封装了四类能力：

#### 组图

- `buildGraphFromDocuments()`
- `buildGraphRuntimeSnapshot()`

输入是 `GraphIndexDocumentRecord[]`，输出是：

- 一个 directed multi-graph
- 多个辅助索引映射
  - label -> nodeIds
  - label -> sourceIds
  - nodeId -> sourceIds
  - sourceId -> nodeIds

这些映射是后续检索性能的关键，不是“顺手缓存”。

#### 硬依赖投影与环检测

- `projectHardDependencyGraph()`
- `assertNoHardDependencyCycles()`

这里会用到 `graphology-dag` 的 `hasCycle()`。

不是所有边都参与 DAG 校验，只有：

- `requires`
- `risk-blocks`
- `requires-version`

并且必须是 `strength === 'hard'`。

这点很重要，因为它直接决定“为什么某条边不会触发 cycle error”。

#### 局部扩张

- `buildLocalExpansionView()`

这里会用到：

- `graphology-shortest-path` 的 `singleSourceLength()`
- `graphology-operators` 的 `subgraph()`

用途是从种子节点出发，按 hop 数裁出一个局部子图，供 v3 trap-first plan 使用。

#### 查询期打分辅助

- `expandSourcesOneHop()`
- `calculateSourceRelationStrength()`
- `findEntriesByContext()`
- `findEntriesByBoundaryConstraints()`

这些函数把“图结构”转成“候选 sourceId 和分数信息”，供检索层消费。

### 2.3 项目里哪些地方真的在用它

最值得读的三条链路：

#### 链路 A：图辅助检索

文件：

- `packages/server/src/lib/retrieval/recall/graph-assisted.ts`

流程：

1. 从 query 文本抽实体
2. 通过 `GraphQueryBackend` 做 one-hop 扩张和关系强度计算
3. `memory` backend 下才会读取 graph documents 并 `buildGraphRuntimeSnapshot()`
4. `expandSourcesOneHop()`
5. `calculateSourceRelationStrength()`
6. 和已有 eligible entries 交集后打分

也就是说，`graphology` 在这里主要负责默认 / fallback 的“基于关系做候选扩张”，不是直接替代全文检索，也不是唯一可插拔后端。

#### 链路 B：trap-first 计划编译

文件：

- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`

流程里会：

- 构造 seed node
- 基于 `buildLocalExpansionView()` 做局部扩张
- 从扩张后的图里识别 blocking trap、mitigating skill、plan edges

这是 `GraphQueryBackend` 在项目里最“图原生”的使用点；当 backend 为 `memory` 时，底层实现仍是 `graphology`。

#### 链路 C：索引写入前校验

文件：

- `packages/server/src/lib/indexing/adapters/graph.ts`
- `packages/server/src/lib/indexing/skill-events.ts`
- `packages/server/src/lib/indexing/reconcile.ts`

写入图文档前，代码会：

- 抽取节点和边
- 组装 candidate graph document
- 用 `assertNoHardDependencyCycles()` 先做校验
- 通过后再持久化

### 2.4 当前代码有迁移过渡层

这是新读者最容易踩坑的点。

当前仓库里，图索引存在两套并行概念：

- 新抽象：`GraphIndexRepository` + `graph_index_documents` 表
- 旧兼容层：`StoreData.graphIndexDocuments` + `lib/indexing/graph-lite/store.ts`

实际代码里：

- 图查询入口已经大量依赖 `repos.graphIndex`
- 但不少图索引写入、删除、对账逻辑仍直接操作 `graphIndexDocuments` 兼容层

所以如果你在排查“图数据为什么不对”，不要只看一个位置。至少同时检查：

- `packages/server/src/lib/graph-index/repository.ts`
- `packages/server/src/lib/indexing/graph-lite/store.ts`
- `packages/server/src/lib/indexing/adapters/graph.ts`
- `packages/server/src/lib/indexing/reconcile.ts`

---

## 3. 推荐的最短上手路线

### 路线 A：先把 PostgreSQL 跑起来

如果你是在宿主机直接跑 server，最省事的方式是只启动 compose 里的 PostgreSQL：

```bash
docker compose up -d postgres

export TRAPMAP_DATABASE_URL=postgresql://trapmap:trapmap@127.0.0.1:5434/trapmap
pnpm dev:team-monolith
```

说明：

- `docker-compose.yml` 里 PostgreSQL 暴露到宿主机的端口是 `5434`
- server 启动时会自动跑迁移和 `vector` 扩展初始化

### 路线 B：先摸清 `pg` 的项目风格

建议按这个顺序读：

1. `packages/server/src/lib/persistence/create-store.ts`
2. `packages/server/src/lib/persistence/postgres-store.ts`
3. `packages/server/src/lib/persistence/migration-runner.ts`
4. `packages/server/src/bootstrap/bootstrap-repositories.ts`
5. `packages/server/src/lib/knowledge/pg-repository.ts`
6. `packages/server/src/lib/retrieval/recall/pg-keyword.ts`

如果你只读一个写路径和一个读路径：

- 写路径读 `pg-repository.ts`
- 读路径读 `pg-keyword.ts`

### 路线 C：先摸清 `graphology` 的项目风格

建议按这个顺序读：

1. `packages/server/src/lib/indexing/graph-lite/documents.ts`
2. `packages/server/src/lib/indexing/graph-lite/graphology.ts`
3. `packages/server/src/lib/retrieval/recall/graph-assisted.ts`
4. `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
5. `packages/server/src/lib/indexing/adapters/graph.ts`

### 路线 D：先跑最有代表性的测试

```bash
# PG 关键词检索：最典型的 "pg + Drizzle + 权限过滤 + 评分"
TRAPMAP_DATABASE_URL=postgresql://trapmap:trapmap@127.0.0.1:5434/trapmap \
pnpm test -- --run packages/server/src/lib/retrieval/recall/pg-keyword.test.ts

# 图运行时：最典型的 "组图 + 环检测 + 局部扩张"
pnpm test -- --run packages/server/src/lib/indexing/graph-lite/graphology.test.ts
```

如果你想先从“最轻量的 PG 兼容层”入手，再补一条：

```bash
pnpm test -- --run packages/server/src/lib/persistence/postgres-store.test.ts
```

---

## 4. 常见误区

### 误区 1：Drizzle 就是数据库访问的全部

不是。TrapMap 明显是 `pg` 在下、Drizzle 在上的混合风格：

- 需要锁、事务、聚合写入时，经常直接写 SQL
- 需要类型安全查询构造时，再用 Drizzle

### 误区 2：`graphology` 负责存图

不是。它主要负责：

- 运行时图装配
- DAG 校验
- hop 扩张
- 图关系打分辅助

图的持久化仍然是普通数据存储问题，权威数据仍在 PostgreSQL `graph_index_documents`；可选 graph DB 只是查询后端。

### 误区 3：图里的所有边都会参加环检测

不是。只有硬依赖边会参与投影和 cycle check。

### 误区 4：没配 `TRAPMAP_DATABASE_URL` 也算测过 PG 路径

不是。很多 PG 测试会直接 skip。

---

## 5. 读代码时的抓手

如果你以后再遇到这两个技术栈，直接按下面的抓手排查就够了。

### 想看“PG 为什么没生效”

优先看：

1. `TRAPMAP_DATABASE_URL` 是否设置
2. `create-store.ts` 是否走到了 `PostgresStore`
3. `bootstrap-repositories.ts` 是否跑完迁移和 repo 装配
4. 目标功能走的是兼容层 store，还是某个 `Pg*Repository`

### 想看“图为什么没召回 / 没扩张 / 报 cycle”

优先看：

1. 图文档有没有生成
2. 生成的是 trap 文档还是 skill 文档
3. `graphology.ts` 里的边类型和强度是否符合预期
4. 当前逻辑读的是 repository 还是兼容层 `graphIndexDocuments`

掌握这几条后，再看 TrapMap 里的 `pg` 和 `graphology` 代码，基本不会迷路。
