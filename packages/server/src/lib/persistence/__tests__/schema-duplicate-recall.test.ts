import { describe, expect, it } from 'vitest';

import {
  knowledgeEmbeddings,
  knowledgeKeywords,
  skillArtifactCapsuleEmbeddings,
  skillArtifactCapsuleKeywords,
  skillArtifactProfiles,
  skillArtifacts,
} from '@trapmap/server/lib/persistence/schema.js';

describe('duplicate recall schema surfaces (Phase 3)', () => {
  it('exports trap-side recall tables used by the PostgreSQL duplicate detector', () => {
    expect(knowledgeEmbeddings).toBeDefined();
    expect(knowledgeKeywords).toBeDefined();

    expect(knowledgeEmbeddings.entryId.name).toBe('entry_id');
    expect(knowledgeEmbeddings.vector.name).toBe('vector');
    expect(knowledgeEmbeddings.status.name).toBe('status');

    expect(knowledgeKeywords.entryId.name).toBe('entry_id');
    expect(knowledgeKeywords.tokens.name).toBe('tokens');
    expect(knowledgeKeywords.fieldTokensShortcut.name).toBe('field_tokens_shortcut');
    expect(knowledgeKeywords.fieldTokensDetail.name).toBe('field_tokens_detail');
    expect(knowledgeKeywords.fieldTokensLabels.name).toBe('field_tokens_labels');
  });

  it('exports skill-side recall tables used by the PostgreSQL duplicate detector', () => {
    expect(skillArtifacts).toBeDefined();
    expect(skillArtifactProfiles).toBeDefined();
    expect(skillArtifactCapsuleEmbeddings).toBeDefined();
    expect(skillArtifactCapsuleKeywords).toBeDefined();

    expect(skillArtifacts.id.name).toBe('id');
    expect(skillArtifacts.lifecycleState.name).toBe('lifecycle_state');
    expect(skillArtifacts.teamId.name).toBe('team_id');

    expect(skillArtifactProfiles.artifactId.name).toBe('artifact_id');
    expect(skillArtifactProfiles.revisionNo.name).toBe('revision_no');
    expect(skillArtifactProfiles.summary.name).toBe('summary');
    expect(skillArtifactProfiles.contentHash.name).toBe('content_hash');

    expect(skillArtifactCapsuleEmbeddings.artifactId.name).toBe('artifact_id');
    expect(skillArtifactCapsuleEmbeddings.revisionNo.name).toBe('revision_no');
    expect(skillArtifactCapsuleEmbeddings.embedding.name).toBe('embedding');
    expect(skillArtifactCapsuleEmbeddings.status.name).toBe('status');

    expect(skillArtifactCapsuleKeywords.artifactId.name).toBe('artifact_id');
    expect(skillArtifactCapsuleKeywords.revisionNo.name).toBe('revision_no');
    expect(skillArtifactCapsuleKeywords.tokens.name).toBe('tokens');
    expect(skillArtifactCapsuleKeywords.fieldTokensContent.name).toBe('field_tokens_content');
    expect(skillArtifactCapsuleKeywords.fieldTokensSituation.name).toBe(
      'field_tokens_situation',
    );
    expect(skillArtifactCapsuleKeywords.fieldTokensProblem.name).toBe('field_tokens_problem');
    expect(skillArtifactCapsuleKeywords.fieldTokensGoal.name).toBe('field_tokens_goal');
    expect(skillArtifactCapsuleKeywords.fieldTokensLabels.name).toBe('field_tokens_labels');
    expect(skillArtifactCapsuleKeywords.fieldTokensContextualPrefix.name).toBe(
      'field_tokens_contextual_prefix',
    );
  });
});
