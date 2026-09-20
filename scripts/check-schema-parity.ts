/**
 * Schema Parity Guard (check:schema-parity).
 *
 * Closes the gap between the two schema sources that drifted apart silently:
 *
 *   - `packages/db/src/schema/*.ts` — the Drizzle models every service ports
 *     itself against, and the inventory `check:table-schema` mirrors into
 *     `docs/reference/DATABASE_SCHEMA.md` (42 pgTables today).
 *   - `packages/db/migrations/schema.sql` — the DDL `runMigrations`
 *     (`packages/db/src/migrate.ts:8`) actually executes, statement by
 *     statement. It is the only file that decides what columns exist at
 *     runtime.
 *
 * The incident that motivated this guard: the 2026-09-01 Phase-2 table
 * compression commit updated the Drizzle models and the service raw SQL, but
 * never wrote a migration. The applied database stayed one phase behind, so a
 * batch of raw SQL referenced columns that do not exist; every call site ate
 * the error in `try/catch` and fell back, which is how a schema drift turned
 * into a retrieval-latency incident instead of a build failure.
 *
 * Neither existing guard could see it: `check:table-schema` compares table
 * NAMES against documentation, `check:sql-columns` compares RAW SQL column
 * references against the DDL. The seam between "what we model" and "what we
 * apply" was unguarded — that seam is this file.
 *
 * Comparison scope: column NAMES only. Types, constraints and indexes are not
 * compared — drizzle has no column type for a few applied types (tsvector),
 * so a type comparison would fail on intentional modelling gaps rather than
 * on drift.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseAppliedSchema } from './lib/applied-schema.js';
import { finishCheckRun } from './lib/check-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface SchemaParityIssue {
  kind: 'missing-table' | 'ghost-table' | 'missing-column' | 'extra-column';
  table: string;
  column?: string;
}

export interface SchemaParityResult {
  failures: number;
  messages: string[];
  /** Tables seen on the drizzle (expected) side. */
  expectedTables: number;
  /** Tables seen in the applied DDL. */
  appliedTables: number;
  issues: SchemaParityIssue[];
  exempted: SchemaParityIssue[];
}

/**
 * Documented, dated exceptions. An entry without a tracking pointer is how
 * the old route-surface exemption list rotted; see the note in
 * `check-sql-columns.ts` for the same rule.
 */
const EXEMPTIONS: ReadonlyArray<{ table: string; reason: string }> = [
  {
    table: 'conflict_relations',
    reason:
      'documented double-source exception: owned by service-governance-review migrations (docs/reference/DATABASE_SCHEMA.md:119); replacement landing spot tracked in open-debt-and-compromises.md',
  },
];

function isExemptTable(table: string): string | null {
  return EXEMPTIONS.find((entry) => entry.table === table)?.reason ?? null;
}

// ── Expected side: drizzle models ────────────────────────────────────

interface DrizzleColumn {
  name: string;
}

/**
 * Read the model inventory straight from drizzle's metadata instead of
 * regex-scraping the TS sources: the tables compose shared column factories
 * (`...auditTimestamps`), so a text scan would miss half of every table.
 *
 * `drizzle-orm` is deliberately NOT imported here — pnpm's isolated layout
 * leaves it unresolvable from `scripts/`, while the modules under
 * `packages/db/src/**` resolve it fine, so the import stays file-URL based and
 * the metadata is reached through the well-known symbols.
 */
export async function loadExpectedSchema(root: string): Promise<Map<string, Set<string>>> {
  const entry = pathToFileURL(join(root, 'packages', 'db', 'src', 'schema', 'index.ts')).href;
  const mod = (await import(entry)) as Record<string, unknown>;
  const nameSym = Symbol.for('drizzle:Name');
  const columnsSym = Symbol.for('drizzle:Columns');

  const tables = new Map<string, Set<string>>();
  for (const value of Object.values(mod)) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as Record<symbol, unknown>;
    const name = record[nameSym];
    const columns = record[columnsSym];
    if (typeof name !== 'string' || typeof columns !== 'object' || columns === null) continue;
    tables.set(
      name,
      new Set(Object.values(columns as Record<string, DrizzleColumn>).map((col) => col.name)),
    );
  }
  return tables;
}

// ── Diff ─────────────────────────────────────────────────────────────

export function diffSchemas(
  expected: Map<string, Set<string>>,
  applied: Map<string, Set<string>>,
): SchemaParityIssue[] {
  const issues: SchemaParityIssue[] = [];

  for (const table of [...expected.keys()].sort()) {
    if (!applied.has(table)) issues.push({ kind: 'missing-table', table });
  }
  for (const table of [...applied.keys()].sort()) {
    if (!expected.has(table)) issues.push({ kind: 'ghost-table', table });
  }
  for (const table of [...expected.keys()].sort()) {
    const appliedColumns = applied.get(table);
    if (!appliedColumns) continue;
    for (const column of [...expected.get(table)!].sort()) {
      if (!appliedColumns.has(column)) issues.push({ kind: 'missing-column', table, column });
    }
    for (const column of [...appliedColumns].sort()) {
      if (!expected.get(table)!.has(column)) issues.push({ kind: 'extra-column', table, column });
    }
  }
  return issues;
}

export async function checkSchemaParity(root: string): Promise<SchemaParityResult> {
  const expected = await loadExpectedSchema(root);
  const { tables: applied } = parseAppliedSchema(
    readFileSync(join(root, 'packages', 'db', 'migrations', 'schema.sql'), 'utf8'),
  );

  const issues = diffSchemas(expected, applied);
  const exempted: SchemaParityIssue[] = [];
  const reportable: SchemaParityIssue[] = [];
  for (const issue of issues) {
    // Ghost tables are the only class carrying a documented exception: a table
    // can legitimately live outside the shared models when another package owns
    // its migration path.
    if (issue.kind === 'ghost-table' && isExemptTable(issue.table)) exempted.push(issue);
    else reportable.push(issue);
  }

  const messages = reportable.map((issue) =>
    issue.kind === 'missing-table'
      ? `[schema-parity] ${issue.table} is modeled in packages/db/src/schema but has no DDL in packages/db/migrations/schema.sql`
      : issue.kind === 'ghost-table'
        ? `[schema-parity] ${issue.table} exists in packages/db/migrations/schema.sql but is not modeled in packages/db/src/schema`
        : issue.kind === 'missing-column'
          ? `[schema-parity] ${issue.table}.${issue.column} is modeled in packages/db/src/schema but is absent from the applied DDL`
          : `[schema-parity] ${issue.table}.${issue.column} exists in the applied DDL but is not modeled in packages/db/src/schema`,
  );

  return {
    failures: messages.length,
    messages,
    expectedTables: expected.size,
    appliedTables: applied.size,
    issues: reportable,
    exempted,
  };
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const result = await checkSchemaParity(root);
  for (const issue of result.exempted) {
    console.warn(
      `[schema-parity] exempted ${issue.table} (${issue.kind}) — ${isExemptTable(issue.table) ?? ''}`,
    );
  }
  console.log(
    `[schema-parity] ${result.expectedTables} modeled table(s), ${result.appliedTables} applied table(s).`,
  );
  finishCheckRun({
    name: '[schema-parity]',
    result,
    remedy:
      'Align the two sources: write the missing DDL into packages/db/migrations/schema.sql, or model the table/column in packages/db/src/schema. Exemptions must name a tracked debt.',
    passedMessage: '[schema-parity] the applied DDL matches the drizzle models.',
  });
}

const isDirectRun = !process.env.VITEST && (process.argv[1] ?? '').includes('check-schema-parity');
if (isDirectRun) {
  await main();
}
