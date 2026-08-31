import type { Command } from 'commander';

import { registerApplyCommand } from './apply.js';
import { registerDuplicateJobCommands } from './duplicate-job.js';
import { registerEditCommand } from './edit.js';
import { registerFindCommand } from './find.js';
import { registerHistoryCommand } from './history.js';
import { registerReviewCommands } from './review.js';
import { registerSearchCommand } from './search.js';
import { registerVersionsCommand } from './versions.js';
import { registerRegistryCommands, registerSkillAddTopLevel } from './registry.js';

export interface SkillCommandOptions {
  allowSearch: boolean;
  allowSubmit: boolean;
  allowExport: boolean;
  allowReview: boolean;
  allowFind: boolean;
  allowApply: boolean;
}

export function registerSkillCommands(program: Command, options: SkillCommandOptions): void {
  // Always register the skill command if any subcommand is allowed
  if (
    !options.allowSearch &&
    !options.allowSubmit &&
    !options.allowExport &&
    !options.allowReview &&
    !options.allowFind &&
    !options.allowApply
  ) {
    return;
  }

  const skill = program.command('skill').description('Search and manage skill artifacts');

  // Phase 18: skill search-by-content
  if (options.allowSearch) {
    registerSearchCommand(skill);
  }

  // skill find [fingerprint]
  if (options.allowFind) {
    registerFindCommand(skill);
  }

  // skill apply <candidateId>
  if (options.allowApply) {
    registerApplyCommand(skill);
  }

  // Phase 19: skill edit (SKED-02)
  if (options.allowSubmit) {
    registerEditCommand(skill);
  }

  // Phase 19: skill history (SKED-04)
  if (options.allowExport) {
    registerHistoryCommand(skill);
  }

  // skill versions: semver version + revision history (same endpoint as history)
  if (options.allowExport) {
    registerVersionsCommand(skill);
  }

  // Phase 20: skill review commands (SKED-03)
  if (options.allowReview) {
    registerReviewCommands(skill);
  }

  // Skill registry package-manager (ai-pkgs/skills.sh/GitHub/local) — @trapmap/skill-registry
  // Provides: trapmap skill add <source>, trapmap skill registry {search,list,outdated,update,status}
  try {
    registerRegistryCommands(skill);
  } catch {}
  try {
    registerSkillAddTopLevel(skill);
  } catch {}

  // Phase 34: duplicate-job commands
  if (options.allowReview) {
    registerDuplicateJobCommands(skill);
  }
}

// Re-export formatters for backward compatibility if any external code imports them
export * from './formatters.js';
