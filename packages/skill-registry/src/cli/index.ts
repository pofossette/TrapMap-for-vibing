import type { Command } from 'commander';
import { registerSkillAddCommand } from './add.js';
import { registerSkillDiffCommand } from './diff.js';
import { registerSkillInstallCommand } from './install.js';
import { registerSkillListCommand } from './list.js';
import { registerSkillOutdatedCommand } from './outdated.js';
import { registerSkillRemoveCommand } from './remove.js';
import { registerSkillRegistrySearchCommand } from './search.js';
import { registerSkillStatusCommand } from './status.js';
import { registerSkillUpdateCommand } from './update.js';
export function registerSkillRegistryCommands(program: Command): void {
  registerSkillAddCommand(program);
  registerSkillRegistrySearchCommand(program);
  registerSkillListCommand(program);
  registerSkillOutdatedCommand(program);
  registerSkillUpdateCommand(program);
  registerSkillRemoveCommand(program);
  registerSkillStatusCommand(program);
  registerSkillDiffCommand(program);
  registerSkillInstallCommand(program);
}
