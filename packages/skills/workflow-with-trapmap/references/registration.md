# 注册

当需要提交新知识或导入技能目录时使用这些命令。

## 选择工件类型

- 使用 `trap` 表示紧凑的警告：已知失败模式、根本原因、修复和验证。
- 使用 `skill` 表示可复用的工作流，教导代理如何操作工具。
- 当工作流有用但有值得单独 `AVOID` 警告的常见失败模式时，两者都使用。

在注册任何内容之前，使用技能和陷阱检索搜索重复项。

## 陷阱提交

```bash
trapmap trap submit \
  --scope project \
  --label cli \
  --label pnpm \
  --shortcut "使用 -- 当通过 pnpm 脚本转发 CLI 参数时" \
  --detail "问题、根本原因、修复和验证。" \
  --json

trapmap trap resubmit <entryId> \
  --label retrieval \
  --shortcut "更新的警告" \
  --file detail.md \
  --json
```

保持 `shortcut` 对终端友好。将可复用的组织级约束放在 `global` 范围，将仓库特定知识放在 `project` 范围。

## 技能导入

```bash
trapmap import --file path/to/skill-dir --level 0 --json
trapmap import --file path/to/SKILL.md --level 0 --json
```

期望的技能目录形状：

```text
skill-name/
  SKILL.md
  references/
  assets/
  scripts/
```

保持 `SKILL.md` 简洁，将详细的操作说明移入 `references/`。

在可能时，在新的技能指导中使用此紧凑控制块：

```text
MATCH: 当此适用时
GOAL: 代理应该实现的目标
STRATEGY: 3-5 个有序步骤
AVOID: 具体的失败警告
VERIFY: 命令或可观察的确认
```

不要注册原始日志、秘密、私有路径或长篇文档转储。

## 编辑已有条目

```bash
trapmap edit <entryId> --shortcut "更新的描述" --labels auth,security --json
trapmap skill edit <artifactId> --title "新标题" --labels auth,oauth2 --json
trapmap skill edit <artifactId> --file ./updated-SKILL.md --json
trapmap skill history <artifactId> --json   # 查看版本历史
trapmap skill versions <artifactId> --json  # 查看 semver 版本与修订历史
```
