import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AgentPlanningContextEntry } from '@trapmap/contracts/evals';

export interface CapsuleKeywordMatch {
  skillId: string;
  capsuleId: string;
  keyword: string;
  score: number;
}

export interface CapsuleFixtureBuilderInput {
  scenarioId: string;
  targetSkillId: string;
  targetCapsuleIds: string[];
  distractorSkillIds: string[];
  interferenceLevel: 'none' | 'low' | 'medium' | 'high';
  sourceQualityMix: 'repo-only' | 'mixed-repo-oss' | 'oss-only';
}

export interface CapsuleFixtureBuilderOutput {
  summarySetEntries: AgentPlanningContextEntry[];
  capsuleMatchEntries: AgentPlanningContextEntry[];
  distractorEntries: AgentPlanningContextEntry[];
  capsuleKeywordGold: CapsuleKeywordMatch[];
}

interface SkillProfile {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  labels: string[];
  capsuleIds?: string[];
}

interface CapsuleKeywordGoldFile {
  taskId: string;
  capsuleMatches: CapsuleKeywordMatch[];
}

const repoSkillsDir = resolve('evals/fixtures/skills/repo');
const ossSkillsDir = resolve('evals/fixtures/skills/oss');
const capsuleKeywordsDir = resolve('evals/fixtures/skills/capsule-keywords');

function loadRepoSkillProfile(skillId: string): SkillProfile {
  const filePath = resolve(repoSkillsDir, `${skillId}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function loadOssSkillProfile(skillId: string): SkillProfile {
  const metaPath = resolve(ossSkillsDir, skillId.replace('oss-', ''), 'meta.json');
  return JSON.parse(readFileSync(metaPath, 'utf8'));
}

function loadSkillProfile(skillId: string): SkillProfile {
  if (skillId.startsWith('oss-')) {
    return loadOssSkillProfile(skillId);
  }
  return loadRepoSkillProfile(skillId);
}

function loadCapsuleKeywordGold(taskId: string): CapsuleKeywordMatch[] {
  try {
    const filePath = resolve(capsuleKeywordsDir, `${taskId}.json`);
    const data: CapsuleKeywordGoldFile = JSON.parse(readFileSync(filePath, 'utf8'));
    return data.capsuleMatches;
  } catch {
    return [];
  }
}

function buildSkillProfileEntry(profile: SkillProfile, index: number): AgentPlanningContextEntry {
  return {
    id: `skill-profile-${profile.id}-${index}`,
    kind: 'skill-profile',
    title: profile.title,
    body: [
      `- [skill-profile] ${profile.title}`,
      `  Summary: ${profile.summary}`,
      `  Keywords: ${profile.keywords.join(', ')}`,
      `  Labels: ${profile.labels.join(', ')}`,
    ].join('\n'),
    summary: profile.summary,
  };
}

function buildCapsuleCardEntry(
  profile: SkillProfile,
  match: CapsuleKeywordMatch,
  index: number,
): AgentPlanningContextEntry {
  return {
    id: `capsule-card-${match.capsuleId}-${index}`,
    kind: 'capsule-card',
    title: `${profile.title} — ${match.keyword}`,
    body: [
      `- [capsule] ${profile.title} (keyword match: ${match.keyword})`,
      `  Skill: ${profile.id}`,
      `  Situation: Matching user query for "${match.keyword}"`,
      '  Problem: Need to identify the correct skill from context',
      `  Goal: Select ${profile.title} based on capsule signal`,
      `  Content: ${profile.summary}`,
      `  Labels: ${profile.labels.join(', ')}`,
    ].join('\n'),
    summary: `keyword: ${match.keyword}, score: ${match.score}`,
  };
}

export function buildCapsuleFixtures(
  input: CapsuleFixtureBuilderInput,
  taskId: string,
): CapsuleFixtureBuilderOutput {
  const targetProfile = loadSkillProfile(input.targetSkillId);
  const keywordGold = loadCapsuleKeywordGold(taskId);
  const targetMatches = keywordGold.filter((m) => m.skillId === input.targetSkillId);

  // Build skill-summary-set entries (skill-profile kind)
  const summarySetEntries = [buildSkillProfileEntry(targetProfile, 0)];

  // Build capsule-match-set entries (capsule-card kind)
  const capsuleMatchEntries = targetMatches.map((match, i) =>
    buildCapsuleCardEntry(targetProfile, match, i),
  );

  // Build distractor entries for both modes
  const distractorEntries: AgentPlanningContextEntry[] = [];
  for (let i = 0; i < input.distractorSkillIds.length; i++) {
    const distractorId = input.distractorSkillIds[i];
    const distractorProfile = loadSkillProfile(distractorId);
    // Distractors appear as skill-profile entries (will be filtered by renderer based on contextSetKind)
    distractorEntries.push({
      id: `distractor-${distractorId}-${i}`,
      kind: 'skill-profile',
      title: distractorProfile.title,
      body: [
        `- [skill-profile] ${distractorProfile.title}`,
        `  Summary: ${distractorProfile.summary}`,
        `  Keywords: ${distractorProfile.keywords.join(', ')}`,
        `  Labels: ${distractorProfile.labels.join(', ')}`,
      ].join('\n'),
      summary: distractorProfile.summary,
    });
    // Also create capsule-card form for distractors
    distractorEntries.push({
      id: `distractor-capsule-${distractorId}-${i}`,
      kind: 'capsule-card',
      title: `${distractorProfile.title} — partial match`,
      body: [
        `- [capsule] ${distractorProfile.title} (keyword match: low-relevance)`,
        `  Skill: ${distractorProfile.id}`,
        '  Situation: Tangentially related context',
        '  Problem: Not directly addressing the user query',
        '  Goal: Background information only',
        `  Content: ${distractorProfile.summary}`,
        `  Labels: ${distractorProfile.labels.join(', ')}`,
      ].join('\n'),
      summary: 'low-relevance distractor',
    });
  }

  return {
    summarySetEntries,
    capsuleMatchEntries,
    distractorEntries,
    capsuleKeywordGold: keywordGold,
  };
}
