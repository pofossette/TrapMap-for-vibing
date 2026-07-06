# 文档漂移修复清单

> 自动生成于 2026-07-06，基于 13 个 subagent 并行校验结果汇总。

## 统计概览

| 类别 | 数量 |
|------|------|
| 英文文档需翻译 | 24 |
| 内容漂移问题 | 48 |
| 高严重程度 | 15 |
| 中严重程度 | 22 |
| 低严重程度 | 11 |

---

## 一、英文文档翻译清单（24 个文件）

### 1.1 packages/*/README.md（12 个）
- `packages/backend-core/README.md` — EN，结构不完整需先补充再翻译
- `packages/client-core/README.md` — EN
- `packages/host-distributed/README.md` — EN
- `packages/host-local/README.md` — EN，有错误配置项需同步修正
- `packages/runtime-infra/README.md` — EN，内容为 stub 需重写
- `packages/service-candidate-ingestion/README.md` — EN
- `packages/service-governance-review/README.md` — EN，有断链需同步修正
- `packages/service-identity-access/README.md` — EN
- `packages/service-job-runtime/README.md` — EN
- `packages/service-knowledge-read/README.md` — EN，内容为 stub 需重写
- `packages/service-knowledge-write/README.md` — EN，有断链和缺失 RPC 端点文档
- `packages/web-panel/README.md` — EN

### 1.2 docs/architecture/（5 个）
- `docs/architecture/DATABASE_OWNERSHIP.md`
- `docs/architecture/MODULE_STRUCTURE.md` — 有断引用需同步修正
- `docs/architecture/RECOMPOSITION_SUMMARY.md`
- `docs/architecture/SERVICE_BOUNDARIES.md` — 有不存在的包引用需修正
- `docs/architecture/TARGET_ARCHITECTURE.md` — 有不存在的包引用需修正

### 1.3 docs/guides/（1 个）
- `docs/guides/MIGRATION_GUIDE.md` — 有不存在的脚本引用需修正

### 1.4 docs/reference/（3 个）
- `docs/reference/DOCS_TRUTH_MATRIX.md` — 部署权威源描述不一致
- `docs/reference/REPO_STRUCTURE.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md` — 多个断引用需同步修正

### 1.5 docs/operations/（3 个）
- `docs/operations/PROMPT_CACHING.md`
- `docs/operations/PROMPT_PROVIDERS.md`
- `docs/operations/VALIDATION_MATRIX.md`

---

## 二、高严重程度问题（15 个）

### H-01: README.md 健康检查响应示例已过时
- **文件**: `README.md`
- **描述**: Health check 响应示例展示 `{status, product, packages, memory, uptimeSeconds}`，但实际响应为 `{status, liveness, readiness, dependencies, snapshot, uptime}`。
- **修复**: 更新 JSON 示例为当前 contract shape。

### H-02: contracts/README.md 不变量约束方向描述错误
- **文件**: `packages/contracts/README.md`
- **描述**: Cross-Field Invariant Constraints 表中多处不变量方向与源码相反：`importResultItemSchema`、`decayResultSchema`、`decayApplicationResultSchema`、`maintenanceMetaSchema`。

### H-03: contracts/README.md 引用不存在的 Schema 名称
- **文件**: `packages/contracts/README.md`
- **描述**: `decayResultSchema` 和 `decayApplicationResultSchema` 不存在，应为 `batchOperationItemSchema` 和 `batchOperationResponseSchema`。

### H-04: host-local/README.md 环境变量名错误
- **文件**: `packages/host-local/README.md`
- **描述**: 文档列出 `DATABASE_URL`，代码实际读取 `TRAPMAP_DATABASE_URL`。

### H-05: runtime-infra/README.md 是空壳
- **文件**: `packages/runtime-infra/README.md`
- **描述**: README 仅 5 行，实际导出 13 个模块未文档化。

### H-06: service-knowledge-read/README.md 是空壳
- **文件**: `packages/service-knowledge-read/README.md`
- **描述**: 仅一行描述，实际包含 30+ 源文件和 30+ 导出符号。

### H-07: ENVIRONMENT.md 文档化了不存在的环境变量
- **文件**: `docs/operations/ENVIRONMENT.md`
- **描述**: `TRAPMAP_CONSUL_*`/`TRAPMAP_LOKI_*` 在代码中不存在，实际用 `CONSUL_ENABLED`/`CONSUL_HOST`/`CONSUL_PORT`/`LOKI_HOST`。

### H-08: DATABASE_SCHEMA.md 表数量和迁移记录严重过时
- **文件**: `docs/reference/DATABASE_SCHEMA.md`
- **描述**: 声称 57 表实际 63 表，迁移仅列 0000-0012 实际到 0019。

### H-09: SYSTEM_TRUTH_SOURCES.md 多个权威源引用指向已归档文件
- **文件**: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- **描述**: 3 个引用指向 `docs/todos/` 下已归档文件。

### H-10: SYSTEM_TRUTH_SOURCES.md 引用不存在的源文件
- **文件**: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- **描述**: 引用 `service-compat.ts`、`check-deps.ts`、`check-mermaid` 均不存在。

### H-11: service-governance-review/README.md 断链
- **文件**: `packages/service-governance-review/README.md`
- **描述**: 3 个链接指向已归档路径。

### H-12: service-knowledge-write/README.md 断链
- **文件**: `packages/service-knowledge-write/README.md`
- **描述**: 3 个链接指向已归档路径。

### H-13: service-knowledge-write/README.md 缺失 RPC 端点文档
- **文件**: `packages/service-knowledge-write/README.md`
- **描述**: `POST /internal/rpc/knowledge-write` 端点未文档化。

### H-14: host-distributed/README.md 断链
- **文件**: `packages/host-distributed/README.md`
- **描述**: 引用已归档文件路径。

### H-15: GLOSSARY.md 路由引用指向已删除文件
- **文件**: `docs/reference/GLOSSARY.md`
- **描述**: 引用已删除的 `packages/server/src/routes/review.ts`。

---

## 三、中严重程度问题（22 个）

| ID | 文件 | 描述 |
|----|------|------|
| M-01 | `README.md` | 项目结构树缺少 `packages/runtime-infra/` |
| M-02 | `architecture.md` | 包结构表缺少 `packages/runtime-infra/` |
| M-03 | `packages/backend-core/README.md` | 目录结构缺少 `discovery/` 目录 |
| M-04 | `packages/backend-core/README.md` | ports/ 遗漏 3 个文件 |
| M-05 | `packages/backend-core/README.md` | runtime/ 遗漏 2 个文件 |
| M-06 | `packages/host-local/README.md` | `RUNTIME_MODE` 文档化为环境变量但代码中不读取 |
| M-07 | `packages/server/README.md` | Hotspot 表测试路径不准确 |
| M-08 | `docs/architecture/MODULE_STRUCTURE.md` | Barrel #7 引用已删除的 `recall/index.ts` |
| M-09 | `docs/architecture/SERVICE_BOUNDARIES.md` | gateway 映射到不存在的 `packages/service-gateway` |
| M-10 | `docs/architecture/TARGET_ARCHITECTURE.md` | 包布局树包含不存在的 `service-gateway/` |
| M-11 | `docs/guides/MIGRATION_GUIDE.md` | 引用 4 个不存在的 rollback 脚本 |
| M-12 | `docs/operations/SECURITY.md` | 链接锚点 `API.md#认证端点` 不匹配 |
| M-13 | `docs/operations/TESTING.md` | 链接锚点 `API.md#检索端点` 不存在 |
| M-14 | `docs/operations/CI_CD.md` | `fallow list --boundaries` 应为 `fallow dead-code --boundary-violations` |
| M-15 | `docs/operations/OBSERVABILITY-VERIFICATION.md` | 使用错误的 `TRAPMAP_LOKI_*` 变量名 |
| M-16 | `docs/reference/DATABASE_SCHEMA.md` | 迁移头部注释声称最新为 0015 实际为 0019 |
| M-17 | `docs/reference/DOCS_TRUTH_MATRIX.md` | Deployment 权威源与 SYSTEM_TRUTH_SOURCES 不一致 |
| M-18 | `docs/reference/GLOSSARY.md` | 「JSON Store」条目引用不存在的文件 |
| M-19 | `docs/reference/GLOSSARY.md` | 「Retrieval」条目引用已删除的 `recall/index.ts` |
| M-20 | `packages/service-knowledge-read/README.md` | 缺失 HTTP 端点文档 |
| M-21 | `packages/service-candidate-ingestion/README.md` | 缺失 HTTP 端点文档 |
| M-22 | `docs/guides/CODE_GUIDE.md` | 末尾段落使用英文 |

---

## 四、低严重程度问题（11 个）

| ID | 文件 | 描述 |
|----|------|------|
| L-01 | `AGENTS.md` | 「活跃文档只有两个」的声明不准确 |
| L-02 | `README.md` | `packages/skills/` 列为包但无 `package.json` |
| L-03 | `packages/host-local/README.md` | `TRAPMAP_DEPLOYMENT_PROFILE` 默认值描述不准确 |
| L-04 | `packages/host-local/README.md` | 未文档化导出的 TypeScript 接口 |
| L-05 | `packages/backend-core/README.md` | bounded-context 列表写 `review` 应为 `governance-review` |
| L-06 | `packages/runtime-infra/README.md` | 将类型接口描述为独立模块有误导性 |
| L-07 | `packages/service-identity-access/README.md` | 仅一行描述缺失模块文档 |
| L-08 | `packages/service-job-runtime/README.md` | 仅一行描述缺失模块文档 |
| L-09 | `docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md` | 重复 "Blocking gaps:" 标题 |
| L-10 | `packages/contracts/README.md` | maintenance 同构 schema 不变量未覆盖 |
| L-11 | `docs/reference/SYSTEM_TRUTH_SOURCES.md` | `check-mermaid` 脚本引用不确定 |
