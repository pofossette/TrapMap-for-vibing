import { createHash } from 'node:crypto';

import { canonicalJsonStringify } from './canonical-json.js';

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJsonStringify(value)).digest('hex');
}
