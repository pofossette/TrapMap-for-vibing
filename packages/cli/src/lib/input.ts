import { readFile } from 'node:fs/promises';
import process from 'node:process';

export function collectValues(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

async function readFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8').trim();
}

function formatMissingTextError(fieldName: string): string {
  if (fieldName === 'seed') {
    return 'Seed text is required. Provide a seed argument or use --stdin.';
  }

  return `Provide --${fieldName} <text>, --file <path>, or pipe content on stdin.`;
}

function hasStdinContent(): boolean {
  if (!process.stdin) return false;
  return !process.stdin.isTTY;
}

export async function resolveTextInput(
  options: {
    file?: string;
    stdin?: boolean;
    text?: string;
  },
  fieldName: string,
): Promise<string> {
  const directText = options.text?.trim();

  if (directText) {
    return directText;
  }

  if (options.file) {
    const fileText = (await readFile(options.file, 'utf8')).trim();

    if (!fileText) {
      throw new Error(`${fieldName} file is empty.`);
    }

    return fileText;
  }

  if (options.stdin || hasStdinContent()) {
    const stdinText = await readFromStdin();

    if (!stdinText) {
      throw new Error(formatMissingTextError(fieldName));
    }

    return stdinText;
  }

  throw new Error(formatMissingTextError(fieldName));
}
