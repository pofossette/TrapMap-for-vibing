import { Command } from 'commander';

import { registerAuditCommands } from './commands/audit.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerDecayCommands } from './commands/decay.js';
import { registerEvidenceCommands } from './commands/evidence.js';
import { registerFeedbackAdminCommands } from './commands/feedback-admin.js';
import { registerFeedbackCommands } from './commands/feedback.js';
import { registerKnowledgeCommands } from './commands/knowledge.js';
import { registerLoadCommand } from './commands/load.js';
import { registerMaintenanceCommands } from './commands/maintenance.js';
import { registerMemberCommands } from './commands/member.js';
import { registerOperationsCommands } from './commands/operations.js';
import { registerOutputProfileCommands } from './commands/output-profile.js';
import { registerPolicyCommands } from './commands/policy.js';
import { registerRetrievalCommands } from './commands/retrieval.js';
import { registerReviewCommands } from './commands/review.js';
import { registerSkillCommands } from './commands/skill.js';
import { registerTeamCommands } from './commands/team.js';
import { registerTrapCommands } from './commands/trap.js';
import { loadCliState } from './lib/config.js';
import { printError } from './lib/output.js';

function hasPermission(permissions: string[] | undefined, required: string): boolean {
  return (permissions ?? []).includes(required);
}

function collectCommandPaths(command: Command, parents: string[] = []): string[] {
  const paths: string[] = [];

  for (const child of command.commands) {
    const name = child.name();
    if (name === 'help') {
      continue;
    }

    const path = [...parents, name];
    paths.push(path.join(' '));
    paths.push(...collectCommandPaths(child, path));
  }

  return paths;
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
  allowKnowledgeImport:
    securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:import'),
  allowKnowledgeUpdate:
    securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:update'),
  allowKnowledgeDeactivate:
    securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:update'),
  allowAuditRead: hasPermission(effectivePermissions, 'audit:read'),
  allowFeedbackSubmit: hasPermission(effectivePermissions, 'knowledge:search'),
  allowFeedbackManage:
    securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:update'),
  allowSkillFind: hasPermission(effectivePermissions, 'knowledge:review'),
  allowSkillApply: securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:review'),
};

const program = new Command();

program
  .name('trapmap')
  .description('CLI-first knowledge sharing for engineering pitfall capture and retrieval')
  .version('0.1.0');

program
  .command('about')
  .description('Show current prototype scope and package boundaries')
  .action(() => {
    console.log('TrapMap prototype');
    console.log('- apps/cli: imperative user-facing terminal commands');
    console.log('- packages/host-local: Nest-based light host (default runtime entry)');
    console.log('- packages/contracts: shared Zod schemas and runtime-safe contracts');
  });

program
  .command('api:list')
  .description('List the currently available CLI command surface')
  .action(() => {
    const availableCommands = collectCommandPaths(program).sort((a, b) => a.localeCompare(b));

    for (const commandName of availableCommands) {
      console.log(commandName);
    }
  });

registerAuthCommands(program);
registerOutputProfileCommands(program);
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
registerTrapCommands(program, {
  allowInspect: visibility.allowKnowledgeInspect,
  allowSubmit: visibility.allowKnowledgeSubmit,
});
registerRetrievalCommands(program, {
  allowSearch: visibility.allowKnowledgeSearch,
});
registerLoadCommand(program, { allowSearch: visibility.allowKnowledgeSearch });
registerReviewCommands(program, {
  allowReview: visibility.allowKnowledgeReview,
});
registerEvidenceCommands(program, {
  allowReview: visibility.allowKnowledgeReview,
});
registerOperationsCommands(program, {
  allowExport: visibility.allowKnowledgeExport,
  allowEdit: visibility.allowKnowledgeUpdate,
  allowDeactivate: visibility.allowKnowledgeDeactivate,
  allowImport: visibility.allowKnowledgeImport,
  allowList: visibility.allowKnowledgeExport,
  allowActivate: visibility.allowKnowledgeExport,
  allowStatus: visibility.allowKnowledgeExport,
  allowMigrate: visibility.allowKnowledgeImport,
  allowCapsuleIndex: visibility.allowKnowledgeUpdate,
});
registerDecayCommands(program, { allowManage: visibility.allowKnowledgeUpdate });
registerMaintenanceCommands(program, { allowManage: visibility.allowKnowledgeUpdate });
registerAuditCommands(program, {
  allowRead: visibility.allowAuditRead,
});
registerSkillCommands(program, {
  allowSearch: visibility.allowKnowledgeSearch,
  allowSubmit: visibility.allowKnowledgeSubmit,
  allowExport: visibility.allowKnowledgeExport,
  allowReview: visibility.allowKnowledgeReview,
  allowFind: visibility.allowSkillFind,
  allowApply: visibility.allowSkillApply,
});
registerFeedbackCommands(program, {
  allowSubmit: visibility.allowFeedbackSubmit,
});
registerFeedbackAdminCommands(program, { allowManage: visibility.allowFeedbackManage });
registerPolicyCommands(program, { allowSearch: visibility.allowKnowledgeSearch });

program.parseAsync(process.argv).catch(printError);
