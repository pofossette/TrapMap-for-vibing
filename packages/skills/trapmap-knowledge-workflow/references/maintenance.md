# 衰减与维护

知识条目有生命周期衰减。使用这些命令检查和管理条目的新鲜度。

## 衰减状态机

```
active → review-due → stale → expired → superseded
```

- `active`：新鲜且已验证。
- `review-due`：即将需要重新审核。
- `stale`：已过验证期限，内容可能过时。
- `expired`：已过期，应考虑替代或停用。
- `superseded`：已被新条目替代。

## 检查衰减状态

```bash
trapmap decay-search "关键词" --state stale,expired --json
trapmap decay-stale --state expired --limit 25 --json
trapmap decay-stale --state stale --age-min 90 --json
```

## 衰减批处理

```bash
# 延长条目生命周期
trapmap decay-batch --action extend --entries <ids> --extend-days 30 --json

# 标记为需要审核
trapmap decay-batch --action mark-review --entries <ids> --json

# 停用过时条目
trapmap decay-batch --action deactivate --entries <ids> --json

# 用新条目替代旧条目
trapmap decay-batch --action supersede --entries <ids> --replacement <newId> --json
```

所有批处理命令支持 `--dry-run` 预览。

## 维护操作

列出需要关注的条目：

```bash
trapmap maintenance-list --missing-owner --json        # 无维护者
trapmap maintenance-list --overdue --json              # 审核逾期
trapmap maintenance-list --stale --stale-days 90 --json # 验证过期
```

分配维护者：

```bash
trapmap maintenance-assign --entries <ids> --owner <userId> --json
```

标记重新验证：

```bash
trapmap maintenance-verify --entries <ids> --extend-days 90 --json
```

## 代理使用指引

- 在使用可能过时的陷阱前，先用 `decay-search` 检查状态。
- 如果发现 stale/expired 条目，优先报告反馈（参见 [feedback.md](feedback.md)）或寻找替代。
- 不要忽略 decay 警告：过时的陷阱可能导致错误的修复方案。
- 维护操作（assign、verify）通常由人工管理员执行，代理仅需报告和搜索。
