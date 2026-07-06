import type { ScriptActivationPolicy } from '@trapmap/contracts';

import type { ClientManifestScriptRecord } from './store.js';

export function mapLegacyPolicyToFourState(
  legacyPolicy: 'manual' | 'auto' | 'blocked',
): ScriptActivationPolicy {
  switch (legacyPolicy) {
    case 'manual':
      return 'needs-approval';
    case 'auto':
      return 'client-executable';
    case 'blocked':
      return 'blocked';
  }
}

export function getDefaultActivationPolicy(
  descriptor: ClientManifestScriptRecord,
): ScriptActivationPolicy {
  if (
    descriptor.defaultPolicy === 'reference-only' ||
    descriptor.defaultPolicy === 'needs-approval' ||
    descriptor.defaultPolicy === 'client-executable' ||
    descriptor.defaultPolicy === 'blocked'
  ) {
    return descriptor.defaultPolicy;
  }

  return mapLegacyPolicyToFourState(descriptor.defaultPolicy);
}
