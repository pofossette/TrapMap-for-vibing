/**
 * Live eval v2: Q&A paradigm — capsule docs vs summary docs for answer quality
 *
 * Instead of "select a skill", we ask "answer this question" with different
 * context formats. Judge checks if the answer uses the correct skill's content.
 */

import { execSync } from 'node:child_process';

import { callLLM } from './lib/llm-actor.js';

const DB_URL =
  process.env.TRAPMAP_DATABASE_URL || 'postgresql://trapmap:trapmap@localhost:5434/trapmap';

function psql(sql: string): string {
  return execSync(
    `PGPASSWORD=trapmap psql "${DB_URL}" -t -A -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    {
      encoding: 'utf8',
      timeout: 10000,
    },
  ).trim();
}

interface DbSkill {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  labels: string[];
}

function querySkills(sql: string): DbSkill[] {
  const raw = psql(sql);
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const p = line.split('|');
      return {
        id: p[0],
        title: p[1],
        summary: p[2],
        keywords: (p[3] || '').replace(/[{}"]/g, '').split(',').filter(Boolean),
        labels: (p[4] || '').replace(/[{}"]/g, '').split(',').filter(Boolean),
      };
    });
}

function searchByKeywords(query: string, limit: number): DbSkill[] {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 10);
  if (!terms.length) return [];
  const tsQuery = terms.join(' | ');
  return querySkills(
    `SELECT id, title, summary, keywords, labels, ts_rank(search_vector, q) AS rank FROM eval_skills, to_tsquery('english', '${tsQuery}') q WHERE search_vector @@ q ORDER BY rank DESC LIMIT ${limit}`,
  );
}

function searchBySummary(query: string, limit: number): DbSkill[] {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 10);
  if (!terms.length) return [];
  // Use pg_trgm similarity on summary
  const q = terms.join(' ');
  return querySkills(
    `SELECT id, title, summary, keywords, labels, similarity(summary, '${q}') AS rank FROM eval_skills WHERE similarity(summary, '${q}') > 0.05 ORDER BY rank DESC LIMIT ${limit}`,
  );
}

function getAllExcept(excludeIds: string[]): DbSkill[] {
  const exclude = excludeIds.map((id) => `'${id}'`).join(',');
  return querySkills(
    `SELECT id, title, summary, keywords, labels FROM eval_skills WHERE id NOT IN (${exclude}) ORDER BY id`,
  );
}

// ─── Context formatters ───

function formatCapsuleContext(skills: DbSkill[]): string {
  return skills
    .map((s) =>
      [
        `[Document: ${s.title}]`,
        `Source: ${s.id}`,
        `When to use: When the user's task matches keywords: ${s.keywords.join(', ')}`,
        `Problem this solves: ${s.summary}`,
        `Relevant labels: ${s.labels.join(', ')}`,
        `Content: ${s.summary}`,
      ].join('\n'),
    )
    .join('\n\n');
}

function formatSummaryContext(skills: DbSkill[]): string {
  return skills.map((s) => [`[Document: ${s.title}]`, `${s.summary}`].join('\n')).join('\n\n');
}

// ─── Scenarios ───

interface Scenario {
  id: string;
  question: string;
  targetId: string;
  targetKeywords: string[]; // keywords that should appear in a correct answer
}

const scenarios: Scenario[] = [
  {
    id: 'cli-decay',
    question:
      'How do I check the decay status of skills using TrapMap CLI? What commands are available?',
    targetId: 'trapmap-cli-usage-guide',
    targetKeywords: ['decay', 'search', 'trapmap', 'cli', 'command'],
  },
  {
    id: 'lifecycle',
    question:
      'What is the complete lifecycle of a trap in TrapMap? How do traps transition between states?',
    targetId: 'workflow-with-trapmap',
    targetKeywords: ['lifecycle', 'active', 'review-due', 'stale', 'expired', 'maintenance'],
  },
  {
    id: 'ci-flaky',
    question:
      'How do I fix flaky tests in CI that fail due to timing issues? What are common CI/CD pipeline pitfalls?',
    targetId: 'trap-ci-pipeline-trap',
    targetKeywords: ['flaky', 'timing', 'fake timers', 'ci', 'pipeline', 'vitest'],
  },
  {
    id: 'db-migration',
    question:
      'What should I watch out for when running PostgreSQL schema migrations in production? How do I avoid lock contention?',
    targetId: 'trap-database-migration-trap',
    targetKeywords: [
      'migration',
      'lock',
      'alter table',
      'expand-contract',
      'postgresql',
      'rollback',
    ],
  },
];

const interferenceLevels = [
  { name: 'none', count: 0 },
  { name: 'low', count: 7 },
  { name: 'medium', count: 14 },
  { name: 'high', count: 21 },
] as const;

type Strategy = 'capsule-match' | 'skill-summary' | 'no-context';

const SYSTEM_PROMPT =
  "You are an expert technical advisor. Answer the user's question based on the provided documentation. Be specific, cite relevant commands, states, or patterns from the docs.";

// ─── Judging ───

function judgeAnswer(
  output: string,
  targetKeywords: string[],
  distractorIds: string[],
): {
  keywordHits: number;
  keywordTotal: number;
  keywordScore: number;
  containsDistractor: boolean;
  overallScore: number;
} {
  const lower = output.toLowerCase();

  const hits = targetKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
  const keywordScore = hits.length / targetKeywords.length;

  // Check if output mentions distractor skill IDs as primary source
  const containsDistractor = distractorIds.some((id) => {
    const idx = lower.indexOf(id.replace('trap-', '').replace('-trap', ''));
    return idx > -1 && idx < 200; // mentioned near the beginning
  });

  const overallScore = keywordScore * (containsDistractor ? 0.5 : 1.0);

  return {
    keywordHits: hits.length,
    keywordTotal: targetKeywords.length,
    keywordScore,
    containsDistractor,
    overallScore,
  };
}

// ─── Main ───

interface RunResult {
  scenario: string;
  strategy: Strategy;
  interference: string;
  interferenceCount: number;
  keywordHits: number;
  keywordTotal: number;
  keywordScore: number;
  overallScore: number;
  latencyMs: number;
}

async function main() {
  console.log('=== Live Eval v2: Q&A Paradigm ===');
  console.log('Model:', process.env.AURSCAN_OPENAI_MODEL);
  console.log('Scenarios:', scenarios.length);
  console.log('Interference:', interferenceLevels.map((l) => `${l.name}(${l.count})`).join(', '));
  console.log('Total LLM calls:', scenarios.length * interferenceLevels.length * 3);
  console.log('');

  const results: RunResult[] = [];

  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.id} (target: ${scenario.targetId}) ---`);

    const targetDoc = searchByKeywords(scenario.question, 5);
    const distractorPool = getAllExcept([scenario.targetId]);

    for (const level of interferenceLevels) {
      const distractors = distractorPool.slice(0, level.count);
      const distractorIds = distractors.map((d) => d.id);

      for (const strategy of ['capsule-match', 'skill-summary', 'no-context'] as const) {
        let contextBlock = '';

        if (strategy === 'capsule-match') {
          // keyword-based retrieval → capsule format
          const retrieved = searchByKeywords(scenario.question, 5);
          const allDocs = [...retrieved, ...distractors];
          contextBlock = formatCapsuleContext(allDocs);
        } else if (strategy === 'skill-summary') {
          // summary similarity → plain format
          const retrieved = searchBySummary(scenario.question, 5);
          const allDocs = [...retrieved, ...distractors];
          contextBlock = formatSummaryContext(allDocs);
        }

        const userPrompt =
          strategy === 'no-context'
            ? scenario.question
            : `Documentation:\n${contextBlock}\n\nQuestion: ${scenario.question}`;

        try {
          const result = await callLLM(SYSTEM_PROMPT, userPrompt, {
            temperature: 0,
            maxTokens: 512,
            timeoutMs: 60000,
          });

          const judgment = judgeAnswer(result.content, scenario.targetKeywords, distractorIds);

          results.push({
            scenario: scenario.id,
            strategy,
            interference: level.name,
            interferenceCount: level.count,
            ...judgment,
            latencyMs: result.latencyMs,
          });

          const pct = (judgment.keywordScore * 100).toFixed(0);
          const hitStr = `${judgment.keywordHits}/${judgment.keywordTotal}`;
          console.log(
            `  ${strategy.padEnd(16)} | ${level.name}(${String(level.count).padStart(2)}) | keywords=${hitStr.padEnd(6)} ${pct.padStart(4)}% | score=${judgment.overallScore.toFixed(2)} | ${result.latencyMs}ms`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `  ${strategy.padEnd(16)} | ${level.name}(${String(level.count).padStart(2)}) | ERROR: ${msg}`,
          );
          results.push({
            scenario: scenario.id,
            strategy,
            interference: level.name,
            interferenceCount: level.count,
            keywordHits: 0,
            keywordTotal: scenario.targetKeywords.length,
            keywordScore: 0,
            overallScore: 0,
            latencyMs: 0,
          });
        }
      }
    }
  }

  // ─── Report ───
  console.log('\n' + '═'.repeat(80));
  console.log('  LIVE EVAL RESULTS v2: capsule-match vs skill-summary (Q&A paradigm)');
  console.log('═'.repeat(80));
  console.log('');
  console.log(
    padR('Interference', 16) +
      padR('Strategy', 16) +
      padR('Avg Score', 12) +
      padR('Avg Hits', 12) +
      padR('Latency', 10),
  );
  console.log('-'.repeat(80));

  for (const level of interferenceLevels) {
    for (const strategy of ['capsule-match', 'skill-summary', 'no-context'] as const) {
      const rs = results.filter((r) => r.interference === level.name && r.strategy === strategy);
      if (!rs.length) continue;
      const avgScore = rs.reduce((s, r) => s + r.overallScore, 0) / rs.length;
      const avgHits = rs.reduce((s, r) => s + r.keywordHits, 0) / rs.length;
      const avgLat = rs.reduce((s, r) => s + r.latencyMs, 0) / rs.length;
      console.log(
        padR(level.name + '(' + level.count + ')', 16) +
          padR(strategy, 16) +
          padR((avgScore * 100).toFixed(0) + '%', 12) +
          padR(avgHits.toFixed(1), 12) +
          padR(avgLat.toFixed(0) + 'ms', 10),
      );
    }
  }

  // ─── Lift table ───
  console.log('\n' + '═'.repeat(80));
  console.log('  CAPSULE LIFT BY INTERFERENCE LEVEL');
  console.log('═'.repeat(80));
  console.log('');
  console.log(
    padR('Level', 16) +
      padR('Capsule', 12) +
      padR('Summary', 12) +
      padR('No-Ctx', 12) +
      padR('Lift', 12) +
      padR('Abs Δ', 10),
  );
  console.log('-'.repeat(80));

  for (const level of interferenceLevels) {
    const cap = results.filter(
      (r) => r.interference === level.name && r.strategy === 'capsule-match',
    );
    const sum = results.filter(
      (r) => r.interference === level.name && r.strategy === 'skill-summary',
    );
    const noc = results.filter((r) => r.interference === level.name && r.strategy === 'no-context');

    const avg = (rs: RunResult[]) =>
      rs.length ? rs.reduce((s, r) => s + r.overallScore, 0) / rs.length : 0;
    const capAvg = avg(cap),
      sumAvg = avg(sum),
      nocAvg = avg(noc);
    const lift = sumAvg > 0 ? ((capAvg - sumAvg) / sumAvg) * 100 : 0;
    const absDiff = capAvg - sumAvg;

    console.log(
      padR(level.name + '(' + level.count + ')', 16) +
        padR((capAvg * 100).toFixed(0) + '%', 12) +
        padR((sumAvg * 100).toFixed(0) + '%', 12) +
        padR((nocAvg * 100).toFixed(0) + '%', 12) +
        padR((lift >= 0 ? '+' : '') + lift.toFixed(0) + '%', 12) +
        padR((absDiff >= 0 ? '+' : '') + absDiff.toFixed(2), 10),
    );
  }

  // ─── Per-scenario ───
  console.log('\n' + '─'.repeat(80));
  console.log('  PER-SCENARIO KEYWORD HITS');
  console.log('─'.repeat(80));
  for (const scenario of scenarios) {
    console.log(
      `\n  ${scenario.id} (target: ${scenario.targetId}, keywords: ${scenario.targetKeywords.join(', ')})`,
    );
    for (const level of interferenceLevels) {
      const cap = results.find(
        (r) =>
          r.scenario === scenario.id &&
          r.interference === level.name &&
          r.strategy === 'capsule-match',
      );
      const sum = results.find(
        (r) =>
          r.scenario === scenario.id &&
          r.interference === level.name &&
          r.strategy === 'skill-summary',
      );
      console.log(
        `    ${level.name}(${String(level.count).padStart(2)}): capsule=${cap?.keywordHits ?? 0}/${cap?.keywordTotal ?? 0} | summary=${sum?.keywordHits ?? 0}/${sum?.keywordTotal ?? 0}`,
      );
    }
  }
}

function padR(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exitCode = 1;
});
