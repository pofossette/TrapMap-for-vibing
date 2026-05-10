import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ActiveSession, ScriptActivationPolicy } from '@trapmap/contracts';

/**
 * Script policy override for local activation control.
 * Allows clients to tighten (but never relax) server default policy (ACTV-04).
 */
export interface ScriptPolicyOverride {
  /** Path to the script file */
  path: string;
  /** SHA-256 hash of the script content for validation */
  sha256: string;
  /** Override policy (must be stricter or equal to server default) */
  overridePolicy: ScriptActivationPolicy;
}

export interface CliState {
  serverUrl: string;
  sessionToken: string | null;
  session: ActiveSession | null;
  outputProfile?: OutputProfile;
}

export type OutputToolProfile = 'claude-code' | 'codex' | 'opencode' | 'generic';
export type OutputModelHint = 'claude' | 'gpt' | 'qwen' | 'generic';
export type OutputRenderMode = 'text' | 'json';
export type OutputGraphPlanMode = 'summary' | 'full' | 'skill-list';
export type OutputVerbosity = 'compact' | 'balanced' | 'detailed';

export interface OutputProfile {
  tool: OutputToolProfile;
  modelHint?: OutputModelHint;
  renderMode: OutputRenderMode;
  graphPlanMode: OutputGraphPlanMode;
  verbosity: OutputVerbosity;
  includeRawHints: boolean;
}

const DEFAULT_SERVER_URL = process.env.TRAPMAP_SERVER_URL ?? 'http://127.0.0.1:4000';

function getConfigPath(): string {
  return path.join(os.homedir(), '.trapmap', 'cli.json');
}

function getDefaultState(): CliState {
  return {
    serverUrl: DEFAULT_SERVER_URL,
    sessionToken: null,
    session: null,
  };
}

export function getDefaultOutputProfile(): OutputProfile {
  return {
    tool: 'generic',
    modelHint: 'generic',
    renderMode: 'text',
    graphPlanMode: 'summary',
    verbosity: 'balanced',
    includeRawHints: true,
  };
}

function normalizeOutputProfile(
  profile: Partial<OutputProfile> | undefined,
): OutputProfile | undefined {
  if (!profile) {
    return undefined;
  }

  return {
    ...getDefaultOutputProfile(),
    ...profile,
  };
}

export async function loadCliState(): Promise<CliState> {
  const configPath = getConfigPath();

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CliState>;
    const outputProfile = normalizeOutputProfile(parsed.outputProfile);
    return {
      ...getDefaultState(),
      ...parsed,
      ...(outputProfile ? { outputProfile } : {}),
    };
  } catch {
    return getDefaultState();
  }
}

export async function saveCliState(state: CliState): Promise<void> {
  const configPath = getConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function updateCliState(
  patch: Partial<CliState> | ((current: CliState) => CliState),
): Promise<CliState> {
  const current = await loadCliState();
  const next =
    typeof patch === 'function'
      ? patch(current)
      : {
          ...current,
          ...patch,
        };
  await saveCliState(next);
  return next;
}

export async function clearSession(): Promise<CliState> {
  return updateCliState((current) => ({
    ...current,
    sessionToken: null,
    session: null,
  }));
}
