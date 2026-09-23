/**
 * SQL Reference Guard (check:sql-columns) — strict AST pass (T3).
 *
 * Closes the gap that let the retrieval-latency incident through: every
 * existing check was TABLE-NAME level only, so raw SQL referencing a column
 * that does not exist in the applied schema shipped to production and failed at
 * runtime — silently, because the call site caught it and fell back
 * (`[hybridRecall] DB search failed, falling back to in-memory`).
 *
 * Two data sources:
 *   - `packages/db/migrations/schema.sql` — the DDL `runMigrations` executes
 *     (CREATE TABLE plus every later ALTER/DROP, see `lib/applied-schema.ts`),
 *     parsed statically so the guard needs no PostgreSQL and runs in plain CI;
 *   - SQL string literals in every package's `src` tree, extracted by
 *     `lib/sql-extraction.ts` (quote- and comment-aware) and analysed on a real
 *     PostgreSQL grammar by `lib/sql-ast-analysis.ts`.
 *
 * What it enforces, per statement: unknown tables, alias typos, columns that
 * resolve in no table of the statement's scope, `INSERT` column lists,
 * `UPDATE ... SET` targets and `ON CONFLICT (...)` targets. See the analyzer's
 * header for the exact rules and for what is deliberately opaque (`SELECT *`,
 * unresolvable subquery projections).
 *
 * Strictness policy:
 *   - a violation never has an exemption — fix it;
 *   - a statement whose structural parts are all `${}`-interpolated cannot be
 *     analysed, so it must be declared in `DYNAMIC_STATEMENTS` with a reason and
 *     a stable shape. That list is the audit trail for "SQL we cannot see", and
 *     a new dynamic statement fails the guard until it is declared.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { parseAppliedSchema } from './lib/applied-schema.js';
import { finishCheckRun } from './lib/check-result.js';
import {
  analyzeSqlStatement,
  normalizeForAnalysis,
  type SqlAnalysisKind,
} from './lib/sql-ast-analysis.js';
import { createHoleResolver } from './lib/sql-constants.js';
import { extractSqlFragments } from './lib/sql-extraction.js';

// ── Types ────────────────────────────────────────────────────────────

export interface SqlColumnViolation {
  /** Repo-relative file path. */
  file: string;
  line: number;
  table: string;
  column: string;
  kind: SqlAnalysisKind;
}

/**
 * Statements the analyzer cannot see into: each contains at least one value that
 * only exists at runtime (a composed `WHERE`/`SET` list, a function parameter, a
 * computed lease). Nothing static is left to check, so instead of pretending,
 * the guard requires the file to be *declared here* with an exact count.
 *
 * Exact counts cut both ways on purpose: a new unverifiable statement in a
 * declared file fails the guard until someone either makes it static or raises
 * the count with a reason, and a stale count (the SQL got simpler) fails too.
 * That is the difference between a documented blind spot and a silent one.
 */
const DYNAMIC_SQL: ReadonlyArray<{ file: string; allowed: number; reason: string }> = [
  {
    file: 'packages/service-job-runtime/src/async-runtime.ts',
    allowed: 4,
    reason:
      'claim/lease SQL: status constants resolve, but lease and attempt values come from env-tunable policy functions',
  },
  {
    file: 'packages/service-knowledge-write/src/experience-gene-repository.ts',
    allowed: 3,
    reason: 'gene queries build their WHERE clause by pushing conditions at runtime',
  },
  {
    file: 'packages/service-knowledge-read/src/search/capsule-recall.ts',
    allowed: 3,
    reason: 'capsule recall composes its column/where fragments from runtime values',
  },
  {
    file: 'packages/service-identity-access/src/pg-ports.ts',
    allowed: 3,
    reason:
      'membership lookup switches on a runtime column name; audit paging composes its WHERE prefix and limit at runtime',
  },
  {
    file: 'packages/service-knowledge-write/src/labels/repository/pg-repository.ts',
    allowed: 2,
    reason: 'label similarity query interpolates a runtime vector literal',
  },
  {
    file: 'packages/service-governance-review/src/pg-ports.ts',
    allowed: 2,
    reason:
      'feedback/conflict helpers build their SET list and WHERE clause from a caller-supplied field map',
  },
  {
    file: 'packages/service-knowledge-write/src/knowledge-projection.ts',
    allowed: 1,
    reason:
      'knowledge list query composes its WHERE clause through the appendLabelProjectionCondition builders',
  },
  {
    file: 'packages/service-knowledge-read/src/retrieval-infra-default.ts',
    allowed: 1,
    reason: 'keyword recall pushes its filter conditions into an array at runtime',
  },
  {
    file: 'packages/service-knowledge-read/src/knowledge-vector-search-port.ts',
    allowed: 1,
    reason: 'vector search pushes its filter conditions into an array at runtime',
  },
  {
    file: 'packages/service-cron/src/pg-ports.ts',
    allowed: 1,
    reason: 'generic cron-job update builds its SET list from a caller-supplied field map',
  },
  {
    file: 'packages/host-distributed/src/knowledge-read/ports.ts',
    allowed: 1,
    reason: 'internal read pagination composes its WHERE clause and limit at runtime',
  },
];

/** Declared allowance for a file, or null when the file is not declared. */
function declaredFor(
  file: string,
  declarations: DynamicSqlDeclaration = DYNAMIC_SQL,
): { allowed: number; reason: string } | null {
  const entry = declarations.find((candidate) => candidate.file === file);
  return entry ? { allowed: entry.allowed, reason: entry.reason } : null;
}

export type DynamicSqlDeclaration = ReadonlyArray<{
  file: string;
  allowed: number;
  reason: string;
}>;

export interface SqlColumnScanResult {
  failures: number;
  messages: string[];
  /** Reason declared for a file, when the caller echoes it back. */
  declaredReason?: (file: string) => string | null;
  /** Statements cross-checked against the applied schema. */
  checked: number;
  /** Statements with `${}` interpolation somewhere in their text. */
  dynamic: number;
  violations: SqlColumnViolation[];
  /** Statements declared in DYNAMIC_STATEMENTS, reported for visibility. */
  declared: SqlColumnViolation[];
}

// ── Schema parsing ───────────────────────────────────────────────────

/** table -> column set, parsed from the applied DDL. */
export function parseSchemaTables(schemaSql: string): Map<string, Set<string>> {
  return parseAppliedSchema(schemaSql).tables;
}

// ── Source walking ───────────────────────────────────────────────────

/** Every package's `src` tree; tests, fixtures and `dist` are excluded. */
function scanRoots(root: string): string[] {
  const roots: string[] = [];
  for (const container of ['packages']) {
    let entries: string[];
    try {
      entries = readdirSync(join(root, container));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const src = join(root, container, entry, 'src');
      try {
        if (statSync(src).isDirectory()) roots.push(src);
      } catch {
        // not every package has a src dir
      }
    }
  }
  return roots;
}

const SKIP_DIRS = new Set(['node_modules', 'dist']);

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.includes('.test.')) {
      out.push(full);
    }
  }
}

// ── Analysis ─────────────────────────────────────────────────────────

export async function checkSqlColumns(
  root: string,
  /** Overridable so tests can exercise the declaration rules on a temp repo. */
  declarations: DynamicSqlDeclaration = DYNAMIC_SQL,
): Promise<SqlColumnScanResult> {
  const schemaPath = join(root, 'packages', 'db', 'migrations', 'schema.sql');
  const tables = parseSchemaTables(readFileSync(schemaPath, 'utf8'));

  const files: string[] = [];
  for (const dir of scanRoots(root)) walk(dir, files);

  const violations: SqlColumnViolation[] = [];
  const declared: SqlColumnViolation[] = [];
  const declaredCounts = new Map<string, number>();
  let checked = 0;
  let dynamic = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(root, file);
    // Resolve `${COLUMNS}` / `${someTable}` where they are file-local constants
    // or drizzle table names, so the statement's structure stays checkable.
    const resolveHole = await createHoleResolver(root, source, file);
    for (const fragment of extractSqlFragments(source, resolveHole)) {
      checked += 1;
      if (fragment.dynamic) dynamic += 1;
      const unresolved = fragment.holes.filter((hole) => resolveHole(hole) === null).length;
      const normalized = normalizeForAnalysis(fragment.sql);

      // A statement whose structure still depends on runtime values cannot be
      // verified; it must be declared, and it is reported either way.
      if (unresolved > 0) {
        declaredCounts.set(rel, (declaredCounts.get(rel) ?? 0) + 1);
        declared.push({
          file: rel,
          line: fragment.line,
          table: '',
          column: '',
          kind: 'dynamic-statement',
        });
        continue;
      }
      for (const violation of analyzeSqlStatement(normalized, tables)) {
        violations.push({
          file: rel,
          line: fragment.line,
          table: violation.table,
          column: violation.column,
          kind: violation.kind,
        });
      }
    }
  }

  for (const entry of declarations) {
    const actual = declaredCounts.get(entry.file) ?? 0;
    if (actual === entry.allowed) continue;
    violations.push({
      file: entry.file,
      line: 0,
      table: '',
      column: `declared ${entry.allowed}, found ${actual}`,
      kind: 'dynamic-statement',
    });
  }
  for (const file of declaredCounts.keys()) {
    if (!declaredFor(file, declarations)) {
      violations.push({
        file,
        line: 0,
        table: '',
        column: 'undeclared dynamic statement',
        kind: 'dynamic-statement',
      });
    }
  }

  const messages: string[] = [];
  for (const violation of violations) {
    const location = violation.line > 0 ? `${violation.file}:${violation.line}` : violation.file;
    const target = violation.table ? `${violation.table}.${violation.column}` : violation.column;
    messages.push(`[sql-columns] ${location} ${violation.kind}${target ? `: ${target}` : ''}`);
  }
  return {
    failures: messages.length,
    messages,
    checked,
    dynamic,
    violations,
    declared,
    declaredReason: (file: string) => declaredFor(file)?.reason ?? null,
  };
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const result = await checkSqlColumns(root);
  for (const item of result.declared) {
    const reason =
      result.declaredReason?.(item.file) ?? declaredFor(item.file)?.reason ?? 'undeclared';
    console.warn(`[sql-columns] dynamic statement ${item.file}:${item.line} — ${reason}`);
  }
  console.log(
    `[sql-columns] ${result.checked} statement(s) checked, ${result.dynamic} with interpolation, ${result.declared.length} declared dynamic.`,
  );
  finishCheckRun({
    name: '[sql-columns]',
    result,
    remedy:
      'Fix the SQL to use tables and columns that exist in packages/db/migrations/schema.sql, or add the missing DDL. A statement whose structure comes from runtime values must be declared in DYNAMIC_SQL with an exact count and a reason.',
    passedMessage: '[sql-columns] every raw-SQL reference exists in the applied schema.',
  });
}

const isDirectRun = !process.env.VITEST && (process.argv[1] ?? '').includes('check-sql-columns');
if (isDirectRun) {
  await main();
}
