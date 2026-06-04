/**
 * Operations commands registration.
 *
 * Thin router that delegates to individual command modules.
 * Refactored from monolith (1060 lines) in Phase 85.
 */

import type { Command } from 'commander';

import {
  registerActivateCommand,
  registerCapsuleIndexCommand,
  registerDeactivateCommand,
  registerEditCommand,
  registerExportCommand,
  registerImportCommand,
  registerListCommand,
  registerMigrateCommand,
  registerStatusCommand,
} from './operations/index.js';
import type { OperationsCommandOptions } from './operations/types.js';

/**
 * Register all operations commands on the Commander program.
 *
 * Each sub-module checks its own permission guard before registering.
 */
export function registerOperationsCommands(
  program: Command,
  options: OperationsCommandOptions,
): void {
  registerListCommand(program, options);
  registerEditCommand(program, options);
  registerDeactivateCommand(program, options);
  registerExportCommand(program, options);
  registerImportCommand(program, options);
  registerActivateCommand(program, options);
  registerMigrateCommand(program, options);
  registerStatusCommand(program, options);
  registerCapsuleIndexCommand(program, options);
}
