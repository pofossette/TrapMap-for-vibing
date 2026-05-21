# TrapMap 数据库修复与调整计划（归档）

本文件归档自根目录 `plan.md`，归档日期：2026-05-21。

归档原因：
- Round 1 - Round 8 的数据库结构化主线已经完成到可交付状态。
- Skill Artifact 的 Round 4 也已完成结构化真表落地，`skill_artifacts` / `artifact_revisions` 上的 JSONB 字段已降级为兼容缓存。
- 后续工作重点不再是“数据库结构重构”，而是“跨表一致性增强”和“端到端集成测试补齐”。

后续请以新的根目录 `plan.md` 为准。

---

