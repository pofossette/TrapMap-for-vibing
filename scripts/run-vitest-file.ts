import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VitestProjectTarget {
  projectName: string;
  repoPrefix: string;
}

export interface ResolvedVitestFileTarget {
  absolutePath: string;
  repoRelativePath: string;
  projectName: string;
  projectFilePath: string;
}

const PROJECT_TARGETS: readonly VitestProjectTarget[] = [
  { projectName: 'scripts', repoPrefix: 'scripts/' },
  { projectName: 'contracts', repoPrefix: 'packages/contracts/' },
  { projectName: 'server', repoPrefix: 'packages/server/' },
  { projectName: 'host-distributed', repoPrefix: 'packages/host-distributed/' },
  { projectName: 'cli', repoPrefix: 'packages/cli/' },
  { projectName: 'evals', repoPrefix: 'evals/' },
] as const;

function normalizeRepoPath(path: string): string {
  return path.split(sep).join('/');
}

function trimLeadingCurrentDir(path: string): string {
  return path.replace(/^(?:\.\/)+/, '');
}

export function resolveVitestFileTarget(
  inputPath: string,
  repoRoot: string,
  cwd: string,
): ResolvedVitestFileTarget {
  const trimmedInputPath = inputPath.trim();
  if (trimmedInputPath.length === 0) {
    throw new Error(
      'Missing test file path. Usage: pnpm test:file -- <repo-root-relative-test-path>',
    );
  }

  const absolutePath = resolve(cwd, trimmedInputPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Test file not found: ${trimmedInputPath}`);
  }

  const fileStat = statSync(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error(`Expected a file path but received: ${trimmedInputPath}`);
  }

  const repoRelativePath = normalizeRepoPath(
    trimLeadingCurrentDir(relative(repoRoot, absolutePath)),
  );
  if (repoRelativePath.startsWith('../') || repoRelativePath === '..') {
    throw new Error(`Test file must be inside the repository: ${trimmedInputPath}`);
  }

  const matchedProject = PROJECT_TARGETS.find((target) =>
    repoRelativePath.startsWith(target.repoPrefix),
  );
  if (!matchedProject) {
    throw new Error(`Test file is not under a supported Vitest project root: ${repoRelativePath}`);
  }

  const projectFilePath = repoRelativePath.slice(matchedProject.repoPrefix.length);
  if (projectFilePath.length === 0) {
    throw new Error(`Test file path does not resolve within project ${matchedProject.projectName}`);
  }

  return {
    absolutePath,
    repoRelativePath,
    projectName: matchedProject.projectName,
    projectFilePath,
  };
}

export function buildVitestCommandArgs(target: ResolvedVitestFileTarget): string[] {
  return ['exec', 'vitest', 'run', '--project', target.projectName, target.projectFilePath];
}

function getInputPathArg(argv: readonly string[]): string {
  const positionalArgs = argv.slice(2).filter((arg) => arg !== '--');
  return positionalArgs[0] ?? '';
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, '..');
  const inputPath = getInputPathArg(process.argv);

  let target: ResolvedVitestFileTarget;
  try {
    target = resolveVitestFileTarget(inputPath, repoRoot, process.cwd());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[test:file] ${message}`);
    process.exit(1);
    return;
  }

  const child = spawn('pnpm', buildVitestCommandArgs(target), {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(`[test:file] Failed to start Vitest: ${error.message}`);
    process.exit(1);
  });
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  void main();
}
