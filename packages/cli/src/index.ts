import { Command } from 'commander';

import { registerAuthCommands } from './commands/auth.js';
import { registerKnowledgeCommands } from './commands/knowledge.js';
import { registerMemberCommands } from './commands/member.js';
import { registerOperationsCommands } from './commands/operations.js';
import { registerRetrievalCommands } from './commands/retrieval.js';
import { registerReviewCommands } from './commands/review.js';
import { registerTeamCommands } from './commands/team.js';
import { loadCliState } from './lib/config.js';
import { printError } from './lib/output.js';

function hasPermission(permissions: string[] | undefined, required: string): boolean {
  return (permissions ?? []).includes(required);
}

const cliState = await loadCliState();
const session = cliState.session;
const effectivePermissions = session?.effectivePermissions ?? [];
const securityLevel = session?.member.securityLevel ?? 0;

const visibility = {
  allowTeamCreate: securityLevel >= 1 && hasPermission(effectivePermissions, 'team:create'),
  allowMemberCreate: securityLevel >= 1 && hasPermission(effectivePermissions, 'member:create'),
  allowMemberUpdate: securityLevel >= 1 && hasPermission(effectivePermissions, 'member:update'),
  allowAccessKeyCreate:
    securityLevel >= 1 && hasPermission(effectivePermissions, 'member:key:create'),
  allowKnowledgeSubmit: hasPermission(effectivePermissions, 'knowledge:submit'),
  allowKnowledgeInspect:
    hasPermission(effectivePermissions, 'knowledge:submit') ||
    hasPermission(effectivePermissions, 'knowledge:review') ||
    hasPermission(effectivePermissions, 'knowledge:update'),
  allowKnowledgeReview:
    securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:review'),
  allowKnowledgeSearch: hasPermission(effectivePermissions, 'knowledge:search'),
  allowKnowledgeExport: hasPermission(effectivePermissions, 'knowledge:export'),
  allowKnowledgeImport: securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:import'),
  allowKnowledgeUpdate: securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:update'),
  allowKnowledgeDeactivate: securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:update'),
};

const program = new Command();

program
  .name('skill-shareer')
  .description('CLI-first knowledge sharing for engineering pitfall capture and retrieval')
  .version('0.1.0');

program
  .command('about')
  .description('Show current prototype scope and package boundaries')
  .action(() => {
    console.log('Skill Shareer prototype');
    console.log('- packages/cli: imperative user-facing terminal commands');
    console.log('- packages/server: Fastify API and LangChain-oriented service boundary');
    console.log('- packages/contracts: shared Zod schemas and runtime-safe contracts');
  });

program
  .command('api:list')
  .description('List the currently available CLI command surface')
  .action(() => {
    const availableCommands = [
      'about',
      'api:list',
      'login',
      'logout',
      'session',
      'team list',
      'team select',
      ...(visibility.allowTeamCreate ? ['team create'] : []),
      ...(visibility.allowMemberCreate ? ['member create'] : []),
      ...(visibility.allowMemberUpdate ? ['member update'] : []),
      ...(visibility.allowAccessKeyCreate ? ['access-key:create'] : []),
      ...(visibility.allowKnowledgeSubmit ? ['submit', 'resubmit'] : []),
      ...(visibility.allowKnowledgeInspect ? ['review-status'] : []),
      ...(visibility.allowKnowledgeSearch ? ['search'] : []),
      ...(visibility.allowKnowledgeReview
        ? ['review:queue', 'review:approve', 'review:reject']
        : []),
      ...(visibility.allowKnowledgeExport ? ['list', 'export'] : []),
      ...(visibility.allowKnowledgeImport ? ['import'] : []),
      ...(visibility.allowKnowledgeUpdate ? ['edit'] : []),
      ...(visibility.allowKnowledgeDeactivate ? ['deactivate'] : []),
    ];

    for (const commandName of availableCommands) {
      console.log(commandName);
    }
  });

registerAuthCommands(program);
registerTeamCommands(program, {
  allowCreate: visibility.allowTeamCreate,
});
registerMemberCommands(program, {
  allowAccessKeyCreate: visibility.allowAccessKeyCreate,
  allowMemberCreate: visibility.allowMemberCreate,
  allowMemberUpdate: visibility.allowMemberUpdate,
});
registerKnowledgeCommands(program, {
  allowInspect: visibility.allowKnowledgeInspect,
  allowSubmit: visibility.allowKnowledgeSubmit,
});
registerRetrievalCommands(program, {
  allowSearch: visibility.allowKnowledgeSearch,
});
registerReviewCommands(program, {
  allowReview: visibility.allowKnowledgeReview,
});
registerOperationsCommands(program, {
  allowExport: visibility.allowKnowledgeExport,
  allowEdit: visibility.allowKnowledgeUpdate,
  allowDeactivate: visibility.allowKnowledgeDeactivate,
  allowImport: visibility.allowKnowledgeImport,
});

program.parseAsync(process.argv).catch(printError);
