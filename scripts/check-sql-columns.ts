/**
 * SQL Column Reference Guard (check:sql-columns).
 *
 * Closes the gap that let the retrieval latency incident through: three
 * independent checks had all been table-NAME level only, so a raw SQL string
 * referencing a COLUMN that does not exist in the applied schema shipped to
 * production and failed at runtime — silently, because the call site wrapped
 * it in `try/catch` and fell back (`[hybridRecall] DB search failed, falling
 * back to in-memory`).
 *
 * Two data sources:
 *   - `packages/db/migrations/schema.sql` — the DDL that is actually applied
 *     (`runMigrations` executes this file idempotently). Parsed statically so
 *     the guard needs no PostgreSQL/docker and can run in plain CI.
 *   - raw SQL string literals in the service/infra src trees.
 *
 * Alias handling: `FROM skill_artifacts sa` / `JOIN skill_artifacts art ON ...`
 * are resolved to real table names, and `alias.column` references are checked
 * against the aliased table. A bare (unqualified) column is only attributed
 * when the statement touches exactly one table — multi-table statements skip
 * bare columns rather than guess (false positives are worse than silence here,
 * because noise trains people to ignore the guard).
 *
 * Deliberately out of scope (documented, not accidental):
 *   - SQL fragments containing `${}` interpolation are skipped and counted:
 *     dynamic column/table names cannot be resolved without evaluating the
 *     template. See the L2 (AST parser) stage in the mainline detail.
 *   - drizzle ORM queries: their column references are TS type-checked, which
 *     is exactly why every drift found so far lives in raw SQL strings.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { parseAppliedSchema } from './lib/applied-schema.js';
import { finishCheckRun } from './lib/check-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface SqlColumnViolation {
  /** Repo-relative file path. */
  file: string;
  line: number;
  table: string;
  column: string;
  kind: 'select' | 'insert' | 'update';
}

export interface SqlColumnScanResult {
  failures: number;
  messages: string[];
  /** Statements actually cross-checked. */
  checked: number;
  /** Fragments skipped because they interpolate SQL dynamically. */
  skipped: number;
  violations: SqlColumnViolation[];
  /** Known-but-unfixed rows, see EXEMPTIONS. */
  exempted: SqlColumnViolation[];
}

/**
 * Known violations carried as explicit exemptions so the guard can land
 * blocking before the backlog is fixed. Each entry must name the debt; an
 * exemption without a tracked fix is how the old route-surface list rotted.
 */
const EXEMPTIONS: ReadonlyArray<{ table: string; column: string; reason: string }> = [
  {
    table: 'knowledge_search_documents',
    column: 'tokens',
    reason: 'v1/v3 DB recall branch triple-breakage (latency-optimize mainline)',
  },
  {
    table: 'knowledge_search_documents',
    column: 'field_tokens_shortcut',
    reason: 'v1/v3 DB recall branch triple-breakage (latency-optimize mainline)',
  },
  {
    table: 'knowledge_search_documents',
    column: 'field_tokens_detail',
    reason: 'v1/v3 DB recall branch triple-breakage (latency-optimize mainline)',
  },
  {
    table: 'knowledge_search_documents',
    column: 'field_tokens_labels',
    reason: 'v1/v3 DB recall branch triple-breakage (latency-optimize mainline)',
  },
];

function isExempt(table: string, column: string): string | null {
  const hit = EXEMPTIONS.find((e) => e.table === table && e.column === column);
  return hit ? hit.reason : null;
}

// ── Schema parsing ───────────────────────────────────────────────────

/** table -> column set, parsed from the applied DDL. */
export function parseSchemaTables(schemaSql: string): Map<string, Set<string>> {
  // Delegates to the shared parser so this guard and check:schema-parity read
  // the same applied schema — including columns added by later ALTER
  // statements, which is how the Phase-2 catch-up migration adds its columns.
  return parseAppliedSchema(schemaSql).tables;
}

// ── Source walking ───────────────────────────────────────────────────

const SCAN_ROOTS = [
  'packages/service-knowledge-read/src',
  'packages/service-knowledge-write/src',
  'packages/service-candidate-ingestion/src',
  'packages/service-governance-review/src',
  'packages/service-identity-access/src',
  'packages/service-cron/src',
  'packages/service-job-runtime/src',
  'packages/infra/src',
  'packages/backend-core/src',
];

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'dist' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.includes('.test.')) {
      out.push(full);
    }
  }
}

// ── SQL extraction ───────────────────────────────────────────────────

interface SqlFragment {
  sql: string;
  line: number;
}

const STRING_LITERAL = /(['`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

function extractSqlFragments(source: string): SqlFragment[] {
  const out: SqlFragment[] = [];
  for (const match of source.matchAll(STRING_LITERAL)) {
    const text = match[2] ?? '';
    if (!/\b(SELECT|INSERT INTO|UPDATE)\b/i.test(text)) continue;
    const line = source.slice(0, match.index ?? 0).split('\n').length;
    out.push({ sql: text, line });
  }
  return out;
}

// ── Analysis ─────────────────────────────────────────────────────────

const IDENT = '[a-z_][a-z0-9_]*';

function buildAliasMap(sql: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const re = new RegExp(`\\b(?:FROM|JOIN)\\s+"?(${IDENT})"?\\s+(?:AS\\s+)?(${IDENT})\\b`, 'gi');
  for (const m of sql.matchAll(re)) {
    const table = m[1]!.toLowerCase();
    let alias = m[2]!.toLowerCase();
    // Guard against SQL keywords being mistaken for an alias (e.g. "FROM t WHERE").
    if (
      ['where', 'on', 'join', 'left', 'inner', 'order', 'group', 'limit', 'set'].includes(alias)
    ) {
      continue;
    }
    aliases.set(alias, table);
  }
  return aliases;
}

function tablesInStatement(sql: string): Set<string> {
  const tables = new Set<string>();
  const re = new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+"?(${IDENT})"?`, 'gi');
  for (const m of sql.matchAll(re)) tables.add(m[1]!.toLowerCase());
  return tables;
}

function isExpression(token: string): boolean {
  if (token === '__DYN__') return true;
  return (
    token.includes('(') ||
    token.includes('::') ||
    /\bas\b/i.test(token) ||
    token.includes("'") ||
    token.includes('*') ||
    /^[0-9]/.test(token)
  );
}

function columnList(part: string): string[] {
  return part
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Analyse one statement; returns violations (unknown columns). */
function analyzeStatement(sql: string, tables: Map<string, Set<string>>): SqlColumnViolation[] {
  const violations: SqlColumnViolation[] = [];
  const aliases = buildAliasMap(sql);
  const stmtTables = tablesInStatement(sql);

  const record = (table: string | undefined, column: string, kind: SqlColumnViolation['kind']) => {
    if (!table) return;
    const columns = tables.get(table);
    if (!columns) return; // unknown table — not this guard's concern
    if (columns.has(column)) return;
    violations.push({ file: '', line: 0, table, column, kind });
  };

  // SELECT <list> FROM ...
  const selectMatch = /SELECT\s+([\s\S]*?)\s+FROM\s/i.exec(sql);
  if (selectMatch) {
    const list = selectMatch[1]!;
    if (!list.includes('*')) {
      for (const token of columnList(list)) {
        if (isExpression(token)) continue;
        const qualified = new RegExp(`^(${IDENT})\\.(\\w+)$`, 'i').exec(token);
        if (qualified) {
          record(aliases.get(qualified[1]!.toLowerCase()), qualified[2]!, 'select');
        } else if (/^\w+$/.test(token) && stmtTables.size === 1) {
          record([...stmtTables][0], token, 'select');
        }
      }
    }
  }

  // INSERT INTO <table> (cols)
  const insertMatch = /INSERT INTO\s+"?(IDENT)?"?\s*\(([^)]+)\)/i.exec(
    sql.replace(/IDENT/g, IDENT),
  );
  if (insertMatch) {
    const table = insertMatch[1]!.toLowerCase();
    for (const token of columnList(insertMatch[2]!)) {
      if (isExpression(token) || !/^\w+$/.test(token)) continue;
      record(table, token, 'insert');
    }
  }

  // UPDATE <table> SET col = ...
  const updateMatch = new RegExp(
    `UPDATE\\s+"?(${IDENT})"?\\s+SET\\s+([\\s\\S]*?)(?:\\bWHERE\\b|$)`,
    'i',
  ).exec(sql);
  if (updateMatch) {
    const table = updateMatch[1]!.toLowerCase();
    for (const assignment of columnList(updateMatch[2]!)) {
      const col = assignment.split('=')[0]!.trim();
      if (isExpression(col) || !/^\w+$/.test(col)) continue;
      record(table, col, 'update');
    }
  }

  return violations;
}

// ── Entry point ──────────────────────────────────────────────────────

export function checkSqlColumns(root: string): SqlColumnScanResult {
  const schemaPath = join(root, 'packages', 'db', 'migrations', 'schema.sql');
  if (!existsSync(schemaPath)) {
    return {
      failures: 1,
      messages: ['[sql-columns] packages/db/migrations/schema.sql not found.'],
      checked: 0,
      skipped: 0,
      violations: [],
      exempted: [],
    };
  }
  const tables = parseSchemaTables(readFileSync(schemaPath, 'utf8'));

  const files: string[] = [];
  for (const rel of SCAN_ROOTS) walk(join(root, rel), files);

  const violations: SqlColumnViolation[] = [];
  const exempted: SqlColumnViolation[] = [];
  let checked = 0;
  let skipped = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { sql, line } of extractSqlFragments(source)) {
      // Interpolated fragments still carry static column lists (the drift that
      // started this guard — `SELECT entry_id, tokens, ... WHERE ${conditions}` —
      // was inside one). Replace the interpolation with a placeholder so the
      // static parts are still checked; placeholder tokens are dropped below.
      const dynamic = sql.includes('${');
      if (dynamic) skipped += 1;
      const analysable = dynamic ? sql.replace(/\$\{[^}]*\}/g, ' __DYN__ ') : sql;
      checked += 1;
      for (const v of analyzeStatement(analysable, tables)) {
        const withLoc: SqlColumnViolation = { ...v, file: relative(root, file), line };
        const reason = isExempt(v.table, v.column);
        if (reason) exempted.push(withLoc);
        else violations.push(withLoc);
      }
    }
  }

  const messages: string[] = [];
  for (const v of violations) {
    messages.push(
      `[sql-columns] ${v.file}:${v.line} references ${v.table}.${v.column} (${v.kind}) — column not in applied schema`,
    );
  }
  return { failures: messages.length, messages, checked, skipped, violations, exempted };
}

function main(): void {
  const root = resolve(import.meta.dirname, '..');
  const result = checkSqlColumns(root);
  for (const e of result.exempted) {
    const reason = isExempt(e.table, e.column) ?? '';
    console.warn(`[sql-columns] exempted ${e.file}:${e.line} ${e.table}.${e.column} — ${reason}`);
  }
  console.log(
    `[sql-columns] ${result.checked} statement(s) checked, ${result.skipped} dynamic fragment(s) skipped, ${result.exempted.length} exempted.`,
  );
  finishCheckRun({
    name: '[sql-columns]',
    result,
    remedy:
      'Fix the SQL to use columns that exist in packages/db/migrations/schema.sql, or add the column to the applied DDL. Exemptions must name a tracked debt.',
    passedMessage: '[sql-columns] every raw-SQL column reference exists in the applied schema.',
  });
}

const isDirectRun = !process.env.VITEST && (process.argv[1] ?? '').includes('check-sql-columns');
if (isDirectRun) {
  main();
}
