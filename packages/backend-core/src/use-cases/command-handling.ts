/**
 * Command handling use-case patterns.
 *
 * Defines the generic pattern for command use-cases that backend-core
 * modules implement. Commands represent write-side operations that
 * modify domain state.
 */

import { InvocationError } from '../invocation/invocation-model.js';

// ---------------------------------------------------------------------------
// Command pattern
// ---------------------------------------------------------------------------

/**
 * A command represents a write-side use-case.
 * It takes an input, performs validation and business logic,
 * and returns an output or throws an InvocationError.
 */
export interface Command<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

/**
 * Result type for commands that may succeed or fail with a domain error.
 */
export type CommandResult<T> = { ok: true; value: T } | { ok: false; error: InvocationError };

/**
 * Execute a command and wrap the result in a CommandResult.
 * This prevents InvocationErrors from propagating to callers
 * that prefer result-type error handling.
 */
export async function executeCommand<TInput, TOutput>(
  command: Command<TInput, TOutput>,
  input: TInput,
): Promise<CommandResult<TOutput>> {
  try {
    const value = await command.execute(input);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof InvocationError) {
      return { ok: false, error };
    }
    return {
      ok: false,
      error: InvocationError.internal(
        error instanceof Error ? error.message : 'Unknown error',
        error,
      ),
    };
  }
}
