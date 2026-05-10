# 术语表

本文档定义 TrapMap 项目中的专用术语及其含义。

## 核心概念

### Trap（陷阱）

工程经验的一种，指团队成员曾经犯过的错误或踩过的坑。TrapMap 名称中的 "Trap" 即指此概念。

**示例**：忘记在生产环境禁用调试日志、数据库连接未配置连接池等。

### Skill（技能/技能工件）

已验证可行的工程经验或最佳实践，以结构化目录形式存储。包含 SKILL.md（核心内容）、references/（参考资料）、assets/（资产文件）、scripts/（可执行脚本）。

### Knowledge Entry / Knowledge（知识条目）

系统中可检索的知识单元，对应 `KnowledgeEntry` 数据实体。可能是 Trap 或经批准的 Skill。

### Pitfall（陷阱/误区）

与 Trap 类似，指工程师容易犯错或存在误解的地方。

---

## 检索相关

### Retrieval（检索）

在知识库中搜索相关内容的过程。TrapMap 支持多种检索模式：

- **Semantic（语义检索）**：基于向量嵌入的语义相似度匹配
- **Keyword（关键词检索）**：BM25/词法匹配
- **Graph-Assisted（图增强检索）**：利用知识图谱关系扩展检索结果
- **Hybrid（混合检索）**：语义 + 关键词的混合模式

### Capsule（技能胶囊）

从 Skill 工件中精炼提取的结构化知识单元，包含 situation/problem/goal/errorText 字段，用于检索和展示。

**与 Profile 的区别**：Capsule 用于检索匹配；Profile 用于模型上下文。

### Profile（技能画像）

从 SKILL.md 和 references/ 导出的文摘，包含标题、描述、摘要、关键词等，用于模型上下文组装。

### Manifest（客户端清单）

Skill 工件的客户端激活元数据，包含 references、assets、scripts 的文件元信息（不含内容体）。

### Rerank（重排）

在初步检索结果基础上，使用更精确的模型或策略对结果进行重新排序。

### Hit@K

检索评估指标，考察前 K 个结果中是否包含相关结果。

### MRR（Mean Reciprocal Rank）

平均倒数排名，检索评估指标。

### nDCG（Normalized Discounted Cumulative Gain）

归一化折损累计增益，检索质量评估指标。

---

## 生命周期

### Lifecycle State（生命周期状态）

知识条目或技能工件的状态流转：

```
draft → submitted → agent-pass/agent-rejected
                        ↓               ↓
                    approved        rejected
                        ↓               ↓
                   (可更新)      (可 resubmit)
```

### Agent Review（AI 预审）

提交后由 AI（LangChain）进行的自动预审，评估重复风险、正确性风险、完整性风险。

### Resubmit（重新提交）

被拒绝的知识条目修正后重新提交，保留原有历史。

---

## 摄取管道

### Candidate（候选提交）

异步摄取管道的入口实体，包含 trap（知识条目）或 skill（技能工件）类型的原始载荷。

### Duplicate Case（去重案例）

候选提交进入去重检测后生成案例，记录与现有条目的相似度匹配，供人工裁定。

### Manual Resolution（人工裁定）

去重案例的解决方式：`independent`（候选独立存在）或 `merged`（合并到现有实体）。

---

## 反馈与维护

### Feedback（反馈）

用户对知识条目的问题反馈。状态机：`new` → `triaged` → `resolved` / `dismissed`。当同类反馈达到阈值时，系统自动标记条目进入相应生命周期状态。

### Decay（衰减）

知识条目的新鲜度追踪机制。状态：`active` → `review-due` → `stale` → `expired`（或 `superseded`）。衰减曲线由 freshnessType 决定：`evergreen`（长期有效）、`versioned`（随版本更新）、`volatile`（快速过期）。

### Maintenance（维护）

知识条目的责任追踪机制。记录维护者（`maintainer`）和计划审核日期（`reviewBy`），支持批量分配、延长审核、标记已验证等操作。

### Evidence（证据）

知识条目的来源证明元数据。包含来源类型（`sourceType`：如 `internal-experience`、`stack-overflow`、`github-issue`、`official-docs`）和证据级别（`evidenceLevel`：`anecdotal` → `tested` → `verified` → `authoritative`）。

### Boundary（边界约束）

知识条目的适用范围约束，定义条目在哪些上下文、平台版本、前置条件下有效。用于边界搜索（`/admin/boundary-search`）和检索过滤。

---

## 权限与安全

### RBAC（基于角色的访问控制）

Role-Based Access Control。TrapMap 使用角色模板（user/admin/system-admin）和细粒度权限列表结合的方式进行访问控制。

### Security Level（安全等级）

0-10 的数值等级，控制对敏感知识条目的访问。数值越高，可访问的内容越敏感。

### Scope（作用域）

知识的作用域：`global`（全局共享）或 `project`（仅项目内可见）。

---

## 评估

### Smoke Test（冒烟测试）

快速、轻量的测试集，用于每次提交时快速验证核心功能是否正常。

### Core Test（核心测试）

更全面的测试集，覆盖更多边界情况和场景。

### Governance Failure（治理失败）

检索返回了不应返回的结果（如权限不足、安全等级不够、生命周期状态不对）。

### Groundedness（接地性）

摘要评估指标，衡量摘要内容是否由检索到的上下文支撑（无幻觉）。

### Coverage（覆盖度）

摘要评估指标，衡量摘要是否涵盖了检索上下文中的关键信息。

---

## 数据模型

### EntityId

所有实体的唯一标识符，最大 128 字符的字符串。

### ActorRef

操作行为者引用，包含 `id`、`handle`、`securityLevel`。

### Label（标签）

知识条目的分类标签，格式：`a-z0-9:_/-` 的组合，最大 48 字符。

---

## 其他

### Skill Directory（技能目录）

Skill 工件的磁盘存储结构：

```
<skill-slug>/
├── SKILL.md           # 核心内容（必选）
├── references/        # 参考资料（可选）
├── assets/            # 资产文件（可选）
└── scripts/          # 可执行脚本（可选）
```

### Artifact（工件）

等同于 Skill Artifact，指以目录形式存储的技能知识单元。

### Fallback（回退）

检索请求无法以首选模式处理时，降级到备选方案的过程（如 GraphRAG-lite 低置信度时回退到 v2 capsule 检索）。

### JSON Store

开发/测试环境使用的 JSON 文件存储实现（`JsonStore`）。

### Postgres Store

生产环境使用的 PostgreSQL + Drizzle ORM 存储实现（`PostgresStore`）。

### Activation Policy（激活策略）

脚本执行策略的四状态模型：`blocked`（禁止）→ `reference-only`（仅可读）→ `needs-approval`（需批准）→ `client-executable`（可执行）。客户端只能收紧策略，不能放松。

### Entity Lineage（实体谱系）

候选提交从接收到发布为正式实体的完整追踪链，记录每一步的状态转换和关联实体。

### Tool Profile（工具配置）

CLI 输出渲染的目标工具类型：`claude-code`（XML 输出）、`codex`（JSON 输出）、`opencode`（Markdown 输出）、`generic`（纯文本输出）。

### Render Kind（渲染类型）

CLI 输出适配层的渲染分类：`retrieval-v1`、`retrieval-v2`、`graph-plan`、`skill-lookup`、`artifact-export`、`command-result`、`generic`。
