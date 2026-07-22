import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { expectFilesFreeOfImports } from "../../../../../scripts/testing/import-boundary.js";

const RUNTIME_FILES = [
  "src/nest/runtime/shared-infra.ts",
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
      "src/nest/runtime/host-services.ts",
      "src/nest/runtime/server-composition.ts",
    ]) {
      const source = await readFile(path.join(root, file), "utf-8");
      expect(source).not.toContain("from '@trapmap/runtime-infra'");
    }
  });
});
