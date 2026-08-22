# 安全候选验证与文档校准（2026-08-22，A13）

## 候选矩阵
| 来源候选 | reachability | 结论 |
|---|---|---|
| gateway actorId 自报（历史） | 已由 requireTrustedActor 会话覆盖 + A6 恢复必填 | 关闭（双保险） |
| feedback schema passthrough | remediation-complete 已恢复 strict（2026-08-13） | 无新增面 |
| 服务发现 optional overlay 文档误写为必需 | SERVICE-DISCOVERY.md 现文明确 Consul 可选、静态 URL 兜底 fail-open | 校准完成 |
| pnpm audit advisory | 本环境离线不可跑 → CI 补跑注记 | needs-evidence（CI） |

## 文档事实校准
- CLIENT_INTEGRATION.md 的 search-by-content curl 示例指向未实现路由 —— 已在主线问题池登记，tranche-2 文档修正随本报告一并提醒（真实端点 /v1/retrieval/search 已由 MCP 工具采用）。
- AI_PROVIDER.md MCP 占位注入与 apps/mcp 职责边界已澄清（互不替代）。

## 后续落点
reachable=0；CI audit 结果回填后本文件关闭对应行。
