# 归档文档

本目录存放已过时但保留作历史参考的文档。

## 归档文件

| 文件 | 归档日期 | 归档原因 |
|------|----------|----------|
| `retrieval-structure-adjustment.md` | 2026-05-06 | v1.x 早期检索架构调整决策背景，已整合入主架构文档 `docs/architecture/RETRIEVAL.md` |
| `archived-plans/plan.md` | 2026-05-06 | 短期库化改造计划，已过时 |
| `archived-plans/plan-2026-05-28-doc-drift-audit-and-alignment-active-root.md` | 2026-05-28 | 旧根 `plan.md`，已由目录结构治理计划替代 |
| `archived-plans/plan-2026-05-29-directory-structure-governance.md` | 2026-05-29 | 旧根目录结构治理计划，根 `plan.md` 现只保留 FM-agent 扫描修复索引 |
| `archived-plans/retrieval-v2-v3-implementation-plan.md` | 2026-05-28 | 历史检索实现计划，根目录只保留当前 `plan.md` |
| `temp-2026-05-28.md` | 2026-05-28 | 临时工作笔记，根目录不保留临时材料 |
| `reports/doc-drift-audit-report-2026-05-28.md` | 2026-05-28 | 文档漂移审计报告，已从旧 `docs/archive/` 合并 |
| `reports/doc-drift-audit-report-2026-05-28-cont.md` | 2026-05-28 | 文档漂移补充报告，已从旧 `docs/archive/` 合并 |
| `archived-plans/old-plan-back-2026-05-28.md` | 2026-05-28 | 历史根计划备份，已合并到标准 archived-plans |
| `archived-plans/plan-2026-06-26-nestjs-service-evolution-phase4-index-archived.md` | 2026-06-26 | 根 `plan.md` 已切换为组件替换主线，NestJS / 服务演进索引退回历史参考 |
| `archived-plans/plan-2026-06-27-component-replacement-index-archived.md` | 2026-06-27 | 根 `plan.md` 已切换为轻重后端构建目标主线，组件替换计划退回历史参考 |
| `archived-plans/plan-2026-06-28-backend-build-targets-index-archived.md` | 2026-06-28 | 根 `plan.md` 已切换为数据埋点增强主线，轻重后端构建目标索引退回历史参考 |
| `archived-plans/plan-2026-06-28-instrumentation-observability-index-archived.md` | 2026-06-28 | 根 `plan.md` 已切换为健壮性与可扩展性收尾主线，数据埋点增强索引退回历史参考 |
| `archived-plans/plan-2026-06-28-robustness-scalability-closeout-index-archived.md` | 2026-06-28 | 根 `plan.md` 已切换为架构整改主线，健壮性与可扩展性收尾索引退回历史参考 |
| `archived-plans/trapmap-architecture-remediation-plan.md` | 2026-06-29 | 架构整改主线 Phase 0-7 全部完成，归档 |
| `archived-plans/robustness-scalability-closeout-plan.md` | 2026-06-29 | 健壮性与可扩展性收尾已完成，历史参考 |
| `archived-plans/badcase-feedback-loop.md` | 2026-06-29 | badcase 回流闭环已完成，历史参考 |
| `archived-plans/backend-engineering-optimization-plan.md` | 2026-06-29 | 85% 完成，剩余 1 项（异步任务队列迁移）转入 debt register 跟踪 |
| `archived-plans/instrumentation-observability-plan.md` | 2026-06-29 | 45% 完成，不再由根计划跟踪，Phase 2-4 保留为背景参考 |
| `archived-plans/component-replacement-plan.md` | 2026-06-29 | 5% 完成，5 个库替换均未启动，退回背景参考 |
| `archived-plans/nestjs-service-evolution-00-target-architecture.md` | 2026-06-29 | 目标架构冻结已完成，历史参考 |
| `archived-plans/nestjs-service-evolution-03-service-extraction-and-async.md` | 2026-06-29 | 状态 proposed，0% 完成，退回背景参考 |
| `archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md` | 2026-06-29 | 评估本身完成，Level 3/4 升级判据保留为前瞻性参考 |
| `archived-plans/nestjs-service-evolution-knowledge-write-governance-review-pilot.md` | 2026-06-29 | 状态 proposed，0% 完成，成熟服务样板规划退回背景参考 |
| `archived-plans/nestjs-service-evolution-knowledge-write-governance-review-preflight-checklist.md` | 2026-06-29 | 状态 proposed，0% 完成，样板实施前检查表退回背景参考 |
| `archived-plans/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md` | 2026-06-29 | 状态 proposed，0% 完成，样板代码迁移任务列表退回背景参考 |
| `archived-plans/plan-2026-06-30-backend-build-targets-root-index-archived.md` | 2026-06-30 | 根 `plan.md` 已切换为微服务平台能力增强主线，旧轻重后端构建目标根索引归档 |

## 归档原则

文档归档而非删除，保留历史决策背景供参考。归档文档不应被其他文档引用。

当前根 `plan.md` 已切换为“微服务平台能力增强”主线；旧轻重后端构建目标根索引已归档。健壮性与可扩展性收尾、数据埋点增强、轻重后端构建目标、组件替换与更早的架构整改主线都保留在归档计划与 `docs/todos/` 背景文档中，供后续审计或 deferred 议题参考，但不承担当前执行面，也不再由根 `plan.md` 跟踪。若后续继续深入这些旧主线主题，应新开独立计划或转入当前活跃细则显式声明的 deferred 落点。
