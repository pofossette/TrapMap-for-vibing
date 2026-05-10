import { ApiError } from './http.js';
import type { CliState } from './config.js';
import {
  createRenderEnvelope,
  resolveRenderer,
  type RenderKind,
  type RenderPayload,
} from './output-profile.js';

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

/**
 * Like printResult but uses the profile-aware renderer for text output.
 * The commandResultPayload is used for tool-specific rendering,
 * while originalValue is preserved for --json output.
 */
export function printCommandResult<T>(
  commandResultPayload: Record<string, unknown>,
  originalValue: T,
  state: CliState,
  options: JsonFlag,
  legacyFormatter: (input: T) => string,
): void {
  if (options.json || state.outputProfile?.renderMode === 'json') {
    console.log(JSON.stringify(originalValue, null, 2));
    return;
  }

  if (!state.outputProfile) {
    console.log(legacyFormatter(originalValue));
    return;
  }

  try {
    const envelope = createRenderEnvelope('command-result', commandResultPayload, state.outputProfile);
    const renderer = resolveRenderer(state.outputProfile, 'command-result');
    console.log(renderer.render(envelope));
  } catch {
    console.log(legacyFormatter(originalValue));
  }
}

export function printAdaptiveResult<T extends RenderPayload>(
  kind: RenderKind,
  value: T,
  state: CliState,
  options: JsonFlag,
  legacyFormatter: (input: T) => string,
): void {
  if (options.json || state.outputProfile?.renderMode === 'json') {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (!state.outputProfile) {
    console.log(legacyFormatter(value));
    return;
  }

  try {
    const envelope = createRenderEnvelope(kind, value, state.outputProfile);
    const renderer = resolveRenderer(state.outputProfile, kind);
    console.log(renderer.render(envelope));
  } catch {
    console.log(legacyFormatter(value));
  }
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
