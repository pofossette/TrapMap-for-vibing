import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os, { tmpdir } from 'node:os';
import path from 'node:path';

import {
  normalizeBackendTarget,
  type ActiveSession,
  type BackendTarget,
  type ScriptActivationPolicy,
} from '@trapmap/contracts';

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
  gatewayUrl?: string;
  backendTarget?: BackendTarget;
  /**
   * @deprecated P2 keeps reading legacy config files that still persist `serverUrl`.
   * New writes must only persist `gatewayUrl`.
   */
  serverUrl?: string;
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

const DEFAULT_GATEWAY_URL =
  process.env.TRAPMAP_GATEWAY_URL ?? process.env.TRAPMAP_SERVER_URL ?? 'http://127.0.0.1:4000';

function getConfigPath(): string {
  let base: string;
  try {
    base = os.homedir();
  } catch {
    base = tmpdir();
  }
  return path.join(base, '.trapmap', 'cli.json');
}

function getDefaultState(): CliState {
  return {
    gatewayUrl: DEFAULT_GATEWAY_URL,
    backendTarget: 'light',
    sessionToken: null,
    session: null,
  };
}

function normalizeGatewayUrl(parsed: Partial<CliState>): string {
  if (typeof parsed.gatewayUrl === 'string' && parsed.gatewayUrl.length > 0) {
    return parsed.gatewayUrl;
  }

  if (typeof parsed.serverUrl === 'string' && parsed.serverUrl.length > 0) {
    return parsed.serverUrl;
  }

  return DEFAULT_GATEWAY_URL;
}

export function resolveCliGatewayUrl(state: Pick<CliState, 'gatewayUrl' | 'serverUrl'>): string {
  if (typeof state.gatewayUrl === 'string' && state.gatewayUrl.length > 0) {
    return state.gatewayUrl;
  }

  if (typeof state.serverUrl === 'string' && state.serverUrl.length > 0) {
    return state.serverUrl;
  }

  return DEFAULT_GATEWAY_URL;
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

const VALID_OUTPUT_PROFILE_KEYS: readonly (keyof OutputProfile)[] = [
  'tool',
  'modelHint',
  'renderMode',
  'graphPlanMode',
  'verbosity',
  'includeRawHints',
] as const;

function normalizeOutputProfile(profile: unknown): OutputProfile | undefined {
  if (!profile || typeof profile !== 'object') {
    return undefined;
  }

  const filtered: Record<string, unknown> = {};
  for (const key of VALID_OUTPUT_PROFILE_KEYS) {
    if (key in (profile as Record<string, unknown>)) {
      filtered[key] = (profile as Record<string, unknown>)[key];
    }
  }

  return {
    ...getDefaultOutputProfile(),
    ...filtered,
  } as OutputProfile;
}

export async function loadCliState(): Promise<CliState> {
  const configPath = getConfigPath();

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CliState>;
    const { serverUrl: _legacyServerUrl, ...parsedWithoutLegacyServerUrl } = parsed;
    const outputProfile = normalizeOutputProfile(parsed.outputProfile);
    const configHadOutputProfile = 'outputProfile' in parsed;
    return {
      ...getDefaultState(),
      ...parsedWithoutLegacyServerUrl,
      gatewayUrl: normalizeGatewayUrl(parsed),
      backendTarget: normalizeBackendTarget(parsed.backendTarget),
      ...(outputProfile != null
        ? { outputProfile }
        : configHadOutputProfile
          ? { outputProfile: getDefaultState().outputProfile }
          : {}),
    };
  } catch {
    return getDefaultState();
  }
}

async function saveCliState(state: CliState): Promise<void> {
  const configPath = getConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  const persistedState = {
    gatewayUrl: state.gatewayUrl,
    backendTarget: state.backendTarget ?? 'light',
    sessionToken: state.sessionToken,
    session: state.session,
    ...(state.outputProfile === undefined ? {} : { outputProfile: state.outputProfile }),
  };
  await writeFile(configPath, `${JSON.stringify(persistedState, null, 2)}\n`, 'utf8');
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
