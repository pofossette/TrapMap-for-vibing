/**
 * CI Pipeline Runner
 *
 * Runs all CI steps sequentially, streams real-time output, and prints a
 * summary table when done. Unlike the shell && chain, failed steps do not
 * abort the pipeline — remaining steps still execute.
 *
 * Usage:
 *   pnpm run ci                 # via package.json script
 *   pnpm exec tsx scripts/run-ci.ts
 */

import { type ChildProcess, type SpawnOptions, spawn } from 'node:child_process';
import { EOL } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepDefinition {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface StepResult {
  name: string;
  success: boolean;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  outputLines: number;
  /** Raw tail of stderr for diagnostics (last N lines) */
  tail: string;
  suppressedNoiseCount: number;
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS: StepDefinition[] = [
  {
    name: 'check:imports',
    command: 'node',
    args: ['scripts/check-relative-imports.mjs', '--only-cross-dir'],
  },
  {
    name: 'typecheck',
    command: 'pnpm',
    args: ['run', 'typecheck'],
  },
  {
    name: 'lint (biome check)',
    command: 'pnpm',
    args: ['run', 'check'],
  },
  {
    name: 'test:coverage',
    command: 'pnpm',
    args: ['run', 'test:coverage'],
    env: { NODE_ENV: 'test', OTEL_DISABLED: 'true' },
  },
  {
    name: 'check:docs',
    command: 'pnpm',
    args: ['run', 'check:docs'],
  },
  {
    name: 'check:structure',
    command: 'pnpm',
    args: ['run', 'check:structure'],
  },
  {
    name: 'check:deps',
    command: 'pnpm',
    args: ['run', 'check:deps'],
  },
  {
    name: 'check:complexity',
    command: 'pnpm',
    args: ['run', 'check:complexity'],
  },
  {
    name: 'check:asserts',
    command: 'pnpm',
    args: ['run', 'check:asserts'],
  },
  {
    name: 'check:table-schema',
    command: 'pnpm',
    args: ['run', 'check:table-schema'],
  },
  {
    name: 'check:pgtable-single-source',
    command: 'pnpm',
    args: ['run', 'check:pgtable-single-source'],
  },
  {
    name: 'check:eval-imports',
    command: 'pnpm',
    args: ['run', 'check:eval-imports'],
  },
  {
    name: 'check:eval-only',
    command: 'pnpm',
    args: ['run', 'check:eval-only'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const C_RESET = '\x1b[0m';
const C_BOLD = '\x1b[1m';
const C_RED = '\x1b[31m';
const C_GREEN = '\x1b[32m';
const C_YELLOW = '\x1b[33m';
const C_CYAN = '\x1b[36m';
const C_DIM = '\x1b[2m';

const STDERR_NOISE_PATTERNS = [/^Sourcemap for ".*" points to missing source files$/] as const;

function isKnownStderrNoise(line: string): boolean {
  return STDERR_NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

function dim(text: string): string {
  return `${C_DIM}${text}${C_RESET}`;
}

function statusTag(success: boolean): string {
  return success ? `${C_GREEN}${C_BOLD}PASS${C_RESET}` : `${C_RED}${C_BOLD}FAIL${C_RESET}`;
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1_000);
  return `${m}m ${s}s`;
}

function stepHeader(name: string, index: number, total: number): void {
  console.log('');
  console.log(
    `${C_CYAN}${C_BOLD}[${index}/${total}]${C_RESET} ${C_BOLD}${name}${C_RESET} ${dim('...')}`,
  );
  console.log('');
}

// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------

// Env-var families that must never leak into CI steps — they carry
// user-specific credentials, DB connections, or provider overrides that would
// make the test run non-deterministic.
const CI_ENV_STRIP_PREFIXES = [
  'TRAPMAP_',
  'AI_',
  'OPENAI_',
  'EMBEDDING_',
  'ANTHROPIC_',
  'AURSCAN_',
] as const;
const CI_ENV_STRIP_EXACT = new Set(['DATABASE_URL', 'POSTGRES_PASSWORD']);

function sanitizeCiEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (CI_ENV_STRIP_EXACT.has(key)) continue;
    if (CI_ENV_STRIP_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    out[key] = value;
  }
  return out;
}

function runStep(step: StepDefinition, label: string): Promise<StepResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const options: SpawnOptions = {
      stdio: ['ignore', 'inherit', 'pipe'],
      env: {
        ...sanitizeCiEnv(process.env),
        CI: process.env.CI ?? 'true',
        ...step.env,
      },
    };

    const child: ChildProcess = spawn(step.command, step.args, options);

    const stderrChunks: Buffer[] = [];
    let stderrBuffer = '';
    let suppressedNoiseCount = 0;

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBuffer += chunk.toString('utf8');

      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (isKnownStderrNoise(line)) {
          suppressedNoiseCount += 1;
          continue;
        }
        process.stderr.write(`${line}\n`);
      }
    });

    child.on('close', (exitCode, signal) => {
      const durationMs = Date.now() - start;
      const stderrText = Buffer.concat(stderrChunks).toString('utf8');
      const stderrLines = stderrText.split('\n').filter(Boolean);
      const tail = stderrLines.slice(-6).join(EOL);

      resolve({
        name: label,
        success: exitCode === 0 && signal === null,
        exitCode,
        signal,
        durationMs,
        outputLines: stderrLines.length,
        tail,
        suppressedNoiseCount,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const total = STEPS.length;
  const results: StepResult[] = [];

  console.log('');
  console.log(`${C_CYAN}${C_BOLD}═══ CI Pipeline ═══${C_RESET}`);
  console.log(`Running ${total} step(s) sequentially.`);
  console.log('');

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    stepHeader(step.name, i + 1, total);
    const result = await runStep(step, step.name);
    results.push(result);
  }

  // ── Summary ────────────────────────────────────────────────────────────

  const allPassed = results.every((r) => r.success);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log('');
  console.log(`${C_CYAN}${C_BOLD}═══ CI Summary ═══${C_RESET}`);
  console.log('');

  const nameWidth = Math.max(...results.map((r) => r.name.length), 12);

  // Header
  console.log(`  ${'Step'.padEnd(nameWidth)}  ${'Status'}   ${'Duration'.padStart(10)}`);
  console.log(`  ${dim('─'.repeat(nameWidth))}  ${dim('──────')}   ${dim('─'.repeat(10))}`);

  // Rows
  for (const r of results) {
    const name = r.name.padEnd(nameWidth);
    const status = statusTag(r.success).padEnd(
      // Visual padding: ANSI codes don't count
      14 - (r.success ? 10 : 10),
    );
    const dur = formatDuration(r.durationMs).padStart(10);
    console.log(`  ${name}  ${status}   ${dim(dur)}`);
  }

  // Footer
  console.log(`  ${dim('─'.repeat(nameWidth))}  ${dim('──────')}   ${dim('─'.repeat(10))}`);
  console.log(
    `  ${'Total'.padEnd(nameWidth)}  ${dim('          ')}   ${C_BOLD}${formatDuration(totalDuration).padStart(10)}${C_RESET}`,
  );
  console.log('');

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const suppressedNoiseTotal = results.reduce((sum, r) => sum + r.suppressedNoiseCount, 0);
  const tallyColor = allPassed ? C_GREEN : C_RED;
  console.log(
    `  ${tallyColor}${C_BOLD}${passed} passed${C_RESET}${failed > 0 ? `  ${C_RED}${C_BOLD}${failed} failed${C_RESET}` : ''}`,
  );
  if (suppressedNoiseTotal > 0) {
    console.log(`  ${dim(`suppressed ${suppressedNoiseTotal} known stderr noise line(s)`)}`);
  }
  console.log('');

  if (failed > 0) {
    console.log(`${C_YELLOW}Failing step details:${C_RESET}`);
    for (const r of results) {
      if (r.success) continue;
      console.log(
        `  ${C_BOLD}${r.name}${C_RESET} — exit code ${r.exitCode}${r.signal ? ` (${r.signal})` : ''}`,
      );
    }
    console.log('');
  }

  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`${C_RED}Fatal: ${err}${C_RESET}`);
  process.exit(1);
});
