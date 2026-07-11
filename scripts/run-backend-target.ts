import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BACKEND_TARGET_REGISTRY } from './backend-target-registry';

export type BackendTargetAction = 'build' | 'test';

export function resolveBackendTargetCommands(
  targetName: string,
  action: BackendTargetAction,
): string[][] {
  if (!Object.hasOwn(BACKEND_TARGET_REGISTRY, targetName)) {
    throw new Error(`Unknown backend target: ${targetName}`);
  }

  const target = BACKEND_TARGET_REGISTRY[targetName as keyof typeof BACKEND_TARGET_REGISTRY];

  if (action === 'build') {
    return [Array.from(target.buildCommand)];
  }

  if (action === 'test') {
    return target.verificationCommands.map((command) => command.split(' '));
  }

  throw new Error(`Unknown backend target action: ${action}`);
}

function runCommand(command: readonly string[]): Promise<void> {
  const [executable, ...args] = command;
  if (!executable) {
    return Promise.reject(new Error('Backend target command cannot be empty'));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit' });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Backend target command stopped by signal: ${signal}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Backend target command failed with exit code ${code ?? 1}`));
    });
  });
}

function resolveAction(action: string | undefined): BackendTargetAction {
  if (action === 'build' || action === 'test') {
    return action;
  }

  throw new Error(`Unknown backend target action: ${action ?? '(missing)'}`);
}

async function main(): Promise<void> {
  const [actionName, targetName] = process.argv.slice(2);
  const action = resolveAction(actionName);
  if (!targetName) {
    throw new Error('Backend target is required');
  }

  for (const command of resolveBackendTargetCommands(targetName, action)) {
    await runCommand(command);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[backend-target] ${message}\n`);
    process.exit(1);
  });
}
