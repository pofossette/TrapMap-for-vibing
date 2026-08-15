# TrapMap Skills

项目级 Skill 工件，定义工作流、命令使用指南和智能体配置。

## 概述

Skills 是 TrapMap 的智能体工作流定义，用于指导 AI 助手如何正确使用 TrapMap 系统。每个 Skill 包含：
- `SKILL.md` — Skill 入口和核心指令
- `references/` — 详细参考文档
- `agents/` — 智能体配置（可选）

## 内容

### workflow-with-trapmap

TrapMap 工作流 Skill，定义了使用 TrapMap 进行知识管理的完整工作流程。

**核心流程：**
1. CLI 调用解析 — 优先使用 `trapmap` 命令
2. 检索门控 — 使用任务种子检索匹配的技能和陷阱
3. 陷阱约束 — 将匹配的陷阱视为硬性约束
4. 知识沉淀 — 保存可复用的经验
5. 反馈机制 — 报告不准确的检索结果
6. 维护检查 — 检查陷阱/技能的衰减状态

**引用文档：**
- [references/retrieval.md](workflow-with-trapmap/references/retrieval.md) — 认证预检、精确搜索命令、陷阱优先选择规则
- [references/registration.md](workflow-with-trapmap/references/registration.md) — 陷阱提交、技能导入和紧凑技能形状
- [references/review.md](workflow-with-trapmap/references/review.md) — 审核队列、批准/拒绝标准、重复解决方案
- [references/artifacts.md](workflow-with-trapmap/references/artifacts.md) — 导出、选择性激活、脚本策略
- [references/accumulation.md](workflow-with-trapmap/references/accumulation.md) — 策略基因风格的捕获
- [references/feedback.md](workflow-with-trapmap/references/feedback.md) — 反馈提交、队列查看、批量处理
- [references/maintenance.md](workflow-with-trapmap/references/maintenance.md) — 衰减生命周期、维护操作

### trapmap-cli-usage-guide

TrapMap CLI 使用指南 Skill，提供紧凑的命令索引。

**何时加载：**
- 需要确认命令签名、标志或命令族映射时
- 需要检查输出配置、JSON 模式或代理兼容设置时
- 命令不确定时，先运行 `trapmap --help`

**引用文档：**
- [references/cli-index.md](trapmap-cli-usage-guide/references/cli-index.md) — 按工作流阶段组织的 TrapMap CLI 紧凑索引

## 使用方式

### 在 Claude Code 中加载

Skills 可以通过 Claude Code 的 skill 系统加载：

```bash
# 加载工作流 Skill
/workflow-with-trapmap

# 加载 CLI 使用指南
/trapmap-cli-usage-guide
```

### 在智能体中引用

Skills 可以被智能体引用，用于指导工作流程：

```markdown
参考 packages/skills/workflow-with-trapmap/SKILL.md 中的控制路径。
```

## 设计原则

1. **检索门控** — 使用 TrapMap 检索匹配的技能和陷阱，而不是凭记忆工作
2. **陷阱优先** — 将匹配的陷阱视为硬性约束，优先于技能指导
3. **紧凑引用** — 只加载当前操作所需的引用，避免上下文膨胀
4. **权威来源** — CLI 帮助文本和源码比 Skill 更权威
5. **反馈驱动** — 发现不准确的检索结果时，通过反馈机制报告

## 护栏

- 使用 `trapmap --help` 或 `trapmap <command> --help` 验证不确定的命令
- 代理对代理/工具解析时优先使用 JSON 输出
- 不要将原始聊天日志、秘密、访问密钥、私有路径或庞大的文档粘贴到可复用知识中
- 不要天真地组合许多技能。单一针对性技能加上显式 `AVOID` 警告通常比大量部分相关指导的捆绑更强大
- 输出配置不确定时，使用 `trapmap output profile set --tool <tool>` 匹配代理环境

## 相关包

- `@trapmap/cli` — TrapMap CLI 工具
- `@trapmap/client-core` — 客户端共享的网关传输层
- `@trapmap/contracts` — 共享类型契约

## 验证

```bash
# 测试 Skill 导入导出
pnpm test:import-export

# 验证 Skill 结构
pnpm check:structure
```
