import { randomUUID } from 'node:crypto';

/** Round 2: Internal sub-ID generator replacing store.nextId(). */
export function nextSubId(): string {
  return randomUUID();
}
