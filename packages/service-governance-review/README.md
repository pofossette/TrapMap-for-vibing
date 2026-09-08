# `@trapmap/service-governance-review`

你用这个服务模块承载治理命令流水线（审核决策、反馈、冲突、补救、维护与衰减），最终聚合变更一律委托写侧。

## 入口

主入口为 `packages/service-governance-review/src/index.ts`，服务装配见 `packages/service-governance-review/src/deps.ts`，Fastify 工厂见 `packages/service-governance-review/src/server.ts`，冲突检测见 `packages/service-governance-review/src/conflict-trigger/rule-conflict-trigger.ts`，冲突读取见 `packages/service-governance-review/src/conflict-read.ts`，迁移见 `packages/service-governance-review/src/migrations.ts`。

| 命令 | 委托目标 |
| --- | --- |
| `approve` / `reject` | `KnowledgeWritePort.approveReviewDecision` / `rejectReviewDecision` |
| `applyMaintenance` / `applyDecay` | `KnowledgeWritePort` 对应决策方法 |
| 候选发布 | `candidate-ingestion` 经 `KnowledgeWritePort.publishCandidateResult` 拥有，本包不拥有该路径 |

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/backend-core` | 端口契约与模块底座 |
| `@trapmap/contracts` | 审核、反馈、冲突 schema |
| `@trapmap/db` | 表定义 |
| `@trapmap/ai-providers` | LLM 辅助判断变体 |
| `@trapmap/lib` | 纯函数工具 |
| `drizzle-orm` / `pg` / `fastify` / `zod` | 数据访问、服务框架、校验 |
| `build` / `typecheck` / `test` | 编译 / 校验 / 单元测试 |

批准 / 拒绝后的投影刷新、工件跟进等动作全部走异步队列，job-runtime 拥有传输、租约与死信。

路由（定义见 `src/routes/`，`maintenance`/`feedback`/`admin`/`queue`/`json-edit`/`runtime`）：

| 方法+路径 | 用途 |
| --- | --- |
| `POST /internal/review/approve`、`/reject`、`/maintenance`、`/decay` | 批准/拒绝/维护/衰减决策 |
| `POST /internal/review/return-for-correction` | 待核实（OLD 未列，当前代码存在） |
| `POST /internal/review/artifact`、`POST /internal/conflicts/detect` | 工件评审、冲突检测 |
| `POST /internal/feedback`、`GET /internal/feedback/admin` 等 | 反馈提交与管理后台 |
| `POST /internal/feedback/async/*` | 补救激活、badcase 导出草稿 |
| `POST /internal/governance-review/retrieval-projection` | 按 entry IDs 列反馈与冲突 |
| `GET /internal/health`、`/live`、`/readiness`、`/ready`、`/ownership`、`/operator-status` | 健康/就绪/归属/运营诊断 |

错误分类（`InvocationError`，与 knowledge-write 统一）：`validation`→400、`forbidden`→403、`not-found`→404、`conflict`→409、`unavailable`→503、`timeout`→504。

## 常见用法

### 跑本包测试

```bash
pnpm --filter @trapmap/service-governance-review test
pnpm --filter @trapmap/service-governance-review typecheck
```

### 跟一条审核决策的委托链

你从 `packages/service-governance-review/src/conflict-read.ts` 读冲突现状，再看上文委托表找到对应的 `KnowledgeWritePort` 方法，最后在写侧确认聚合变更。不要在本包内直接改知识状态。
