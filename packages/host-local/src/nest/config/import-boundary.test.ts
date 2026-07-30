import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { expectFilesFreeOfImports } from "../../../../../scripts/testing/import-boundary.js";

const CONFIG_FILES = [
  "src/nest/config/config.ts",
  "src/nest/config/graph-db-config.ts",
  "src/nest/config/rag-log.ts",
  "src/nest/config/user-ops-log.ts",
  "src/nest/config/log-rotation.ts",
];

const FORBIDDEN_IMPORTS = [
  "@trapmap/server/lib/ai/",
  "@trapmap/server/lib/graph-query/config",
  "@trapmap/server/lib/rag-log",
  "@trapmap/server/lib/user-ops-log",
];

describe("host-local config import boundary", () => {
  it("uses the shared AI provider configuration without a local duplicate", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const configSource = await readFile(path.join(root, "src/nest/config/config.ts"), "utf-8");

    expect(existsSync(path.join(root, "src/nest/config/ai-provider-config.ts"))).toBe(false);
    expect(configSource).toContain("from '@trapmap/ai-providers'");
  });

  it("does not import config-owned helpers from @trapmap/server", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");

    await expectFilesFreeOfImports(
      root,
      CONFIG_FILES,
      FORBIDDEN_IMPORTS,
      (source, forbidden) => {
        expect(source).not.toContain(forbidden);
      },
    );
  });
});
