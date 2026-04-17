import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  ActiveSession,
  ScriptActivationPolicy,
} from '@skill-shareer/contracts';

/**
 * Script-specific override policy.
 * Maps script path to local override intent for stricter-only policy control.
 */
export interface ScriptPolicyOverride {
  /** Script path within skill directory */
  path: string;
  /** SHA-256 hash of script content for validation */
  sha256: string;
  /** Local override intent - can only tighten, never relax server default */
  overridePolicy: ScriptActivationPolicy;
}

export interface CliState {
  serverUrl: string;
  sessionToken: string | null;
  session: ActiveSession | null;
  /**
   * Script activation policy overrides.
   * Keys are script paths, values contain hash validation and override intent.
   * Overrides can only tighten effective policy, never relax it (ACTV-04).
   */
  scriptPolicyOverrides: ScriptPolicyOverride[];
}

const DEFAULT_SERVER_URL = process.env.SKILL_SHAREER_SERVER_URL ?? 'http://127.0.0.1:4000';

function getConfigPath(): string {
  return path.join(os.homedir(), '.skill-shareer', 'cli.json');
}

function getDefaultState(): CliState {
  return {
    serverUrl: DEFAULT_SERVER_URL,
    sessionToken: null,
    session: null,
    scriptPolicyOverrides: [],
  };
}

export async function loadCliState(): Promise<CliState> {
  const configPath = getConfigPath();

  try {
    const raw = await readFile(configPath, 'utf8');
    return {
      ...getDefaultState(),
      ...(JSON.parse(raw) as Partial<CliState>),
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

/**
 * Get script policy override for a specific script.
 *
 * @param path - Script path within skill directory
 * @returns Override record if found, undefined otherwise
 */
export async function getScriptPolicyOverride(
  path: string,
): Promise<ScriptPolicyOverride | undefined> {
  const state = await loadCliState();
  return state.scriptPolicyOverrides.find((override) => override.path === path);
}

/**
 * Set or update a script policy override.
 *
 * Replaces any existing override for the same path.
 *
 * @param override - Override record with path, hash, and policy
 */
export async function setScriptPolicyOverride(
  override: ScriptPolicyOverride,
): Promise<void> {
  await updateCliState((current) => {
    const existingIndex = current.scriptPolicyOverrides.findIndex(
      (o) => o.path === override.path,
    );

    if (existingIndex >= 0) {
      // Replace existing override
      const updated = [...current.scriptPolicyOverrides];
      updated[existingIndex] = override;
      return { ...current, scriptPolicyOverrides: updated };
    }

    // Add new override
    return {
      ...current,
      scriptPolicyOverrides: [...current.scriptPolicyOverrides, override],
    };
  });
}

/**
 * Remove a script policy override.
 *
 * @param path - Script path to remove override for
 */
export async function removeScriptPolicyOverride(path: string): Promise<void> {
  await updateCliState((current) => ({
    ...current,
    scriptPolicyOverrides: current.scriptPolicyOverrides.filter(
      (o) => o.path !== path,
    ),
  }));
}

/**
 * Clear all script policy overrides.
 */
export async function clearAllScriptPolicyOverrides(): Promise<void> {
  await updateCliState((current) => ({
    ...current,
    scriptPolicyOverrides: [],
  }));
}
