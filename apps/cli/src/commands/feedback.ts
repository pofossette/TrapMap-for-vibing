import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import {
  isInteractiveEnvironment,
  promptConfirm,
  promptInput,
  promptSelect,
} from '@trapmap/cli/lib/prompts.js';
import { stripAnsi } from '@trapmap/cli/lib/sanitize.js';
import type { FeedbackProblemType, FeedbackResponse } from '@trapmap/contracts';
import { feedbackResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';

interface FeedbackCommandOptions {
  allowSubmit: boolean;
}

/**
 * Problem type choices for interactive prompt.
 */
const PROBLEM_TYPE_CHOICES = [
  {
    value: 'incorrect' as FeedbackProblemType,
    name: 'Incorrect',
    description: 'The solution is wrong or has errors',
  },
  {
    value: 'outdated' as FeedbackProblemType,
    name: 'Outdated',
    description: 'Information is stale or no longer applies',
  },
  {
    value: 'context-mismatch' as FeedbackProblemType,
    name: 'Context mismatch',
    description: "Doesn't apply to my situation",
  },
  {
    value: 'incomplete' as FeedbackProblemType,
    name: 'Incomplete',
    description: 'Missing critical information',
  },
  {
    value: 'other' as FeedbackProblemType,
    name: 'Other',
    description: 'Something else',
  },
];

function formatFeedbackResult(response: FeedbackResponse): string {
  const lines = [
    `Feedback submitted: ${stripAnsi(response.feedback.id)}`,
    `Entry: ${stripAnsi(response.feedback.entryId)} (${stripAnsi(response.feedback.entryType)})`,
    `Problem: ${stripAnsi(response.feedback.problemType)}`,
    `Status: ${stripAnsi(response.feedback.status)}`,
  ];
  return lines.join('\n');
}

export function registerFeedbackCommands(program: Command, options: FeedbackCommandOptions): void {
  if (!options.allowSubmit) {
    return;
  }

  program
    .command('feedback <entryId>')
    .description('Report a problem with a knowledge entry')
    .option('--type <type>', 'Problem type (skip interactive prompt)')
    .option('--description <text>', 'Problem description (skip interactive prompt)')
    .option('--context <text>', 'Optional context (skip interactive prompt)')
    .option(
      '--entry-type <type>',
      'Entry type: trap or skill (default: trap)',
      (val: string) => {
        if (!['trap', 'skill'].includes(val)) {
          throw new InvalidArgumentError('Must be "trap" or "skill"');
        }
        return val;
      },
      'trap',
    )
    .option('--query-seed <text>', 'Retrieval query that led to this entry')
    .option('--json', 'Output JSON')
    .action(
      async (
        entryId: string,
        flags: {
          context?: string;
          description?: string;
          entryType?: string;
          json?: boolean;
          querySeed?: string;
          type?: string;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        // Determine problem type
        let problemType: FeedbackProblemType;
        if (flags.type) {
          // Validate the provided type
          const validTypes: FeedbackProblemType[] = [
            'incorrect',
            'outdated',
            'context-mismatch',
            'incomplete',
            'other',
          ];
          if (!validTypes.includes(flags.type as FeedbackProblemType)) {
            throw new Error(
              `Invalid problem type: ${flags.type}. Valid types: ${validTypes.join(', ')}`,
            );
          }
          problemType = flags.type as FeedbackProblemType;
        } else if (isInteractiveEnvironment()) {
          problemType = await promptSelect(
            'What type of problem are you reporting?',
            PROBLEM_TYPE_CHOICES,
          );
        } else {
          throw new Error('Non-interactive environment. Provide --type and --description flags.');
        }

        // Determine description
        let description: string;
        if (flags.description) {
          description = flags.description;
        } else if (isInteractiveEnvironment()) {
          description = await promptInput('Describe the problem (min 10 characters):', {
            validate: (value) => value.length >= 10 || 'Please provide at least 10 characters',
          });
        } else {
          throw new Error('Non-interactive environment. Provide --description flag.');
        }

        // Determine optional context
        let context: string | undefined;
        if (flags.context !== undefined) {
          context = flags.context || undefined;
        } else if (isInteractiveEnvironment()) {
          const addContext = await promptConfirm(
            'Would you like to add context about what you were trying to do?',
            false,
          );
          if (addContext) {
            context = await promptInput('What were you trying to accomplish?');
          }
        }

        // Build submission payload
        const payload = {
          entryId,
          entryType: (flags.entryType ?? 'trap') as 'trap' | 'skill',
          problemType,
          description,
          context,
          querySeed: flags.querySeed,
        };

        // Submit to API
        const response = await apiRequest<FeedbackResponse>(state, {
          method: 'POST',
          path: '/v1/feedback',
          body: payload,
        });

        const parsed = feedbackResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'feedback-submit',
            success: true,
            summary: `Feedback submitted: ${parsed.feedback.id}`,
            artifacts: [
              {
                id: parsed.feedback.id,
                title: `${parsed.feedback.problemType} on ${parsed.feedback.entryId}`,
                newState: parsed.feedback.status,
              },
            ],
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatFeedbackResult,
        );
      },
    );
}
