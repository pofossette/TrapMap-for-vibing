# Agent Eval Framework Scorecard

> 用途：第一轮方向筛选
> 日期：2026-07-03
> 评分规则：`1` 最弱，`5` 最强
> 说明：分数用于 PoC 排序，不等同于采购结论
> 注：这里只服务 event-model-first 的 double-write mirror 路线选择，native TrapMap report 仍是 truth source。

## 评分维度

| 维度 | 权重 | 说明 |
|---|---:|---|
| Trace / trajectory 可视化 | 20 | 是否能提升 agent/path 调试效率 |
| Dataset / experiment 管理 | 15 | 是否支持数据集、实验、对比与回看 |
| Annotation / feedback | 10 | 是否支持人工 review、标注、反馈闭环 |
| 本地 / CI 友好度 | 15 | 是否适合保持 TrapMap 原生 CLI/CI |
| 自托管能力 | 10 | 是否支持团队自控部署 |
| 与 TrapMap 内核兼容性 | 20 | 是否能外挂而不是重写现有内核 |
| vendor lock-in 可控性 | 10 | 数据、流程、运行面是否容易保持可迁移 |

## 平台型候选

| 框架 | Trace | Dataset | Annotation | Local/CI | Self-host | Compatibility | Lock-in | 加权观察 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Langfuse | 4 | 4 | 4 | 4 | 5 | 5 | 4 | 当前最平衡，最适合先做外挂 PoC |
| MLflow | 3 | 4 | 3 | 4 | 5 | 4 | 4 | 平台自控强，但 agent eval UX 需验证 |
| LangSmith | 5 | 5 | 5 | 3 | 1 | 3 | 2 | hosted UX 强，适合做对照组 |
| Braintrust | 4 | 5 | 4 | 3 | 2 | 3 | 2 | 偏 hosted eval ops，适合对照但不宜主线 |
| Phoenix | 5 | 3 | 2 | 4 | 5 | 4 | 4 | 适合专项诊断，不适合作总平台 |

## 库型候选

| 框架 | Trace | Dataset | Annotation | Local/CI | Self-host | Compatibility | Lock-in | 加权观察 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Ragas | 2 | 2 | 1 | 4 | 4 | 4 | 4 | retrieval/summary 指标补强价值高 |
| DeepEval | 2 | 2 | 1 | 4 | 4 | 3 | 3 | 适合 metric/judge 补充，不适合平台替代 |
| OpenAI Evals | 1 | 2 | 1 | 3 | 2 | 2 | 1 | 更适合 OpenAI 生态内 benchmark 流程 |

## 打分依据摘要

- `Langfuse`：官方同时覆盖 evaluation 与 self-hosting，且 agent graph / production tests 明确可见，最适合 TrapMap 的“保留内核、外挂平台”路线。
- `MLflow`：官方 GenAI 文档覆盖 tracing、evaluation、observability，适合平台自控型团队，但 agent 工作流体验需 PoC 验证。
- `LangSmith`：官方 evaluation 面最完整，annotation queue 和 comparative experiments 成熟，但 hosted-first 和 lock-in 风险使它更适合作对照。
- `Braintrust`：官方 docs 强调 evals / experiments / datasets / proxy，适合 hosted 评测运营平台，但不是 TrapMap 主线首选。
- `Phoenix`：open-source observability / tracing / eval 强，但定位更偏诊断专项。
- `Ragas` / `DeepEval`：都更像“库”，而不是能接住 TrapMap 平台层缺口的“系统”。

## 建议排序

1. 主线 PoC：`Langfuse`
2. 第二候选：`MLflow`
3. Hosted 对照：`LangSmith`
4. 诊断专项：`Phoenix`
5. 指标补充库：`Ragas` 或 `DeepEval`

## 官方来源

- LangSmith Evaluation: https://docs.smith.langchain.com/evaluation
- Braintrust Docs: https://www.braintrust.dev/docs
- Langfuse Evaluation Overview: https://langfuse.com/docs/evaluation/overview
- Langfuse Self-Hosting: https://langfuse.com/self-hosting
- MLflow GenAI: https://mlflow.org/docs/latest/genai/index.html
- MLflow GenAI Evaluation: https://mlflow.org/docs/latest/genai/eval-monitor/
- Phoenix GitHub: https://github.com/Arize-ai/phoenix
- DeepEval GitHub: https://github.com/confident-ai/deepeval
- Ragas GitHub: https://github.com/explodinggradients/ragas
- OpenAI Evals GitHub: https://github.com/openai/evals
