# 工件

当需要导出或激活技能工件时使用这些命令。

## 导出

```bash
trapmap artifact-export --artifact <artifactId> --format bundle-json --json
trapmap artifact-export --artifact <artifactId> --format distilled-json --json
trapmap artifact-export --artifact <artifactId> --format skill-dir --output ./out
```

使用 `distilled-json` 进行快速代理检查，使用 `bundle-json` 进行完整归档，使用 `skill-dir` 在物化 Claude 兼容技能目录时使用。

## 选择性激活

```bash
trapmap activate \
  --artifact <artifactId> \
  --paths references/guide.md,scripts/helper.ts \
  --output ./activated \
  --json
```

仅激活当前任务所需的文件。不要默认获取所有引用/脚本。

脚本可能会被阻止或需要手动批准，具体取决于其激活策略。除非策略和用户/会话权限允许，否则不要执行激活的脚本。
