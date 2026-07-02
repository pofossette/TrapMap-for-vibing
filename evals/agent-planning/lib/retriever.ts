import type { AgentPlanningContextEntry } from '@trapmap/contracts/evals';

import type { SkillRecord } from './skill-store.js';
import { getSkillStore } from './skill-store.js';

export interface RetrievalResult {
  entries: AgentPlanningContextEntry[];
  hitIds: string[];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'because',
  'but',
  'and',
  'or',
  'if',
  'while',
  'about',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'what',
  'which',
  'who',
  'whom',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'they',
  'them',
  'their',
  'how',
  'use',
  'using',
  'used',
  'want',
  'like',
  'know',
]);

function extractKeywords(text: string): string[] {
  return tokenize(text).filter((t) => !STOP_WORDS.has(t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function toCapsuleCard(skill: SkillRecord, score: number): AgentPlanningContextEntry {
  return {
    id: `capsule-${skill.id}`,
    kind: 'capsule-card',
    title: `${skill.title} (capsule match: ${score.toFixed(2)})`,
    body: [
      `- [capsule] ${skill.title}`,
      `  Skill: ${skill.id}`,
      '  Situation: Skill identified via keyword-capsule retrieval',
      '  Problem: Matched based on keyword overlap with query',
      `  Goal: Apply ${skill.title} to the user's task`,
      `  Content: ${skill.summary}`,
      `  Labels: ${skill.labels.join(', ')}`,
    ].join('\n'),
    summary: `keyword score: ${score.toFixed(2)}`,
  };
}

function toSkillProfile(skill: SkillRecord): AgentPlanningContextEntry {
  return {
    id: `profile-${skill.id}`,
    kind: 'skill-profile',
    title: skill.title,
    body: [
      `- [skill-profile] ${skill.title}`,
      `  Summary: ${skill.summary}`,
      `  Keywords: ${skill.keywords.join(', ')}`,
      `  Labels: ${skill.labels.join(', ')}`,
    ].join('\n'),
    summary: skill.summary,
  };
}

export function retrieveByCapsuleKeywords(query: string, limit: number): RetrievalResult {
  const store = getSkillStore();
  const queryKeywords = extractKeywords(query);

  const scored = store
    .map((skill) => {
      const matchCount = queryKeywords.filter((qw) =>
        skill.keywords.some((sk) => sk.includes(qw) || qw.includes(sk)),
      ).length;
      return { skill, score: queryKeywords.length > 0 ? matchCount / queryKeywords.length : 0 };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    entries: scored.map(({ skill, score }) => toCapsuleCard(skill, score)),
    hitIds: scored.map(({ skill }) => skill.id),
  };
}

export function retrieveBySummary(query: string, limit: number): RetrievalResult {
  const store = getSkillStore();
  const queryTokens = new Set(extractKeywords(query));

  const scored = store
    .map((skill) => ({
      skill,
      score: jaccard(queryTokens, new Set(extractKeywords(skill.summary))),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    entries: scored.map(({ skill }) => toSkillProfile(skill)),
    hitIds: scored.map(({ skill }) => skill.id),
  };
}
