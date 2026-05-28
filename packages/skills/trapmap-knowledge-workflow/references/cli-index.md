# TrapMap CLI 命令索引

> 紧凑索引，按代理工作流阶段组织。每行给出命令签名和最常用标志。
> 需要完整文档时参见 [`docs/architecture/CLI.md`](../../../docs/architecture/CLI.md)。
> 标志不确定时运行 `trapmap <command> --help` 获取权威帮助。

---

## 1. 会话与环境

```bash
trapmap login --access-key <key>                       # 访问密钥登录
trapmap login --system-admin-key <key>                 # 系统管理员密钥登录
trapmap logout                                         # 登出
trapmap session --json                                 # 查看当前会话（认证预检）
trapmap about                                          # 项目信息
trapmap --version                                      # CLI 版本
```

```bash
trapmap output profile show --json                     # 查看当前输出配置
trapmap output profile set --tool claude-code           # 设置工具配置
  # 可选工具：claude-code / codex / opencode / generic
  # 可选标志：--model <claude|generic> --verbosity <compact|balanced|detailed>
  #          --graph-plan-mode <summary|skill-list|full>
```

---

## 2. 检索与规划

```bash
# 技能内容检索（规划前，先技能后规划）
trapmap skill search-by-content "<seed>" --max-results 5 --json

# 陷阱+知识检索（实现前，先实现后检索）
trapmap search "<seed>" --mode semantic|hybrid|graph-assisted --max-results 5 --json
trapmap search "<seed>" --v2 --max-results 5 --json          # 胶囊原生检索

# v3 图检索-精简代理上下文（预格式化 Markdown）
trapmap load "<seed>" --json
  # 可选标志：--scope global|project --label <l> --skill-budget <n> --max-depth <n> --fallback <mode> --stdin
```

---

## 3. 知识注册

```bash
trapmap trap submit --scope global|project --label <l> --shortcut <text> [--detail <d>] [--json]
trapmap trap resubmit <id> --label <l> --shortcut <text> [--json]
trapmap trap list --json                               # 列出自己提交的陷阱
trapmap trap show <id> --json                          # 查看陷阱详情
trapmap supersede <id> --replacement <newId> --json    # 用新条目替代旧条目

trapmap import --file <path> --level <n> --json        # 导入技能目录或 SKILL.md
trapmap edit <id> --shortcut <t> --labels <l> --json   # 编辑已有条目
trapmap skill edit <artifactId> --title <t> --labels <l> --json  # 编辑技能工件
trapmap skill edit <artifactId> --file <path> --json   # 更新技能内容文件
```

---

## 4. 审核

```bash
trapmap review:queue --json                            # 知识审核队列
trapmap review:approve <id> --notes <n> --json         # 批准知识条目
trapmap review:reject <id> --notes <n> --json          # 拒绝知识条目

trapmap skill review:queue --json                      # 技能审核队列
trapmap skill review:approve <id> --notes <n> --json   # 批准技能工件
trapmap skill review:reject <id> --notes <n> --json    # 拒绝技能工件

trapmap skill duplicate-job fetch <candidateId> --json # 获取重复候选
trapmap skill duplicate-job resolve <candidateId> --decision independent|merged --notes <n> --json
trapmap skill duplicate-job apply-resolution <candidateId> --json
```

---

## 5. 工件导出与激活

```bash
trapmap artifact-export --artifact <id> --format bundle-json|distilled-json|skill-dir [--output <p>] --json
trapmap activate --artifact <id> --paths <files> [--output <p>] --json
trapmap deactivate <id> --reason <r> --json            # 停用条目
trapmap export [--output <p>] --json                   # 导出知识
```

---

## 6. 反馈

```bash
# 报告条目问题
trapmap feedback <entryId> --type incorrect|outdated|context-mismatch|incomplete|other \
  --description "<text>" [--context "<text>"] [--entry-type trap|skill] --json

# 管理反馈队列（管理员）
trapmap feedback-list --status new|triaged|resolved|dismissed [--type <t>] [--limit 25] --json

# 批量处理（管理员）
trapmap feedback-batch --action resolve|dismiss|triage --ids <ids> [--notes <n>] --json
trapmap feedback-batch --action transition --ids <ids> --transition-target <state> --json
```

---

## 7. 衰减与维护

```bash
# 衰减搜索
trapmap decay-search [pattern] --state active|review-due|stale|expired|superseded --json
trapmap decay-stale --state stale|expired [--age-min <d>] [--limit 25] --json

# 衰减批处理
trapmap decay-batch --action extend --entries <ids> --extend-days 30 --json
trapmap decay-batch --action mark-review --entries <ids> --json
trapmap decay-batch --action deactivate --entries <ids> --json
trapmap decay-batch --action supersede --entries <ids> --replacement <newId> --json

# 维护操作
trapmap maintenance-list --missing-owner|overdue|stale [--stale-days <d>] --json
trapmap maintenance-assign --entries <ids> --owner <uid> --json
trapmap maintenance-verify --entries <ids> [--extend-days 90] --json
```

---

## 8. 技能管理

```bash
trapmap skill search-by-content "<query>" [--max-results 10] --json
trapmap skill edit <artifactId> [--title <t>] [--labels <l>] [--file <p>] --json
trapmap skill history <artifactId> --json              # 版本历史
```

> 重复检测命令见 §4 审核中的 `skill duplicate-job` 子命令。

---

## 9. 运维与管理

```bash
trapmap list [--scope global|project] [--state <s>] [--max-level <n>] [--owner <uid>] --json
trapmap review-status [<id>] --json                    # 查看条目详情或提交历史
trapmap status [--team <id>] --json                    # 迁移兼容性状态
trapmap migrate --all-approved [--limit 50] --json     # 遗留知识迁移
trapmap audit [--limit <n>] [--json]                   # 审计日志

trapmap evidence:update <id> --level anecdotal|reproduced|documented|verified-in-prod \
  --type internal-experience|incident|doc|code|external-reference [--ref <r>] --json
trapmap admin:evidence [--level <l>|--missing] --json   # 按 evidence 状态列出

trapmap access-key:create <memberId> --team <teamId> [--note <t>] --json  # 创建访问密钥
trapmap team create|list|select                          # 团队管理
trapmap member create|update                             # 成员管理
trapmap policy resolve --default-policy <p> [--override-policy <p>] --json  # 策略解析
```
