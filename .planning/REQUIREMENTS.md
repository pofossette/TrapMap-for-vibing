# Requirements: Skill Shareer v1.2

**Defined:** 2026-04-16
**Core Value:** Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake

## v1.2 Requirements

本里程碑聚焦于把知识系统调整为更贴近 skill 生态的结构，同时保持 CLI 单种子输入体验和现有审批/权限边界。

### Skill Artifacts

- [ ] **ARTF-01**: 系统将 skill 目录作为一等导入对象，至少支持 `SKILL.md`、`references/`、`assets/`、`scripts/`
- [ ] **ARTF-02**: 服务端存储 skill artifact 元数据、文件清单、revision 与 source hash
- [ ] **ARTF-03**: skill artifact 生命周期继续受现有审批、scope、security level 与 audit 约束
- [ ] **ARTF-04**: 现有知识条目可迁移为最小 skill artifact，保留来源与审计链路

### 导入导出

- [ ] **IMEX-01**: CLI 支持从目录导入 skill artifact
- [ ] **IMEX-02**: CLI 支持导出标准 skill 目录，不强制包含 sidecar 私有元数据
- [ ] **IMEX-03**: 系统兼容单 `SKILL.md` 导入并自动包装为最小 artifact
- [ ] **IMEX-04**: 导入时对 `references/`、`assets/`、`scripts/` 建立清晰的索引与交付策略

### 检索与意图解析

- [ ] **RETR-01**: 客户端检索接口保持单一 `seed` 输入
- [ ] **RETR-02**: 服务端能从单种子中解析 `situation`、`problem`、`goal`、`errorText` 等内部意图字段
- [ ] **RETR-03**: 检索主对象从扁平 knowledge entry 演进为 skill-derived capsule
- [ ] **RETR-04**: 检索结果默认返回 distilled response，而不是完整 skill bundle
- [ ] **RETR-05**: activation response 能指出下一步应读取的 references、可用 scripts 和相关 assets

### Capsule 与索引

- [ ] **CAPS-01**: 系统从 `SKILL.md` 与 `references/` 派生 skill profile 与 knowledge capsules
- [ ] **CAPS-02**: `assets/` 不作为主要知识索引来源，文本资产如需进入模型上下文必须通过 `references/`
- [ ] **CAPS-03**: `scripts/` 不进入模型上下文，仅保留能力描述、参数与副作用元数据
- [ ] **CAPS-04**: 检索排序同时考虑问题匹配、情景匹配、stack/path boost 与治理边界

### 客户端激活与执行

- [ ] **ACTV-01**: 客户端可按 activation metadata 按需下载 references、assets 与 scripts
- [ ] **ACTV-02**: 脚本执行策略至少支持 `reference-only`、`needs-approval`、`client-executable`、`blocked`
- [ ] **ACTV-03**: 服务端永不执行 skill scripts，只返回策略、描述、文件引用与哈希信息
- [ ] **ACTV-04**: 客户端本地策略可以比服务端默认策略更严格，但不能更宽松

### 兼容性与边界

- [ ] **COMP-01**: `contracts` 继续作为 CLI 与 server 的唯一共享契约真源
- [ ] **COMP-02**: 现有 RBAC、审批、team scope、security level 与审计流程在 v1.2 中保持有效
- [ ] **COMP-03**: 旧 `/v1` 检索与知识接口在迁移阶段保留兼容路径
- [ ] **COMP-04**: v1.2 的新结构不引入服务端脚本执行、浏览器 UI 依赖或多模态检索要求

## v2 Requirements

延期到后续版本的特性。

### 后续增强

- **ACTV-20**: 客户端自动化沙箱编排与更细粒度运行时权限模型
- **RETR-20**: 多轮会话感知的 seed 演进检索
- **ASSET-20**: 富文本或多模态资源理解
- **DIST-20**: 跨团队 artifact 市场与共享治理

## Out of Scope

| Feature | Reason |
|---------|--------|
| 服务端直接执行 skill scripts | 破坏安全边界，增加 untrusted execution 风险 |
| 将 `assets/` 作为主要语义知识源 | 容易重新引入上下文污染，文本知识应显式进入 `references/` |
| 检索接口直接返回完整 bundle 作为默认模式 | 会再次放大上下文负担，违背 distilled-first 目标 |
| 新增面向最终用户的 Web UI | 当前产品仍以 CLI 和 agent 友好为主 |
| 多模态检索与图像理解 | 本里程碑继续专注文本知识与 skill 生态兼容 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARTF-01 | Phase 12 | Pending |
| ARTF-02 | Phase 12 | Pending |
| ARTF-03 | Phase 12 | Pending |
| ARTF-04 | Phase 16 | Pending |
| IMEX-01 | Phase 13 | Pending |
| IMEX-02 | Phase 13 | Pending |
| IMEX-03 | Phase 13 | Pending |
| IMEX-04 | Phase 13 | Pending |
| RETR-01 | Phase 14 | Pending |
| RETR-02 | Phase 14 | Pending |
| RETR-03 | Phase 14 | Pending |
| RETR-04 | Phase 14 | Pending |
| RETR-05 | Phase 15 | Pending |
| CAPS-01 | Phase 12 | Pending |
| CAPS-02 | Phase 12 | Pending |
| CAPS-03 | Phase 12 | Pending |
| CAPS-04 | Phase 14 | Pending |
| ACTV-01 | Phase 15 | Pending |
| ACTV-02 | Phase 15 | Pending |
| ACTV-03 | Phase 15 | Pending |
| ACTV-04 | Phase 15 | Pending |
| COMP-01 | All Phases | Pending |
| COMP-02 | All Phases | Pending |
| COMP-03 | Phase 16 | Pending |
| COMP-04 | All Phases | Pending |

**Coverage:**
- v1.2 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after v1.2 milestone definition*
