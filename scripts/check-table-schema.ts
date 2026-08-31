/**
 * Table Schema vs Documentation Guard (check:table-schema).
 *
 * Extracts every pgTable name from `packages/db/src/schema/` — the
 * single source of truth for the table inventory — and diffs it against the
 * table inventory declared in `docs/reference/DATABASE_SCHEMA.md`. Any drift
 * fails the check:
 *
 *   - a table modeled in db but missing from the doc,
 *   - a ghost table listed in the doc but not modeled anywhere,
 *   - a section count in the doc ("### X (N 表)") that does not match the
 *     number of table rows it actually declares,
 *   - the doc's total ("## 表总览 (N 张表)") diverging from the schema count.
 *
 * Doc index rows (names ending in `_idx`) inside "### ... 关键索引" tables are
 * not tables and are excluded from the inventory.
 *
 * store_snapshot note: the identity-access migration SQL still contains a
 * legacy `CREATE TABLE store_snapshot` (66 CREATE TABLE total = 64 +
 * conflict_relations + store_snapshot). The guard intentionally scopes to
 * db/src/schema, the authoritative 64-table source; migration-SQL
 * residue is tracked in the cleanup mainline, not here.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { finishCheckRun } from './lib/check-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface DocTableSection {
  title: string;
  declared: number;
  tables: string[];
}

export interface DocTableInventory {
  /** "## 表总览 (N 张表)" declared total, if present. */
  declaredTotal: number | null;
  sections: DocTableSection[];
  tables: string[];
}

export interface CheckResult {
  failures: number;
  messages: string[];
}

// ── Schema extraction ────────────────────────────────────────────────

const PGTABLE_RE = /pgTable\(\s*'([a-z_0-9]+)'/g;

function tableNamesIn(content: string): string[] {
  const names: string[] = [];
  PGTABLE_RE.lastIndex = 0;
  let match = PGTABLE_RE.exec(content);
  while (match !== null) {
    names.push(match[1]!);
    match = PGTABLE_RE.exec(content);
  }
  return names;
}

/** Extract every pgTable name from packages/db/src/schema/. */
export function extractSchemaTableNames(root: string): string[] {
  const schemaDir = join(root, 'packages', 'db', 'src', 'schema');
  if (!existsSync(schemaDir)) return [];

  const names = new Set<string>();
  const schemaFiles = readdirSync(schemaDir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.ts'),
  );
  for (const entry of schemaFiles) {
    const content = readFileSync(join(schemaDir, entry.name), 'utf8');
    for (const name of tableNamesIn(content)) names.add(name);
  }
  return [...names].sort();
}

// ── Doc parsing ──────────────────────────────────────────────────────

const TABLE_ROW_RE = /^\| `([a-z_0-9]+)`/;
const SECTION_HEADER_RE = /^### .+ \((\d+) 表/;
const TOTAL_HEADER_RE = /^## 表总览 \((\d+) 张表\)/;

function matchTotal(line: string): number | null {
  const m = TOTAL_HEADER_RE.exec(line);
  return m ? Number(m[1]) : null;
}

function matchSectionHeader(line: string): { title: string; declared: number } | null {
  const m = SECTION_HEADER_RE.exec(line);
  return m ? { title: line.replace(/^### /, ''), declared: Number(m[1]) } : null;
}

function matchTableRow(line: string): string | null {
  const m = TABLE_ROW_RE.exec(line);
  return m ? m[1]! : null;
}

/**
 * Parse the table inventory declared in DATABASE_SCHEMA.md.
 *
 * Table rows are `| `name` | ...` rows inside sections titled `### X (N 表)`.
 * Index rows (names ending in `_idx`) in "关键索引" tables are excluded.
 */
// fallow-ignore-next-line complexity -- markdown section/row state machine for the DATABASE_SCHEMA.md inventory
export function parseDocTableInventory(docContent: string): DocTableInventory {
  const sections: DocTableSection[] = [];
  const tables: string[] = [];
  let declaredTotal: number | null = null;
  let current: DocTableSection | null = null;

  for (const line of docContent.split('\n')) {
    const total = matchTotal(line);
    if (total !== null) {
      declaredTotal = total;
      continue;
    }
    const header = matchSectionHeader(line);
    if (header !== null) {
      current = { ...header, tables: [] };
      sections.push(current);
      continue;
    }
    if (line.startsWith('### ')) {
      current = null;
      continue;
    }
    const row = matchTableRow(line);
    if (row !== null && current !== null && !row.endsWith('_idx')) {
      current.tables.push(row);
      tables.push(row);
    }
  }

  return { declaredTotal, sections, tables: [...new Set(tables)].sort() };
}

// ── Checking logic (testable) ────────────────────────────────────────

function missingTables(schemaTables: string[], docSet: Set<string>): string[] {
  const messages: string[] = [];
  for (const table of schemaTables) {
    if (docSet.has(table)) continue;
    messages.push(
      `[table-schema] MISSING in DATABASE_SCHEMA.md: ${table} (modeled in db, not declared in the doc)`,
    );
  }
  return messages;
}

function ghostTables(schemaSet: Set<string>, docTables: string[]): string[] {
  const messages: string[] = [];
  for (const table of docTables) {
    if (schemaSet.has(table)) continue;
    messages.push(
      `[table-schema] GHOST in DATABASE_SCHEMA.md: ${table} (declared in the doc, not modeled in db)`,
    );
  }
  return messages;
}

function sectionCountIssues(sections: DocTableSection[]): string[] {
  const messages: string[] = [];
  for (const section of sections) {
    if (section.tables.length === section.declared) continue;
    messages.push(
      `[table-schema] SECTION COUNT ${section.title}: declares ${section.declared} 表 but lists ${section.tables.length} table(s)`,
    );
  }
  return messages;
}

/** Compare schema table names against the doc inventory. */
export function checkTableSchema(root: string, docContent: string): CheckResult {
  const messages: string[] = [];

  const schemaTables = extractSchemaTableNames(root);
  const inventory = parseDocTableInventory(docContent);
  const schemaSet = new Set(schemaTables);
  const docSet = new Set(inventory.tables);

  messages.push(
    ...missingTables(schemaTables, docSet),
    ...ghostTables(schemaSet, inventory.tables),
    ...sectionCountIssues(inventory.sections),
  );

  if (inventory.declaredTotal !== null && inventory.declaredTotal !== schemaTables.length) {
    messages.push(
      `[table-schema] TOTAL MISMATCH: doc declares ${inventory.declaredTotal} 张表 but db models ${schemaTables.length}`,
    );
  }

  if (schemaTables.length > 0) {
    console.log(
      `[table-schema] db models ${schemaTables.length} table(s); doc declares ${inventory.tables.length} table(s).`,
    );
  }

  return { failures: messages.length, messages };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

function main(): void {
  const docPath = join(ROOT, 'docs', 'reference', 'DATABASE_SCHEMA.md');
  const docContent = existsSync(docPath) ? readFileSync(docPath, 'utf8') : '';
  const result = checkTableSchema(ROOT, docContent);
  finishCheckRun({
    name: '[table-schema]',
    result,
    remedy:
      'Update docs/reference/DATABASE_SCHEMA.md and/or packages/db/src/schema to keep the table inventory aligned.',
    passedMessage: '[table-schema] db and DATABASE_SCHEMA.md table inventories are aligned.',
  });
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-table-schema');
if (isDirectRun) {
  main();
}
