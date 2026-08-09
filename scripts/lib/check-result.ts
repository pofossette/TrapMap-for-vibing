export interface CheckRunResult {
  failures: number;
  messages: string[];
}

export interface FinishCheckRunParams {
  /**
   * Log prefix, e.g. '[doc-drift]' or '[arch-freeze]'.
   */
  name: string;
  result: CheckRunResult;
  /**
   * Remediation hint printed with the failure summary.
   */
  remedy: string;
  /**
   * Success line printed when all checks pass.
   */
  passedMessage: string;
}

/**
 * Print check messages, exit(1) on failures, otherwise print the success line.
 * Shared by the doc-drift and arch-freeze CLI entry points.
 */
export function finishCheckRun(params: FinishCheckRunParams): void {
  const { name, result, remedy, passedMessage } = params;

  for (const msg of result.messages) {
    console.error(msg);
  }

  if (result.failures > 0) {
    console.error(`\n${name} ${result.failures} violation(s) found. ${remedy}`);
    process.exit(1);
  }

  console.log(passedMessage);
}
