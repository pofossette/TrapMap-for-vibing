import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';
import {
  type AgentReviewResult,
  type KnowledgeSubmission,
  agentReviewResultSchema,
} from '@trapmap/contracts';

import { type KnowledgeRecord, nowIso } from './store.js';

interface PreReviewInput {
  existingEntries: KnowledgeRecord[];
  submission: Pick<KnowledgeSubmission, 'detail' | 'labels' | 'scope' | 'shortcut'>;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }

  return shared / new Set([...a, ...b]).size;
}

function toRisk(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.72) {
    return 'high';
  }

  if (score >= 0.38) {
    return 'medium';
  }

  return 'low';
}

function completenessRisk(input: PreReviewInput['submission']): 'low' | 'medium' | 'high' {
  const detailLength = input.detail.trim().length;

  if (detailLength < 80 || input.labels.length < 1) {
    return 'high';
  }

  if (detailLength < 160 || input.labels.length < 2) {
    return 'medium';
  }

  return 'low';
}

function correctnessRisk(input: PreReviewInput['submission']): 'low' | 'medium' | 'high' {
  const detail = input.detail.toLowerCase();
  const evidenceTerms = ['because', 'fix', 'root cause', 'verify', 'caused by', 'solution'];
  const found = evidenceTerms.filter((term) => detail.includes(term)).length;

  if (found >= 3) {
    return 'low';
  }

  if (found >= 1) {
    return 'medium';
  }

  return 'high';
}

const preReviewChain = RunnableLambda.from(
  async (input: PreReviewInput): Promise<AgentReviewResult> => {
    const submissionDocument = new Document({
      pageContent: `${input.submission.shortcut}\n${input.submission.detail}`,
      metadata: {
        labels: input.submission.labels,
        scope: input.submission.scope,
      },
    });

    const submissionTokens = tokenize(submissionDocument.pageContent);
    let duplicateScore = 0;

    for (const entry of input.existingEntries) {
      const candidate = new Document({
        pageContent: `${entry.shortcut}\n${entry.detail}`,
        metadata: {
          scope: entry.scope,
          teamId: entry.teamId,
        },
      });

      duplicateScore = Math.max(
        duplicateScore,
        overlapScore(submissionTokens, tokenize(candidate.pageContent)),
      );
    }

    const duplicateRisk = toRisk(duplicateScore);
    const completeness = completenessRisk(input.submission);
    const correctness = correctnessRisk(input.submission);
    const notes: string[] = [];

    if (duplicateRisk !== 'low') {
      notes.push(`Potential duplicate overlap score: ${duplicateScore.toFixed(2)}`);
    }

    if (completeness !== 'low') {
      notes.push('Submission detail or labels look incomplete for later reuse.');
    }

    if (correctness !== 'low') {
      notes.push('Submission lacks strong fix/explanation evidence markers.');
    }

    return agentReviewResultSchema.parse({
      status: duplicateRisk === 'high' || completeness === 'high' ? 'agent-rejected' : 'agent-pass',
      duplicateRisk,
      correctnessRisk: correctness,
      completenessRisk: completeness,
      checkedAt: nowIso(),
      notes,
    });
  },
);

export async function runPreReview(input: PreReviewInput): Promise<AgentReviewResult> {
  return preReviewChain.invoke(input);
}
