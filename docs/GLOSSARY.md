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
