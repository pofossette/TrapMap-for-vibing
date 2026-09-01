/**
 * Copied and adapted from ai-skills installer/conflicts.ts
 * Handles skill install conflicts: overwrite, skip, prompt, merge
 */
export type ConflictPolicy = 'overwrite' | 'skip' | 'prompt' | 'merge';

export interface ConflictInfo {
  slug: string;
  existingVersion?: string;
  incomingVersion?: string;
  localEdits: boolean;
  path: string;
}

export function resolveConflict(
  conflict: ConflictInfo,
  policy: ConflictPolicy,
  canPrompt: boolean,
): 'overwrite' | 'skip' | 'merge' {
  if (policy === 'overwrite') return 'overwrite';
  if (policy === 'skip') return 'skip';
  if (policy === 'merge' && conflict.localEdits) return 'merge';
  if (canPrompt) return 'overwrite'; // In real CLI would prompt via @clack/prompts
  return 'skip';
}
