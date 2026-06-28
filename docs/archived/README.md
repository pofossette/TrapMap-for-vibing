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

## 归档原则

文档归档而非删除，保留历史决策背景供参考。归档文档不应被其他文档引用。

当前根 `plan.md` 已完成“健壮性与可扩展性收尾”；数据埋点增强、轻重后端构建目标、组件替换等旧主线保留在归档计划与 `docs/todos/` 细则中，供后续实施时参考，但不再由根 `plan.md` 跟踪。若后续需要新增 operator/debug surface、平台化或部署形态扩张，应新开独立审计或独立计划，而不是回写这些归档主线。
