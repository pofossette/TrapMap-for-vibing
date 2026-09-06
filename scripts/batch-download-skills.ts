#!/usr/bin/env node
/**
 * Batch Skill Download Script
 *
 * Downloads Claude Code skills from public GitHub repositories and converts them
 * to TrapMap's ArtifactBundle format for import via POST /v1/operations/artifacts/import.
 *
 * Usage:
 *   pnpm download:skills
 *   pnpm download:skills:dry
 *   pnpm exec tsx scripts/batch-download-skills.ts --repos anthropics/skills --verbose
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';

import {
  type ArtifactBundle,
  artifactBundleSchema,
  type BundleFilePayload,
} from '../packages/contracts/src/index.js';

// =============================================================================
// Repository Registry
// =============================================================================

interface RepoConfig {
  owner: string;
  name: string;
  label: string;
}

/**
 * All available repositories. Use --repos all to download from all sources.
 */
const ALL_REPOS: RepoConfig[] = [
  { owner: 'anthropics', name: 'skills', label: 'anthropics' },
  { owner: 'ComposioHQ', name: 'awesome-claude-skills', label: 'composio' },
  { owner: 'alirezarezvani', name: 'claude-skills', label: 'alirezarezvani' },
  { owner: 'jezweb', name: 'claude-skills', label: 'jezweb' },
  { owner: 'daymade', name: 'claude-code-skills', label: 'daymade' },
  { owner: 'testcontainers', name: 'claude-skills', label: 'testcontainers' },
  { owner: 'ykdojo', name: 'claude-code-tips', label: 'ykdojo' },
];

/**
 * Default repos (curated subset). Use --repos all for all 7 repos.
 */
const DEFAULT_REPOS: RepoConfig[] = [
  { owner: 'anthropics', name: 'skills', label: 'anthropics' },
  { owner: 'daymade', name: 'claude-code-skills', label: 'daymade' },
];

// =============================================================================
// Constants
// =============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const LABEL_REGEX = /^[a-z0-9:_/-]+$/;
const TEMP_DIR = './data/skill-repos';
const DEFAULT_OUTPUT_DIR = './data/downloaded-skills';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CliOptions {
  outputDir: string;
  repos: RepoConfig[];
  dryRun: boolean;
  verbose: boolean;
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    options: {
      'output-dir': {
        type: 'string',
        short: 'o',
        default: DEFAULT_OUTPUT_DIR,
      },
      repos: {
        type: 'string',
        short: 'r',
        default: '',
      },
      'dry-run': {
        type: 'boolean',
        short: 'd',
        default: false,
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false,
      },
    },
    strict: true,
  });

  // Parse repos if provided
  let repos = DEFAULT_REPOS;
  if (values.repos) {
    const reposArg = values.repos.trim();
    if (reposArg === 'all') {
      repos = ALL_REPOS;
    } else {
      repos = reposArg.split(',').map((repo) => {
        const [owner, name] = repo.trim().split('/');
        if (!owner || !name) {
          throw new Error(`Invalid repo format: ${repo}. Expected format: owner/name`);
        }
        return { owner, name, label: owner.toLowerCase() };
      });
    }
  }

  return {
    outputDir: values['output-dir'],
    repos,
    dryRun: values['dry-run'],
    verbose: values.verbose,
  };
}

// =============================================================================
// Git Operations
// =============================================================================

async function cloneRepo(repo: RepoConfig, targetDir: string, verbose: boolean): Promise<boolean> {
  const repoUrl = `https://github.com/${repo.owner}/${repo.name}.git`;
  const repoDir = join(targetDir, repo.name);

  // Skip if already cloned
  if (existsSync(repoDir)) {
    if (verbose) {
      console.log(`  [skip] ${repo.owner}/${repo.name} already cloned`);
    }
    return true;
  }

  return new Promise((resolve) => {
    if (verbose) {
      console.log(`  [clone] ${repo.owner}/${repo.name}...`);
    }

    const git = spawn('git', ['clone', '--depth', '1', repoUrl, repoDir], {
      stdio: verbose ? 'inherit' : 'pipe',
    });

    git.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        console.error(`  [error] Failed to clone ${repo.owner}/${repo.name}: exit code ${code}`);
        resolve(false);
      }
    });

    git.on('error', (err) => {
      console.error(`  [error] Failed to clone ${repo.owner}/${repo.name}: ${err.message}`);
      resolve(false);
    });
  });
}

// =============================================================================
// Skill Discovery
// =============================================================================

interface DiscoveredSkill {
  path: string;
  repo: RepoConfig;
}

function discoverSkills(
  reposDir: string,
  repos: RepoConfig[],
  verbose: boolean,
): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = [];

  for (const repo of repos) {
    const repoDir = join(reposDir, repo.name);
    if (!existsSync(repoDir)) {
      if (verbose) {
        console.log(`  [skip] ${repo.owner}/${repo.name} not found`);
      }
      continue;
    }

    const repoSkills = findSkillsInDir(repoDir, repo);
    if (verbose) {
      console.log(`  [found] ${repo.owner}/${repo.name}: ${repoSkills.length} skills`);
    }
    skills.push(...repoSkills);
  }

  return skills;
}

/**
 * Recursively walk a directory tree, skipping hidden entries and node_modules.
 * The visitor receives each entry's full path. Permission errors are ignored,
 * matching the original scan behavior.
 */
function walkDirectory(
  dir: string,
  visit: (entry: import('node:fs').Dirent, fullPath: string) => void,
): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      const fullPath = join(dir, entry.name);
      visit(entry, fullPath);

      if (entry.isDirectory()) {
        walkDirectory(fullPath, visit);
      }
    }
  } catch (_err) {
    // Ignore permission errors, etc.
  }
}

function findSkillsInDir(rootDir: string, repo: RepoConfig): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = [];

  walkDirectory(rootDir, (entry, fullPath) => {
    if (entry.isDirectory()) {
      // Check if this dir has SKILL.md
      const skillMdPath = join(fullPath, 'SKILL.md');
      if (existsSync(skillMdPath)) {
        skills.push({ path: fullPath, repo });
      }
    }
  });

  return skills;
}

// =============================================================================
// MIME Type Detection
// =============================================================================

function detectMimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.yml': 'text/x-yaml',
    '.yaml': 'text/x-yaml',
    '.sh': 'text/x-shellscript',
    '.bash': 'text/x-shellscript',
    '.zsh': 'text/x-shellscript',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.py': 'text/x-python',
    '.rb': 'text/x-ruby',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
    '.hpp': 'text/x-c++',
    '.css': 'text/css',
    '.html': 'text/html',
    '.xml': 'text/xml',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.dockerfile': 'text/x-dockerfile',
    '.dockerignore': 'text/plain',
    '.gitignore': 'text/plain',
    '.env': 'text/plain',
    '.example': 'text/plain',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

// =============================================================================
// File Content Reading
// =============================================================================

async function readFileContent(
  path: string,
): Promise<{ content: string; isBinary: boolean; sizeBytes: number }> {
  const buffer = await readFile(path);
  const mimeType = detectMimeType(path);

  // If MIME type starts with text/, return as UTF-8 string
  if (mimeType.startsWith('text/')) {
    return { content: buffer.toString('utf8'), isBinary: false, sizeBytes: buffer.length };
  }

  // Otherwise return as base64
  return { content: buffer.toString('base64'), isBinary: true, sizeBytes: buffer.length };
}

// =============================================================================
// Hash Computation
// =============================================================================

function computeFileHash(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

// =============================================================================
// Skill Metadata Parsing
// =============================================================================

interface SkillMetadata {
  title: string;
  labels: string[];
}

function parseSkillMetadata(content: string): SkillMetadata | null {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

  if (!frontmatterMatch?.[1]) {
    return null;
  }

  const frontmatterRaw = frontmatterMatch[1];
  const lines = frontmatterRaw.split('\n');
  const frontmatter: Record<string, string> = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    const unquoted = value.replace(/^["']|["']$/g, '');
    frontmatter[key] = unquoted;
  }

  const name = frontmatter.name;
  if (!name) {
    return null;
  }

  // Extract labels if present
  const labelsRaw = frontmatter.labels;
  const labels = labelsRaw
    ? labelsRaw
        .toString()
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean)
    : ['imported'];

  return { title: name, labels };
}

// =============================================================================
// Slug Generation
// =============================================================================

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// =============================================================================
// Label Sanitization
// =============================================================================

function sanitizeLabel(label: string): string {
  // Convert to lowercase and replace invalid chars
  let sanitized = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9:_/-]/g, '-')
    .slice(0, 48);

  // Ensure it matches the schema
  if (!LABEL_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(/[^a-z0-9:_/-]/g, '');
  }

  return sanitized;
}

/**
 * Read and parse SKILL.md metadata, falling back to defaults on failure.
 */
async function readSkillMetadata(
  skillMd: string,
  skillPath: string,
): Promise<{ title: string; labels: string[] }> {
  try {
    const content = await readFile(skillMd, 'utf8');
    const metadata = parseSkillMetadata(content);
    if (metadata) {
      return { title: metadata.title, labels: metadata.labels };
    }
  } catch (_err) {
    console.warn(`  [warn] Failed to read SKILL.md: ${skillPath}`);
  }
  return { title: 'Untitled Skill', labels: ['imported'] };
}

/**
 * Build the full label set for a skill bundle: base labels, frontmatter
 * labels, and path-segment labels.
 */
function buildLabelSet(
  frontmatterLabels: string[],
  skillPath: string,
  repoLabel: string,
): Set<string> {
  const allLabels = new Set<string>();

  allLabels.add('imported');
  allLabels.add('batch-download');
  allLabels.add(sanitizeLabel(repoLabel));

  for (const label of frontmatterLabels) {
    const sanitized = sanitizeLabel(label);
    if (sanitized) allLabels.add(sanitized);
  }

  for (const segment of skillPath.split('/').slice(-3)) {
    const sanitized = sanitizeLabel(segment);
    if (sanitized && sanitized.length > 2) allLabels.add(sanitized);
  }

  return allLabels;
}

// =============================================================================
// Directory Scanning
// =============================================================================

interface ScannedFiles {
  skillMd: string | null;
  references: string[];
  assets: string[];
  scripts: string[];
}

function scanSkillDirectory(rootPath: string): ScannedFiles {
  let skillMd: string | null = null;
  const references: string[] = [];
  const assets: string[] = [];
  const scripts: string[] = [];

  walkDirectory(rootPath, (entry, fullPath) => {
    if (entry.isFile()) {
      const relPath = relative(rootPath, fullPath);
      if (relPath.includes('node_modules')) {
        return;
      }
      // Classify file by directory
      if (relPath === 'SKILL.md') {
        skillMd = fullPath;
      } else if (relPath.startsWith('references/')) {
        references.push(relPath);
      } else if (relPath.startsWith('assets/')) {
        assets.push(relPath);
      } else if (relPath.startsWith('scripts/')) {
        scripts.push(relPath);
      }
    }
  });

  return { skillMd, references, assets, scripts };
}

// =============================================================================
// Artifact Bundle Building
// =============================================================================

interface BundleFileSpec {
  fullPath: string;
  relPath: string;
  kind: 'reference' | 'asset' | 'script';
  source: 'references/' | 'assets/' | 'scripts/';
  includeInDerivation: boolean;
  activationOnly: boolean;
}

/**
 * Read a bundled file (size-capped) and push it onto `files`. Warns and skips
 * files that are too large or unreadable, matching the original per-kind loops.
 */
async function addBundleFile(files: BundleFilePayload[], spec: BundleFileSpec): Promise<void> {
  try {
    const buffer = await readFile(spec.fullPath);
    if (buffer.length > MAX_FILE_SIZE) {
      console.warn(`  [warn] Skipping large file (${buffer.length} bytes): ${spec.relPath}`);
      return;
    }

    const { content } = await readFileContent(spec.fullPath);
    const sha256 = computeFileHash(buffer);
    const mediaType = detectMimeType(spec.relPath);

    files.push({
      path: spec.relPath,
      kind: spec.kind,
      sha256,
      sizeBytes: buffer.length,
      mediaType,
      source: spec.source,
      includeInDerivation: spec.includeInDerivation,
      activationOnly: spec.activationOnly,
      content,
    });
  } catch (_err) {
    console.warn(`  [warn] Failed to read ${spec.kind}: ${spec.relPath}`);
  }
}

async function buildArtifactBundle(skill: DiscoveredSkill): Promise<ArtifactBundle | null> {
  const { path: skillPath, repo } = skill;

  // Scan directory for files
  const { skillMd, references, assets, scripts } = scanSkillDirectory(skillPath);

  if (!skillMd) {
    console.warn(`  [warn] No SKILL.md found in ${skillPath}`);
    return null;
  }

  const { title, labels } = await readSkillMetadata(skillMd, skillPath);

  const slug = generateSlug(title);

  const allLabels = buildLabelSet(labels, skillPath, repo.label);

  // Build files array
  const files: BundleFilePayload[] = [];

  // Add SKILL.md
  try {
    const buffer = await readFile(skillMd);
    if (buffer.length > MAX_FILE_SIZE) {
      console.warn(`  [warn] SKILL.md too large (${buffer.length} bytes): ${skillPath}`);
    } else {
      const { content } = await readFileContent(skillMd);
      const sha256 = computeFileHash(buffer);

      files.push({
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256,
        sizeBytes: buffer.length,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
        content,
      });
    }
  } catch (_err) {
    console.warn(`  [warn] Failed to read SKILL.md: ${skillPath}`);
  }

  // Add references
  for (const relPath of references) {
    await addBundleFile(files, {
      fullPath: join(skillPath, relPath),
      relPath,
      kind: 'reference',
      source: 'references/',
      includeInDerivation: true,
      activationOnly: false,
    });
  }

  // Add assets
  for (const relPath of assets) {
    await addBundleFile(files, {
      fullPath: join(skillPath, relPath),
      relPath,
      kind: 'asset',
      source: 'assets/',
      includeInDerivation: false,
      activationOnly: true,
    });
  }

  // Add scripts
  for (const relPath of scripts) {
    await addBundleFile(files, {
      fullPath: join(skillPath, relPath),
      relPath,
      kind: 'script',
      source: 'scripts/',
      includeInDerivation: false,
      activationOnly: true,
    });
  }

  // Ensure at least one file
  if (files.length === 0) {
    console.warn(`  [warn] No files found for skill: ${skillPath}`);
    return null;
  }

  // Build script descriptors
  const scriptDescriptors = scripts
    .filter((relPath) => files.some((f) => f.path === relPath))
    .map((relPath) => ({
      path: relPath,
      sha256: files.find((f) => f.path === relPath)?.sha256 ?? '',
      capability: `${relPath} execution`,
      argsSchemaSummary: '',
      sideEffectSummary: '',
      defaultPolicy: 'manual' as const,
    }));

  const bundle: ArtifactBundle = {
    scope: 'project',
    labels: Array.from(allLabels),
    title,
    slug,
    requiredLevel: 5,
    sourceKind: 'skill-directory',
    files,
    scriptDescriptors,
  };

  return bundle;
}

// =============================================================================
// Output Writing
// =============================================================================

function writeOutput(
  bundles: ArtifactBundle[],
  outputDir: string,
  skills: DiscoveredSkill[],
): void {
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write bundle JSON
  const outputPath = join(outputDir, 'skill-bundles.json');
  writeFileSync(outputPath, JSON.stringify({ bundles }, null, 2), 'utf8');
  console.log(`\nWrote ${bundles.length} bundles to ${outputPath}`);

  // Copy raw skill files to output/<repo-label>/<skill-name>/
  const rawDir = join(outputDir, 'raw');
  let rawCount = 0;
  for (const skill of skills) {
    const slug = basename(skill.path);
    const dest = join(rawDir, skill.repo.label, slug);
    try {
      cpSync(skill.path, dest, { recursive: true, filter: (src) => !src.includes('.git') });
      rawCount++;
    } catch (err) {
      console.warn(`  [warn] Failed to copy raw files for ${slug}: ${err}`);
    }
  }
  console.log(`Copied ${rawCount} raw skill directories to ${rawDir}`);
}

// =============================================================================
// Summary Printing
// =============================================================================

function printSummary(bundles: ArtifactBundle[], repos: RepoConfig[]): void {
  console.log('\n=== Summary ===');
  console.log(`Total bundles: ${bundles.length}`);
  console.log(`Repositories processed: ${repos.length}`);

  // Count by repo label
  const byRepo: Record<string, number> = {};
  for (const bundle of bundles) {
    const repoLabel = bundle.labels.find((l) => repos.some((r) => r.label === l)) ?? 'unknown';
    byRepo[repoLabel] = (byRepo[repoLabel] ?? 0) + 1;
  }

  console.log('\nBundles by repository:');
  for (const [label, count] of Object.entries(byRepo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label}: ${count}`);
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const options = parseCliArgs();

  console.log('=== Batch Skill Download ===');
  console.log(`Output directory: ${options.outputDir}`);
  console.log(`Repositories: ${options.repos.length}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Verbose: ${options.verbose}`);

  // Step 1: Clone repositories
  console.log('\n[1/4] Cloning repositories...');
  for (const repo of options.repos) {
    await cloneRepo(repo, TEMP_DIR, options.verbose);
  }

  // Step 2: Discover skills
  console.log('\n[2/4] Discovering skills...');
  const skills = discoverSkills(TEMP_DIR, options.repos, options.verbose);
  console.log(`Found ${skills.length} total skills`);

  // Step 3: Build bundles
  console.log('\n[3/4] Building artifact bundles...');
  const bundles: ArtifactBundle[] = [];
  const errors: string[] = [];

  for (const skill of skills) {
    try {
      const bundle = await buildArtifactBundle(skill);
      if (bundle) {
        // Validate against schema
        artifactBundleSchema.parse(bundle);
        bundles.push(bundle);
        if (options.verbose) {
          console.log(`  [ok] ${bundle.title} (${bundle.files.length} files)`);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${skill.path}: ${errorMsg}`);
      console.warn(`  [error] ${skill.path}: ${errorMsg}`);
    }
  }

  console.log(`\nBuilt ${bundles.length} bundles (${errors.length} errors)`);

  // Step 4: Write output (if not dry run)
  if (!options.dryRun) {
    console.log('\n[4/4] Writing output...');
    writeOutput(bundles, options.outputDir, skills);
  } else {
    console.log('\n[4/4] Dry run - skipping output');
  }

  // Print summary
  printSummary(bundles, options.repos);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const error of errors.slice(0, 10)) {
      console.log(`  - ${error}`);
    }
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
