import { spawn } from 'node:child_process';

export interface SpawnPnpmOptions {
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * Used in error/usage messages, e.g. '[eval]', '[dev]', '[test:file]'.
   */
  label: string;
  /**
   * Message describing the command that failed to start, e.g.
   * 'Failed to start pnpm'.
   */
  startErrorMessage: string;
}

/**
 * Spawn `pnpm` with inherited stdio and mirror the child's exit/error
 * semantics onto the current process: forward exit codes and signals, and
 * exit(1) when the child cannot be started.
 */
export function spawnPnpmAndExit(options: SpawnPnpmOptions): void {
  const child = spawn('pnpm', options.args, {
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    stdio: 'inherit',
    env: options.env ?? process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(`[${options.label}] ${options.startErrorMessage}: ${error.message}`);
    process.exit(1);
  });
}

/**
 * Report a resolve/parse error and exit. Usage errors (messages starting with
 * the usage prefix) are printed to stdout with exit 0 so `pnpm eval --help`
 * behaves like a help command; everything else goes to stderr with exit 1.
 */
export function exitWithResolveError(error: unknown, usagePrefix?: string): never {
  const message = error instanceof Error ? error.message : String(error);
  const isUsageError = usagePrefix !== undefined && message.startsWith(usagePrefix);
  const stream = isUsageError ? process.stdout : process.stderr;
  stream.write(`${message}\n`);
  process.exit(isUsageError ? 0 : 1);
}
