import { describe, expect, it } from 'vitest';

import { assertArtifactOutputShape, buildSampleArtifactInput } from '@trapmap/backend-core';
import type { DerivedSkillProfileRecord } from '@trapmap/contracts';

import { createRuleArtifactDerivation } from './rule-artifact-derivation.js';

describe('createRuleArtifactDerivation', () => {
  it('derives outputs from the shared sample artifact input', async () => {
    const port = createRuleArtifactDerivation();

    const output = await port.derive(buildSampleArtifactInput());

    assertArtifactOutputShape(output);
    expect(output.profile).not.toBeNull();

    const profile = output.profile as DerivedSkillProfileRecord;
    expect(profile.artifactId).toBe('art-derive-1');
  });
});
