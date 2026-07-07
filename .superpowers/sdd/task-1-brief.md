### Task 1: 修复入口与事实源批次

**Files:**
- Modify: `packages/host-distributed/README.md`
- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `docs/architecture/DEPLOYMENT.md`
- Modify: `docs/reference/DOCS_TRUTH_MATRIX.md`

**Interfaces:**
- Consumes: `docs/todos/doc-drift-fix-list.md` 中 H-01 至 H-04 的问题定义；`packages/host-distributed/src/index.ts`、`packages/host-distributed/package.json`、`packages/host-local/src/nest/**`、`package.json`、`.github/workflows/ci.yml`
- Produces: 已修正的入口职责描述、默认宿主事实、Node/pnpm 基线和 truth-matrix 链接

- [ ] **Step 1: 逐文件核对权威源**

Run: `rtk rg -n "knowledge-read|Fastify 宿主|Node.js 20\\+|docs/todos/trapmap-architecture-remediation-plan.md" packages/host-distributed/README.md docs/architecture/ARCHITECTURE.md docs/architecture/DEPLOYMENT.md docs/reference/DOCS_TRUTH_MATRIX.md`
Expected: 命中当前待修表述，便于逐项替换

- [ ] **Step 2: 更新文档事实**

要求：
- `packages/host-distributed/README.md` 明确写成分布式宿主装配层，覆盖 `gateway + 六个服务入口`
- `docs/architecture/ARCHITECTURE.md` 把默认主线改为 `packages/host-local/src/nest/**`，Fastify 收口为 compatibility shell
- `docs/architecture/DEPLOYMENT.md` 统一写成 Node `24` + pnpm `10.33.0`
- `docs/reference/DOCS_TRUTH_MATRIX.md` 改成真实存在的路径

- [ ] **Step 3: 校验改动结果**

Run: `rtk pnpm check:structure`
Expected: PASS

- [ ] **Step 4: 校验文档守卫**

Run: `rtk pnpm check:docs-drift`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/host-distributed/README.md docs/architecture/ARCHITECTURE.md docs/architecture/DEPLOYMENT.md docs/reference/DOCS_TRUTH_MATRIX.md
git commit -m "docs: fix doc truth entry batch"
```

