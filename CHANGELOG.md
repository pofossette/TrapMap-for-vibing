# 更新日志

所有重要的版本更新都会记录在此文档中。

## v1.4 (2026-04-29)

**评测系统构建**

### 检索评估
- 检索评估系统，支持排名指标（Hit@K、MRR、nDCG、Recall@K）
- 治理失败检测，针对黄金数据集
- CI 回归检测，基线对比、队列报告

### 摘要评估
- LLM-as-Judge 基于检索上下文的接地性和覆盖度评分
- smoke/core 评估工作流

### 索引与检索
- GraphRAG-lite 索引
- Trap-First 计划编译
- 置信度感知路由（`/v3` 检索端点）
- v3 检索管道（语义 / 混合 / 图增强）

### 异步摄取
- 候选异步摄取管道
- 重复检测队列
- 技能/陷阱去重 CLI 工作流

### 持久化
- PostgreSQL/Drizzle ORM 替代文件存储
- 共享 SkillShareerStore 合约

### 日志
- 用户操作 JSON Lines 文件日志
- RAG 检索管道日志
- 基于文件大小的日志轮转

---

## v1.3 (2026-04-20)

**工程化调整、功能扩展及优化**

### 部署
- Docker 配置和部署脚本

### 技能检索
- 技能查找 Schema（artifact-first lookup）
- CLI `skill search-by-content` 命令
- 工件级目录导入，canonical bundle-json 传输

### 日志
- 用户操作记录器（JSON Lines 文件输出，环境变量开关）
- RAG 检索日志模块
- 文件大小轮转（用户操作日志 + RAG 日志）

### 验证
- SKED-01 至 SKED-04 目标反向验证
- LOG-01 至 LOG-04 需求确认
- Nyquist 合规 VALIDATION.md

---

## v1.2 (2026-04-17)

**Skill-Native Retrieval**

### Schema
- 技能原生工件共享合约（file-kind 区分：skill-markdown、reference、asset、script）
- 四状态脚本激活策略模型

### 检索
- Seed-only v2 检索 Schema
- 服务端 parsed-intent 解析
- Capsule 级派生和排名，治理执行
- 元数据激活提示（read-next 引用、可用资产、可执行脚本）

### 迁移
- 确定性传统知识到最小工件的迁移
- 治理边界保持不变
- v1/v2 治理等效验证

---

## v1.0 (2026-04-14)

**MVP 交付**

### 基础设施
- TypeScript monorepo 引导，根工具层
- CLI、Server、Contracts 包
- v1 共享 Schema（auth、teams、knowledge、review、retrieval、operations）

### 认证与会话
- 服务端认证和会话持久化
- Active Team 机制

### 团队管理
- 团队创建、成员加入和更新
- 访问密钥发放
- RBAC 权限执行

### CLI
- 权限感知命令可见性
- 认证客户端
- `knowledge submit`、`knowledge inspect`、`knowledge list` 命令

### 知识管理
- 提交历史保留
- 审核历史和决策时间线
- LangChain AI 预审（重复、正确性、完整性风险）
- 人工审核（通过/拒绝）及备注
- 修正后重新提交，保留历史

### 检索
- Embeddings 后台检索管道
- 资格过滤、确定性回退
- CLI `search` 命令，支持 Shell 友好输入、权限过滤、文本/JSON 输出格式

### 管理员功能
- 知识列表、编辑、停用
- 批量导入/导出，验证和重复检测
- 审核、导入、导出、停用操作审计日志

---

## 早期版本

