import type { Command } from 'commander';

import {
  registerKnowledgeEntryList,
  registerKnowledgeEntryResubmit,
  registerKnowledgeEntryShow,
  registerKnowledgeEntrySubmit,
  trapEntryDescriptor,
} from './knowledge-entry-commands.js';

interface TrapCommandOptions {
  allowInspect: boolean;
  allowSubmit: boolean;
}

export function registerTrapCommands(program: Command, options: TrapCommandOptions): void {
  const trap = program
    .command('trap')
    .description('Manage trap entries (pitfall/warning knowledge)');

  if (options.allowSubmit) {
    registerKnowledgeEntrySubmit(trap, trapEntryDescriptor);
    registerKnowledgeEntryResubmit(trap, trapEntryDescriptor);
  }

  if (options.allowInspect) {
    registerKnowledgeEntryList(trap, trapEntryDescriptor);
    registerKnowledgeEntryShow(trap, trapEntryDescriptor);
  }
}
