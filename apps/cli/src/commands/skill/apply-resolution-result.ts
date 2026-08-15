import type { ApplyResolutionResponse } from '@trapmap/contracts';

import type { loadCliState } from '@trapmap/cli/lib/config.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

export function printApplyResolutionResult(
  parsed: ApplyResolutionResponse,
  state: Awaited<ReturnType<typeof loadCliState>>,
  flags: { json?: boolean },
  action: string,
  formatter: (input: ApplyResolutionResponse) => string,
): void {
  printCommandResult(
    {
      action,
      success: true,
      summary: `Applied resolution for ${parsed.candidateId}: ${parsed.outcome.decision}.`,
      artifacts: [
        {
          id: parsed.candidateId,
          newState: parsed.status,
          ...(parsed.outcome.decision === 'independent'
            ? { publishedAs: parsed.outcome.entityType }
            : { mergedInto: parsed.outcome.mergedIntoEntityId }),
        },
      ],
      nextSteps: [],
    },
    parsed,
    state,
    flags,
    formatter,
  );
}
