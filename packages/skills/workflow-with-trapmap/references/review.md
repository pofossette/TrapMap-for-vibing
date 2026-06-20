# 审核

当需要检查提交状态或处理审核队列时使用这些命令。

## 知识审核

```bash
trapmap review-status --json
trapmap review-status <entryId> --json

trapmap review:queue --json
trapmap review:approve <entryId> --notes "已批准：可复用且已验证。" --json
trapmap review:reject <entryId> --notes "已拒绝：重复或缺乏证据。" --json
```

## 技能审核

```bash
trapmap skill review:queue --json
trapmap skill review:approve <artifactId> --notes "已批准：简洁且范围明确。" --json
trapmap skill review:reject <artifactId> --notes "已拒绝：需要更清晰的触发器。" --json
```

仅在以下条件满足时批准：

- 触发器足够具体，可供代理自动使用。
- 内容紧凑且面向行动。
- 工作流有验证命令或可观察的确认。
- 工件避免秘密、私有路径和原始转录。

当工件重度文档化、重复现有技能/陷阱、缺少已知失败模式的 `AVOID` 警告，或发明不支持的 CLI 标志时，拒绝或请求编辑。

## 重复解决

```bash
trapmap skill duplicate-job fetch <candidateId> --json
trapmap skill duplicate-job resolve <candidateId> \
  --decision independent \
  --notes "足够不同，可以保留。" \
  --json
trapmap skill duplicate-job apply-resolution <candidateId> --json
```

对于合并重复的决策，包含 `--merged-with <entityId>` 和 `--merged-type trap|skill`。
