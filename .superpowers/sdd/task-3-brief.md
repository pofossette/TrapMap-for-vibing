### Task 3: 修复架构术语与中文化批次

**Files:**
- Modify: `docs/architecture/OBSERVABILITY.md`
- Modify: `docs/architecture/SERVICE-DISCOVERY.md`
- Modify: `docs/architecture/SERVICE_BOUNDARIES.md`
- Modify: `docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md`
- Modify: `packages/server/src/lib/README.md`
- Modify: `packages/backend-core/README.md`
- Modify: `docs/architecture/MODULE_STRUCTURE.md`

**Interfaces:**
- Consumes: `docs/todos/doc-drift-fix-list.md` 中 M-07 至 M-10 与“简体中文翻译处理清单”；`packages/server/src/app.ts`、`packages/host-distributed/src/shared/telemetry.ts`、`packages/host-local/src/nest/service-discovery/`、各 `service-*` 包目录
- Produces: 已修正的 OTEL 开关语义、服务发现归属、service 计数、去重后的 checklist 标题和中文化文档

- [ ] **Step 1: 逐文件核对待修表述**

Run: `rtk rg -n "OTEL_ENABLED|service-discovery/|前五个物理|Blocking gaps:|^#|README" docs/architecture/OBSERVABILITY.md docs/architecture/SERVICE-DISCOVERY.md docs/architecture/SERVICE_BOUNDARIES.md docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md packages/server/src/lib/README.md packages/backend-core/README.md docs/architecture/MODULE_STRUCTURE.md`
Expected: 命中待修位置和英文标题

- [ ] **Step 2: 更新术语并完成中文化**

要求：
- `OBSERVABILITY.md` 全文改成 `OTEL_DISABLED` 语义
- `SERVICE-DISCOVERY.md` 改正服务注册归属
- `SERVICE_BOUNDARIES.md` 改为六个 `service-*`
- `MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md` 删除重复 `Blocking gaps:`
- `packages/server/src/lib/README.md`、`packages/backend-core/README.md`、`docs/architecture/MODULE_STRUCTURE.md` 完成简体中文化，且不引入事实漂移

- [ ] **Step 3: 校验 Markdown 与链接**

Run: `rtk pnpm check:md-lint`
Expected: PASS

- [ ] **Step 4: 校验文档守卫**

Run: `rtk pnpm check:docs-drift`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/OBSERVABILITY.md docs/architecture/SERVICE-DISCOVERY.md docs/architecture/SERVICE_BOUNDARIES.md docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md packages/server/src/lib/README.md packages/backend-core/README.md docs/architecture/MODULE_STRUCTURE.md
git commit -m "docs: fix architecture wording and zh-cn docs"
```

