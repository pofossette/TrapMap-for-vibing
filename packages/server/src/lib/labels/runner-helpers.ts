import { Pool } from 'pg';

export async function withLabelRunnerPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

function logLabelRunnerWarnings(warnings: string[]): void {
  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.join(', ')}`);
  }
}

export function logLabelRunnerCompletion(warnings: string[]): void {
  logLabelRunnerWarnings(warnings);
  console.log('\nDone.');
}

export function runLabelRunnerMain(
  moduleUrl: string,
  argvPath: string | undefined,
  main: () => Promise<void>,
  failureLabel: string,
): void {
  if (moduleUrl !== `file://${argvPath}`) {
    return;
  }

  main().catch((err) => {
    console.error(`${failureLabel} failed:`, err);
    process.exit(1);
  });
}
