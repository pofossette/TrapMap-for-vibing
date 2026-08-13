import { spawn } from 'node:child_process';

/**
 * Shared runner for consolidated guard commands (check:docs / check:structure).
 *
 * Each guard command is a single entry point that runs several sub-checks as
 * child processes. Every sub-check keeps its own distinct output prefix and
 * exit classification, so failure localization is preserved after merging.
 */

export interface CheckStep {
  /** Human-readable step name shown in the summary. */
  name: string;
  /** Executable to spawn, e.g. 'pnpm' or 'node'. */
  command: string;
  args: string[];
  /**
   * Non-blocking steps print their output and are marked WARN in the summary
   * but never fail the overall run. Defaults to true (blocking).
   */
  blocking?: boolean;
}

export interface StepOutcome {
  name: string;
  ok: boolean;
  blocking: boolean;
  durationMs: number;
}

export interface CheckRunResult {
  ok: boolean;
  outcomes: StepOutcome[];
}

function runStep(step: CheckStep): Promise<StepOutcome> {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      env: process.env,
    });
    const finish = (ok: boolean): void => {
      resolvePromise({
        name: step.name,
        ok,
        blocking: step.blocking ?? true,
        durationMs: Date.now() - startedAt,
      });
    };
    child.on('close', (code) => finish(code === 0));
    child.on('error', (err) => {
      console.error(`[check-steps] Failed to spawn ${step.command}: ${err.message}`);
      finish(false);
    });
  });
}

export async function runCheckSteps(steps: CheckStep[]): Promise<CheckRunResult> {
  const outcomes: StepOutcome[] = [];

  for (const step of steps) {
    console.log(`\n[check-steps] Running ${step.name}...`);
    outcomes.push(await runStep(step));
  }

  console.log('\n[check-steps] Summary:');
  for (const outcome of outcomes) {
    const status = outcome.ok ? 'PASS' : outcome.blocking ? 'FAIL' : 'WARN (non-blocking)';
    console.log(`  ${outcome.name.padEnd(22)} ${status.padEnd(18)} ${outcome.durationMs}ms`);
  }

  const failures = outcomes.filter((o) => o.blocking && !o.ok);
  if (failures.length > 0) {
    console.error(
      `\n[check-steps] ${failures.length} blocking step(s) failed: ${failures.map((f) => f.name).join(', ')}`,
    );
  } else {
    console.log(`\n[check-steps] All ${outcomes.length} step(s) completed (blocking tiers green).`);
  }

  return { ok: failures.length === 0, outcomes };
}
