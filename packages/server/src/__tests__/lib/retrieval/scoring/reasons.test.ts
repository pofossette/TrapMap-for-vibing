import { buildMultiChannelReason } from '@trapmap/server/lib/retrieval/capsules/scoring/reasons.js';
import type {
  CapsuleRecallChannelName,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { DerivedSkillCapsuleRecord } from '@trapmap/server/lib/store.js';
import { describe, expect, it } from 'vitest';

function makeIntent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    seed: 'test seed',
    normalized: 'test seed',
    situation: null,
    problem: null,
    goal: null,
    errorText: null,
    tokens: [],
    stackPathHints: [],
    category: null,
    semanticQuery: null,
    parseMethod: 'regex',
    ...overrides,
  };
}

function makeCapsule(
  overrides: Partial<DerivedSkillCapsuleRecord> = {},
): DerivedSkillCapsuleRecord {
  return {
    capsuleId: 'c1',
    artifactId: 'a1',
    revision: 1,
    sourcePaths: ['SKILL.md'],
    content: '',
    situation: '',
    problem: '',
    goal: '',
    errorText: null,
    contextualPrefix: null,
    labels: [],
    scope: 'global',
    requiredLevel: 0,
    ...overrides,
  };
}

describe('buildMultiChannelReason', () => {
  it('should include channel names in reason', () => {
    const reason = buildMultiChannelReason(
      ['capsule-heuristic', 'capsule-keyword'] as CapsuleRecallChannelName[],
      {
        problemScore: 0.5,
        situationScore: 0.2,
        goalScore: 0.1,
        keywordScore: 0.3,
        contextScore: 0.0,
        stackPathBoost: 1.0,
      },
      makeCapsule(),
      makeIntent(),
    );

    expect(reason).toContain('heuristic + keyword');
    expect(reason).toContain('Matched via');
  });

  it('should mention problem match when score > 0.3', () => {
    const reason = buildMultiChannelReason(
      ['capsule-heuristic'] as CapsuleRecallChannelName[],
      {
        problemScore: 0.82,
        situationScore: 0.1,
        goalScore: 0.1,
        keywordScore: 0.1,
        contextScore: 0.0,
        stackPathBoost: 1.0,
      },
      makeCapsule(),
      makeIntent(),
    );

    expect(reason).toContain('problem match (82%)');
  });

  it('should not mention feature when score <= 0.3', () => {
    const reason = buildMultiChannelReason(
      ['capsule-heuristic'] as CapsuleRecallChannelName[],
      {
        problemScore: 0.2,
        situationScore: 0.1,
        goalScore: 0.1,
        keywordScore: 0.1,
        contextScore: 0.0,
        stackPathBoost: 1.0,
      },
      makeCapsule(),
      makeIntent(),
    );

    expect(reason).not.toContain('problem match');
    expect(reason).not.toContain('situation match');
    expect(reason).not.toContain('goal match');
    expect(reason).toContain('Capsule from');
  });

  it('should mention stack/path boost when > 1.1', () => {
    const reason = buildMultiChannelReason(
      ['capsule-keyword'] as CapsuleRecallChannelName[],
      {
        problemScore: 0.5,
        situationScore: 0.2,
        goalScore: 0.1,
        keywordScore: 0.3,
        contextScore: 0.0,
        stackPathBoost: 1.2,
      },
      makeCapsule(),
      makeIntent(),
    );

    expect(reason).toContain('stack/path boost');
  });

  it('should not mention stack/path boost when <= 1.1', () => {
    const reason = buildMultiChannelReason(
      ['capsule-heuristic'] as CapsuleRecallChannelName[],
      {
        problemScore: 0.5,
        situationScore: 0.2,
        goalScore: 0.1,
        keywordScore: 0.3,
        contextScore: 0.0,
        stackPathBoost: 1.0,
      },
      makeCapsule(),
      makeIntent(),
    );

    expect(reason).not.toContain('stack/path boost');
  });

  it('should mention context match when contextScore > 0.3', () => {
    const reason = buildMultiChannelReason(
      ['capsule-semantic'] as CapsuleRecallChannelName[],
      {
        problemScore: 0.5,
        situationScore: 0.2,
        goalScore: 0.1,
        keywordScore: 0.2,
        contextScore: 0.58,
        stackPathBoost: 1.0,
      },
      makeCapsule(),
      makeIntent(),
    );

    expect(reason).toContain('context match (58%)');
  });

  it('should include all matching features', () => {
    const reason = buildMultiChannelReason(
      ['capsule-heuristic', 'capsule-keyword', 'capsule-semantic'] as CapsuleRecallChannelName[],
      {
        problemScore: 0.84,
        situationScore: 0.35,
        goalScore: 0.4,
        keywordScore: 0.5,
        contextScore: 0.61,
        stackPathBoost: 1.3,
      },
      makeCapsule(),
      makeIntent(),
    );

    expect(reason).toContain('problem match (84%)');
    expect(reason).toContain('situation match (35%)');
    expect(reason).toContain('goal match (40%)');
    expect(reason).toContain('keyword match (50%)');
    expect(reason).toContain('context match (61%)');
    expect(reason).toContain('stack/path boost');
    expect(reason).toContain('heuristic + keyword + semantic');
  });

  it('should fallback to Capsule from sourcePaths when no features match', () => {
    const reason = buildMultiChannelReason(
      [] as CapsuleRecallChannelName[],
      {
        problemScore: 0.0,
        situationScore: 0.0,
        goalScore: 0.0,
        keywordScore: 0.0,
        contextScore: 0.0,
        stackPathBoost: 1.0,
      },
      makeCapsule({ sourcePaths: ['some/path.md'] }),
      makeIntent(),
    );

    expect(reason).toContain('Capsule from some/path.md');
  });

  it('should say unknown when no sourcePaths and no features', () => {
    const reason = buildMultiChannelReason(
      [] as CapsuleRecallChannelName[],
      {
        problemScore: 0.0,
        situationScore: 0.0,
        goalScore: 0.0,
        keywordScore: 0.0,
        contextScore: 0.0,
        stackPathBoost: 1.0,
      },
      makeCapsule({ sourcePaths: [] }),
      makeIntent(),
    );

    expect(reason).toContain('unknown');
  });
});
