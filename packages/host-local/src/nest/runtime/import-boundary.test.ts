import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { expectFilesFreeOfImports } from "../../../../../scripts/testing/import-boundary.js";

const PACKAGES_ROOT = path.resolve(import.meta.dirname, "../../../..");

const DOMAIN_AND_SERVICE_PACKAGES = [
  "packages/contracts",
  "packages/backend-core",
  "packages/service-candidate-ingestion",
  "packages/service-governance-review",
  "packages/service-identity-access",
  "packages/service-job-runtime",
  "packages/service-knowledge-read",
  "packages/service-knowledge-write",
  "packages/ai-providers",
];

/**
 * Check that a package does not import `langfuse` directly or dynamically.
 * The `langfuse` SDK must only be imported from:
 * - host-local observability boundary (langfuse-sink.ts, langfuse.service.ts)
 * - evals platform adapter (langfuse-adapter.ts)
 */
async function expectPackageFreeOfLangfuseImports(packageDir: string): Promise<void> {
  const srcDir = path.join(packageDir, "src");
  if (!existsSync(srcDir)) {
    return;
  }

  const { readdir } = await import("node:fs/promises");
  async function collectTs(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return collectTs(fullPath);
        }
        return fullPath.endsWith(".ts") ? [fullPath] : [];
      }),
    );
    return files.flat();
  }

  const files = await collectTs(srcDir);
  for (const file of files) {
    const source = await readFile(file, "utf-8");
    // Reject static imports
    expect(source).not.toMatch(/from\s+['"]langfuse(?:\/[^'"]*)?['"]/);
    // Reject dynamic imports
    expect(source).not.toMatch(/import\s*\(\s*['"]langfuse(?:\/[^'"]*)?['"]\s*\)/);
  }
}

const RUNTIME_FILES = [
  "src/nest/runtime/retrieval-assembly.ts",
  "src/nest/runtime/host-runtime.ts",
];

const FORBIDDEN_IMPORTS = [
  "@trapmap/server/lib/async/factory",
  "@trapmap/server/lib/ai/index",
  "@trapmap/server/lib/async/transport",
  "@trapmap/server/lib/embeddings",
  "@trapmap/server/lib/graph-query/backend",
  "@trapmap/server/lib/graph-query/memory-backend",
  "@trapmap/server/lib/indexing/adapters/index",
  "@trapmap/server/lib/lifecycle/event-bus",
  "@trapmap/server/lib/persistence/create-store",
  "@trapmap/server/lib/persistence/postgres-store",
  "@trapmap/server/lib/repos/index",
  "@trapmap/server/lib/store",
  "@trapmap/server/lib/retrieval/recall/keyword",
  "@trapmap/server/lib/retrieval/recall/semantic",
  "@trapmap/server/lib/retrieval/orchestration/channel-registry",
  "@trapmap/server/lib/retrieval/orchestration/recall-coordinator",
  "@trapmap/server/lib/retrieval/orchestration/strategy-registry",
  "@trapmap/server/lib/retrieval.js",
];

describe("host-local runtime import boundary", () => {
  it("does not import retrieval seams directly from @trapmap/server", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");

    await expectFilesFreeOfImports(
      root,
      RUNTIME_FILES,
      FORBIDDEN_IMPORTS,
      (source, forbidden) => {
        expect(source).not.toContain(forbidden);
      },
    );
  });

  it("owns the PostgreSQL pool seam without runtime-infra", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");

    for (const file of [
      "src/nest/runtime/shared-infra.ts",
      "src/nest/runtime/host-services.ts",
    ]) {
      const source = await readFile(path.join(root, file), "utf-8");
      expect(source).not.toContain("from '@trapmap/runtime-infra'");
    }
  });

  it("does not retain the unused compatibility server composition bridge", () => {
    const root = path.resolve(import.meta.dirname, "../../..");

    expect(existsSync(path.join(root, "src/nest/runtime/server-composition.ts"))).toBe(false);
  });

  it("does not initialize the compatibility global embeddings bridge", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const source = await readFile(path.join(root, "src/nest/runtime/shared-infra.ts"), "utf-8");

    expect(source).not.toContain("setGlobalEmbeddingsProvider");
  });

  it("uses the shared AI provider package", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const sharedInfraSource = await readFile(
      path.join(root, "src/nest/runtime/shared-infra.ts"),
      "utf-8",
    );

    expect(sharedInfraSource).not.toContain("@trapmap/server/lib/ai");
    expect(sharedInfraSource).toContain("from '@trapmap/ai-providers'");
  });

  it("constructs graph query from the knowledge-read owner rather than server internals", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const sharedInfraSource = await readFile(
      path.join(root, "src/nest/runtime/shared-infra.ts"),
      "utf-8",
    );

    expect(sharedInfraSource).toContain("from '@trapmap/service-knowledge-read'");
    expect(sharedInfraSource).toContain('createMemoryGraphQueryBackend');
    expect(sharedInfraSource).not.toMatch(/@trapmap\/server\/lib\/graph-query(?:\/[^'"]*)?/);
  });

  it("owns its PostgreSQL pool without compatibility store assembly", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const source = await readFile(path.join(root, "src/nest/runtime/shared-infra.ts"), "utf-8");

    expect(source).not.toContain("createSkillShareerStore");
    expect(source).not.toContain("getStorePool");
  });

  it("rejects langfuse imports from backend-core, domain and service packages", async () => {
    for (const pkg of DOMAIN_AND_SERVICE_PACKAGES) {
      const pkgDir = path.join(PACKAGES_ROOT, pkg);
      if (!existsSync(pkgDir)) {
        continue;
      }
      await expectPackageFreeOfLangfuseImports(pkgDir);
    }
  });

  it("does not import langfuse from shared-infra.ts (uses langfuse-sink seam)", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const source = await readFile(path.join(root, "src/nest/runtime/shared-infra.ts"), "utf-8");

    // shared-infra.ts must NOT import langfuse directly
    expect(source).not.toMatch(/from\s+['"]langfuse(?:\/[^'"]*)?['"]/);
    expect(source).not.toMatch(/import\s*\(\s*['"]langfuse(?:\/[^'"]*)?['"]\s*\)/);
    // But it should import from the langfuse-sink seam
    expect(source).toContain("langfuse-sink");
  });
});
