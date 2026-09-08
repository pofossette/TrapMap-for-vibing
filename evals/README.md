# TrapMap 评测工作区

你用这个目录运行各套件评测，本页只讲跑法与结果读法。

## 跑法

你只用 `pnpm --filter @trapmap/evals ...` 形式调用评测。

```bash
pnpm --filter @trapmap/evals eval -- smoke
pnpm --filter @trapmap/evals eval -- core
pnpm --filter @trapmap/evals eval -- retrieval --tier smoke
pnpm --filter @trapmap/evals eval -- summary --tier smoke
pnpm --filter @trapmap/evals eval:ci
pnpm --filter @trapmap/evals eval:ci:core
pnpm --filter @trapmap/evals eval:smoke
```

各套件入口见 `evals/retrieval/`、`evals/summary/`、`evals/graph-extraction/`、`evals/ingestion/`、`evals/agent-planning/`、`evals/label-alignment/`、`evals/retrieval-live/`、`evals/experience-gene/`，公共编排见 `evals/scripts/eval-all.ts`，CI 编排见 `evals/scripts/eval-ci.ts`，共享断言与报告见 `evals/lib/`，跨套件类型见 `evals/types/`。

## 结果读法

各套件输出 native JSON report，你以它为真相源读 case / group / slice 聚合。aggregate runner 只消费各套件投影出的统一 platform events，不反向解析套件内部结构。

## badcase 导出边界

badcase 导出 draft 只输出 `badcaseEvalDraftSchema`，它是唯一序列化载荷，route 额外携带的 `debug` 仅用于 operator / debug 闭环，不属于 eval draft payload。root-plan closeout 已冻结该边界，修改导出形状前你先找 eval owner 确认。
