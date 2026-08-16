#!/usr/bin/env tsx

/**
 * Skill artifact version guard (check:skills).
 *
 * Validates every SKILL.md artifact under packages/skills/:
 *   - the frontmatter must declare a valid semver version (major.minor.patch
 *     with optional prerelease/build identifiers)
 *   - optional fields (author, license, compatibility, tags) must match their
 *     expected shape when present
 *   - the version must be non-decreasing relative to the last committed
 *     version for that skill directory (git log -1 -- <dir> + git show),
 *     unless the skill has no previous version in history (first
 *     introduction) — then the monotonic check is skipped
 *
 * Frontmatter parsing is deliberately self-contained: scripts are standalone
 * tsx entry points and workspace deps (@trapmap/lib / gray-matter) are not
 * resolvable from scripts/ at runtime, so the parser below mirrors the
 * gray-matter delimiter detection used by @trapmap/lib's
 * parseMarkdownFrontmatter (^---(?:\r?\n)) and reads the flat
 * key: value subset both SKILL.md artifacts use.
 *
 * Usage:
 *   pnpm check:skills
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SEMVER_RE =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const FRONTMATTER_DELIMITER_RE = /^---(?:\r?\n)/;
const FRONTMATTER_BLOCK_RE = /^---(?:\r?\n)([\s\S]*?)(?:\r?\n)---(?:\r?\n|$)/;

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

export interface SkillFileReport {
  relPath: string;
  currentVersion: string | null;
  previousVersion: string | null;
  errors: string[];
}

/**
 * Extract the raw frontmatter block (between the leading `---` delimiters),
 * or null when the content has no parseable frontmatter. Delimiter detection
 * mirrors gray-matter as used by `@trapmap/lib`'s parseMarkdownFrontmatter.
 */
export function extractFrontmatterBlock(content: string): string | null {
  if (!FRONTMATTER_DELIMITER_RE.test(content)) {
    return null;
  }
  const match = content.match(FRONTMATTER_BLOCK_RE);
  return match === null ? null : (match[1] ?? null);
}

/**
 * Parse the flat `key: value` YAML subset used by SKILL.md frontmatter into a
 * record. Supports quoted scalars, inline arrays (`[a, b]`), and block lists
 * (`key:` followed by `- item` lines). Other lines are ignored.
 */
export function readFrontmatterFields(frontmatter: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  let pendingKey: string | null = null;
  let pendingList: string[] = [];

  const flushList = (): void => {
    if (pendingKey !== null) {
      fields[pendingKey] = pendingList;
    }
    pendingKey = null;
    pendingList = [];
  };

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const listItem = line.match(/^-\s+(.+)$/);
    if (listItem !== null && pendingKey !== null) {
      pendingList.push(stripQuotes(listItem[1] ?? ''));
      continue;
    }

    const pair = line.match(/^([A-Za-z][\w-]*):(?:\s+(.*))?$/);
    if (pair === null) {
      continue;
    }
    flushList();
    const key = pair[1] ?? '';
    const rawValue = (pair[2] ?? '').trim();
    if (rawValue.length === 0) {
      pendingKey = key;
      pendingList = [];
    } else {
      fields[key] = parseScalarValue(rawValue);
    }
  }
  flushList();
  return fields;
}

export function parseSkillFrontmatter(content: string): Record<string, unknown> {
  const block = extractFrontmatterBlock(content);
  return block === null ? {} : readFrontmatterFields(block);
}

export function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version);
}

export function parseSemver(version: string): ParsedSemver | null {
  const match = version.match(SEMVER_RE);
  if (match === null) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/**
 * Compare two semver strings; returns a negative number when `a` is older
 * than `b`, 0 when equal, a positive number when newer. Unparsable inputs
 * compare as equal (the caller validates the current version separately).
 */
export function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (parsedA === null || parsedB === null) {
    return 0;
  }
  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch - parsedB.patch;
  }
  if (parsedA.prerelease === null || parsedB.prerelease === null) {
    if (parsedA.prerelease === parsedB.prerelease) {
      return 0;
    }
    return parsedA.prerelease === null ? 1 : -1;
  }
  return comparePrerelease(parsedA.prerelease, parsedB.prerelease);
}

function comparePrerelease(a: string, b: string): number {
  const partsA = a.split('.');
  const partsB = b.split('.');
  const maxParts = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxParts; i++) {
    const partA = partsA[i];
    const partB = partsB[i];
    if (partA === undefined) {
      return -1;
    }
    if (partB === undefined) {
      return 1;
    }
    const numericA = /^\d+$/.test(partA);
    const numericB = /^\d+$/.test(partB);
    if (numericA && numericB) {
      const diff = Number(partA) - Number(partB);
      if (diff !== 0) {
        return diff;
      }
    } else if (numericA !== numericB) {
      return numericA ? -1 : 1;
    } else if (partA !== partB) {
      return partA < partB ? -1 : 1;
    }
  }
  return 0;
}

export function isNonEmptyStringList(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (!Array.isArray(value)) {
    return false;
  }
  return (
    value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0)
  );
}

/**
 * Validate the frontmatter fields of one SKILL.md artifact. Returns a list of
 * human-readable error messages; an empty list means the artifact is valid.
 */
export function validateSkillMetadata(fields: Record<string, unknown>): string[] {
  const errors: string[] = [];

  const version = fields.version;
  if (typeof version !== 'string' || !isValidSemver(version)) {
    errors.push(
      `version: missing or invalid semver (expected major.minor.patch with optional prerelease/build), got ${JSON.stringify(version)}`,
    );
  }

  for (const key of ['author', 'license']) {
    const value = fields[key];
    if (value !== undefined && (typeof value !== 'string' || value.trim().length === 0)) {
      errors.push(`${key}: must be a non-empty string when present`);
    }
  }

  if (fields.compatibility !== undefined && !isNonEmptyStringList(fields.compatibility)) {
    errors.push(
      'compatibility: must be a non-empty string or array of non-empty strings when present',
    );
  }

  if (fields.tags !== undefined && !isNonEmptyStringList(fields.tags)) {
    errors.push('tags: must be a non-empty string or array of non-empty strings when present');
  }

  return errors;
}

export function collectSkillFiles(skillsRoot: string): string[] {
  const entries = readdirSync(skillsRoot, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillFile = join(skillsRoot, entry.name, 'SKILL.md');
    if (existsSync(skillFile)) {
      files.push(skillFile);
    }
  }
  return files.sort();
}

function runGit(repoRoot: string, args: string[]): string | null {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  const stdout = result.stdout.trim();
  return stdout.length > 0 ? stdout : null;
}

/**
 * Read the version of the last committed state of the skill file. Returns
 * null when the file has no history (first introduction) or its frontmatter
 * carries no parseable version.
 */
export function readPreviousVersionFromHistory(
  repoRoot: string,
  skillDirRel: string,
  skillFileRel: string,
): string | null {
  const lastCommit = runGit(repoRoot, ['log', '--format=%H', '-1', '--', skillDirRel]);
  if (lastCommit === null) {
    return null;
  }
  const previousContent = runGit(repoRoot, ['show', `${lastCommit}:${skillFileRel}`]);
  if (previousContent === null) {
    return null;
  }
  const version = parseSkillFrontmatter(previousContent).version;
  return typeof version === 'string' && version.trim().length > 0 ? version : null;
}

export function checkSkillFile(absPath: string, repoRoot: string): SkillFileReport {
  const relPath = relative(repoRoot, absPath);
  const content = readFileSync(absPath, 'utf8');
  const fields = parseSkillFrontmatter(content);
  const errors = validateSkillMetadata(fields);

  const currentVersion = typeof fields.version === 'string' ? fields.version : null;
  let previousVersion: string | null = null;
  if (currentVersion !== null && isValidSemver(currentVersion) && errors.length === 0) {
    previousVersion = readPreviousVersionFromHistory(repoRoot, dirname(relPath), relPath);
    if (previousVersion !== null && compareSemver(currentVersion, previousVersion) < 0) {
      errors.push(
        `version regression: ${currentVersion} is older than the last committed ${previousVersion}`,
      );
    }
  }

  return { relPath, currentVersion, previousVersion, errors };
}

function parseScalarValue(raw: string): string | string[] | boolean | number {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (inner.length === 0) {
      return [];
    }
    return inner
      .split(',')
      .map((item) => stripQuotes(item.trim()))
      .filter((item) => item.length > 0);
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }
  return stripQuotes(raw);
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function main() {
  const repoRoot = resolve(import.meta.dirname, '..');
  const skillsRoot = join(repoRoot, 'packages', 'skills');
  const skillFiles = collectSkillFiles(skillsRoot);

  if (skillFiles.length === 0) {
    console.error('[check-skills] FAIL: no SKILL.md files found under packages/skills/*/');
    process.exit(1);
  }

  const reports = skillFiles.map((absPath) => checkSkillFile(absPath, repoRoot));

  for (const report of reports) {
    if (report.errors.length === 0) {
      const history =
        report.previousVersion === null
          ? 'no previous version in history'
          : `previous ${report.previousVersion}`;
      console.log(
        `[check-skills] OK   ${report.relPath}  version=${report.currentVersion ?? 'MISSING'}  (${history})`,
      );
    } else {
      console.error(
        `[check-skills] FAIL ${report.relPath}  version=${report.currentVersion ?? 'MISSING'}`,
      );
      for (const error of report.errors) {
        console.error(`  - ${error}`);
      }
    }
  }

  const failed = reports.filter((report) => report.errors.length > 0);
  if (failed.length > 0) {
    console.error(
      `[check-skills] FAIL: ${failed.length} of ${reports.length} skill artifact(s) failed`,
    );
    process.exit(1);
  }
  console.log(
    `[check-skills] OK: ${reports.length} skill artifact(s) valid, versions non-decreasing`,
  );
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-skills');
if (isDirectRun) {
  try {
    main();
  } catch (err) {
    console.error(`[check-skills] FAIL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
