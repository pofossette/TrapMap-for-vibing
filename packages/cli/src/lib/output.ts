import { ApiError } from './http.js';

export interface JsonFlag {
  json?: boolean;
}

export function printResult<T>(value: T, options: JsonFlag, formatter: (input: T) => string): void {
  if (options.json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(formatter(value));
}

export function printError(error: unknown): void {
  if (error instanceof ApiError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('Unknown CLI error');
  process.exitCode = 1;
}
