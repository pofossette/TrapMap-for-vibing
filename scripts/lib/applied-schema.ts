/**
 * Shared parser for `packages/db/migrations/schema.sql` — the DDL
 * `runMigrations` executes, and therefore the only description of what the
 * database really looks like at runtime.
 *
 * Two guards need the same answer and must not disagree about it:
 * `check:sql-columns` (raw SQL references vs the applied schema) and
 * `check:schema-parity` (drizzle models vs the applied schema). A second copy
 * of this parser would drift, and the drift would show up as one guard
 * contradicting the other.
 *
 * The file is executed top-to-bottom by the migrator, so statements are
 * applied in order: a column added late in the file exists, a column dropped
 * late in the file does not, and a table dropped at the end is not part of the
 * schema even though its `CREATE TABLE` appears earlier.
 */

export interface AppliedSchema {
  /** Table name → column names that exist after the whole file has run. */
  tables: Map<string, Set<string>>;
  /** Tables retired by a `DROP TABLE` in the file. */
  drops: string[];
}

export function parseAppliedSchema(schemaSql: string): AppliedSchema {
  const tables = new Map<string, Set<string>>();
  const drops: string[] = [];

  // Both indentation styles occur in the file (tabs from generated blocks, two
  // spaces from hand-edited ones); matching only one silently drops whole
  // tables and reports every one of their columns as missing.
  for (const match of schemaSql.matchAll(
    /CREATE TABLE (?:IF NOT EXISTS )?"([a-z0-9_]+)" \(([\s\S]*?)\n\);/g,
  )) {
    const [, table, body] = match;
    const columns = new Set<string>();
    for (const columnMatch of body!.matchAll(/^\s+"([a-z0-9_]+)"\s/gm)) {
      columns.add(columnMatch[1]!);
    }
    tables.set(table!, columns);
  }

  for (const match of schemaSql.matchAll(
    /ALTER TABLE (?:IF EXISTS )?"?([a-z0-9_]+)"?([\s\S]*?);/g,
  )) {
    const [, table, body] = match;
    const columns = tables.get(table!);
    for (const column of body!.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([a-z0-9_]+)"?/g)) {
      columns?.add(column[1]!);
    }
    for (const column of body!.matchAll(/DROP COLUMN (?:IF EXISTS )?"?([a-z0-9_]+)"?/g)) {
      columns?.delete(column[1]!);
    }
  }

  for (const match of schemaSql.matchAll(/DROP TABLE (?:IF EXISTS )?"?([a-z0-9_]+)"?/g)) {
    drops.push(match[1]!);
    tables.delete(match[1]!);
  }

  return { tables, drops };
}
