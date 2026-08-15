import { confirm, input, select } from '@inquirer/prompts';

/**
 * Choice definition for select prompts.
 */
export interface PromptChoice<T> {
  value: T;
  name: string;
  description?: string;
}

/**
 * Prompt the user to select from a list of choices.
 * Wraps @inquirer/prompts select for testability.
 */
export async function promptSelect<T>(message: string, choices: PromptChoice<T>[]): Promise<T> {
  return select({
    message,
    choices: choices.map((c) => ({
      value: c.value,
      name: c.name,
      ...(c.description != null ? { description: c.description } : {}),
    })),
  });
}

/**
 * Prompt the user for text input.
 * Wraps @inquirer/prompts input for testability.
 */
export async function promptInput(
  message: string,
  options?: {
    default?: string;
    validate?: (value: string) => boolean | string;
  },
): Promise<string> {
  return input({
    message,
    ...(options?.validate ? { validate: options.validate } : {}),
    ...(options?.default !== undefined && options.default !== ''
      ? { default: options.default }
      : {}),
  });
}

/**
 * Prompt the user for yes/no confirmation.
 * Wraps @inquirer/prompts confirm for testability.
 */
export async function promptConfirm(message: string, defaultValue = false): Promise<boolean> {
  return confirm({
    message,
    default: defaultValue,
  });
}

/**
 * Check if the current environment supports interactive prompts.
 * Returns false in CI or non-TTY environments.
 */
export function isInteractiveEnvironment(): boolean {
  return (
    process.stdin != null &&
    process.stdin.isTTY === true &&
    process.stdout != null &&
    process.stdout.isTTY === true
  );
}
