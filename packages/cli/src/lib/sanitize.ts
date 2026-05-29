export function stripNewlines(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use ESC (0x1B)
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function sanitizeForDisplay(text: string): string {
  return stripAnsi(stripNewlines(text));
}

export function formatOptionalSuffix(value: string | null | undefined): string {
  return value != null ? ` (${sanitizeForDisplay(value)})` : '';
}
