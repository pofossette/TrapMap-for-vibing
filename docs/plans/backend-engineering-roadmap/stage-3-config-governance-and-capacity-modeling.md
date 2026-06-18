# TrapMap Stage 3 执行包：Config Governance 与 Capacity Modeling

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 把不断增长的 internal port、cache、bulk ingestion、distributed invalidation、remote cache 配置收敛成可验证、可推荐、可审计的 config governance，并补齐共享 PostgreSQL 与 read host 的容量模型。

**架构：** 保持 env-first 配置方式，增强 schema、分层、冲突检测、配置可见性与容量预算；不引入新的集中配置系统。

**技术栈：** TypeScript、Zod、Fastify、Vitest、PostgreSQL、runtime metadata。

---

## 为什么先做这个

- `docs/operations/ENVIRONMENT.md` 已经补入大量 planned config surface。
- 如果不做 config governance，重后端一旦拆开，环境变量会迅速失控。
- 容量问题也已经不再只是“CPU 高不高”，而是 PG 连接数、cache 内存、queue backlog 和 embedding 成本。

## 范围

- config schema layering
- deprecated env / incompatible config detection
- config fingerprint
- profile-aware recommendations
- capacity budget for PG / cache / queue / embedding

## 任务 1：配置分层与验证

**重点文件**

- 修改：`packages/server/src/config.ts`
- 修改：相关 config helper / test
- 修改：`docs/operations/ENVIRONMENT.md`

- [ ] 定义 `core / service / distributed / experimental` 分层。
- [ ] 明确哪些配置是 planned 预留，哪些已经稳定实现。
- [ ] 补 incompatible config detection 与 deprecated env warning。

## 任务 2：配置可见性与 fingerprint

**重点文件**

- 修改：runtime metadata / status routes

- [ ] 为关键配置生成 config fingerprint。
- [ ] 在 operator/status 面暴露 profile-aware config summary。

## 任务 3：容量模型

**重点文件**

- 修改：相关 metrics / operator status / docs

- [ ] 为 PostgreSQL 连接池建立预算模型。
- [ ] 为 `knowledge-read` cache 内存占用建立预算模型。
- [ ] 为 queue backlog / handler latency 建立容量观察面。
- [ ] 为 embedding / rerank 成本建立基础 attribution 指标。

## 任务 4：验证与回写

- [ ] 跑 config parsing / validation / status 聚焦测试。
- [ ] 更新 `docs/operations/ENVIRONMENT.md`、`docs/reference/PERFORMANCE.md`、必要时更新 `docs/PACKAGES.md`。

**验收结果**

- TrapMap 的配置和容量模型具备可审计、可解释、可推荐的治理能力。

