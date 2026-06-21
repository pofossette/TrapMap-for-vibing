# 反馈

当检索到的陷阱或技能不准确、过时或不匹配上下文时，使用反馈工作流。`local-agent` 与团队部署现在都支持这条质量闭环；反馈不应阻塞当前任务，提交后继续工作。

## 何时提交反馈

- 检索结果中的信息已过时或不正确。
- 推荐的技能与当前上下文不匹配。
- 陷阱的修复方案不适用于当前情况。
- 检索到的内容缺少关键的 `AVOID` 警告。

## 提交反馈

```bash
trapmap feedback <entryId> \
  --type outdated|incorrect|context-mismatch|incomplete|other \
  --description "描述问题（至少10字符）" \
  --context "当前任务上下文" \
  --entry-type trap|skill \
  --query-seed "导致此条目的检索查询" \
  --json
```

`--type` 值：

- `outdated`：信息曾经正确但已过时。
- `incorrect`：信息根本性错误。
- `context-mismatch`：信息正确但不适用于当前场景。
- `incomplete`：信息不完整，缺少关键细节。
- `other`：其他问题。

## 查看反馈队列（管理员）

```bash
trapmap feedback-list --status new [--limit 25] --json
trapmap feedback-list --type outdated --limit 50 --json
```

可按 `--status`（new / triaged / resolved / dismissed）、`--type`、`--entry`、`--min-age`、`--max-age` 过滤。

## 批量处理反馈（管理员）

```bash
trapmap feedback-batch --action resolve --ids <id1>,<id2> --notes "原因" --json
trapmap feedback-batch --action dismiss --ids <ids> --notes "原因" --json
trapmap feedback-batch --action triage --ids <ids> --json
trapmap feedback-batch --action transition --ids <ids> --transition-target <state> --json
```

`--dry-run` 可预览变更但不应用。
