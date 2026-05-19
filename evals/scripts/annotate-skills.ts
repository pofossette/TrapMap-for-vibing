/**
 * Skill Annotation Helper
 *
 * Utility script that loads downloaded skill bundles, runs deriveFromPayloads()
 * on each to get summaries, and prints a table for manual pair selection
 * (dedup, conflict, graph extraction).
 *
 * Usage:
 *   pnpm exec tsx evals/scripts/annotate-skills.ts
 *   pnpm exec tsx evals/scripts/annotate-skills.ts --limit 20
 *   pnpm exec tsx evals/scripts/annotate-skills.ts --repo anthropics
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { ArtifactBundle, BundleFilePayload } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Options {
  limit: number;
  repo: string;
}

function parseArgs_(): Options {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string', short: 'l', default: '0' },
      repo: { type: 'string', short: 'r', default: '' },
    },
    strict: true,
  });
  return {
    limit: parseInt(values.limit ?? '0', 10),
    repo: values.repo ?? '',
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillSummary {
  repo: string;
  title: string;
  slug: string;
  summary: string;
  keywords: string[];
  capsuleCount: number;
  capsuleSituations: string[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs_();

  // Load bundles
  const bundlePath = join(process.cwd(), 'data', 'downloaded-skills', 'skill-bundles.json');
  let bundles: ArtifactBundle[];
  try {
    const raw = readFileSync(bundlePath, 'utf-8');
    const parsed = JSON.parse(raw) as { bundles: ArtifactBundle[] };
    bundles = parsed.bundles;
  } catch (_err) {
    console.error(`Cannot load bundles from ${bundlePath}.`);
    console.error('Run `pnpm download:skills` first.');
    process.exit(1);
  }

  // Filter by repo if specified
  if (options.repo) {
    bundles = bundles.filter((b) => b.labels.includes(options.repo));
  }

  // Limit
  if (options.limit > 0) {
    bundles = bundles.slice(0, options.limit);
  }

  console.log(`Processing ${bundles.length} bundles...\n`);

  // Dynamic import
  const { deriveFromPayloads } = await import('../../packages/server/src/lib/artifacts/derive.js');

  const summaries: SkillSummary[] = [];

  for (const bundle of bundles) {
    const artifactId = createHash('sha256').update(bundle.slug).digest('hex').slice(0, 16);
    const payloads = bundle.files.map((file: BundleFilePayload) => ({
      artifactId,
      revision: 1,
      path: file.path,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      mediaType: file.mediaType,
      content: file.content,
      storedAt: '2025-01-01T00:00:00.000Z',
    }));
    const context = {
      artifactId,
      labels: bundle.labels,
      title: bundle.title,
      scope: bundle.scope,
      requiredLevel: bundle.requiredLevel,
    };

    const output = await deriveFromPayloads(payloads, context);

    const repoLabel = bundle.labels.find((l) =>
      ['anthropics', 'composio', 'alirezarezvani', 'jezweb', 'daymade', 'testcontainers', 'ykdojo'].includes(l),
    ) ?? 'unknown';

    summaries.push({
      repo: repoLabel,
      title: bundle.title,
      slug: bundle.slug,
      summary: output.profile?.summary?.slice(0, 120) ?? '(no summary)',
      keywords: output.profile?.keywords ?? [],
      capsuleCount: output.capsules.length,
      capsuleSituations: output.capsules.map((c: { situation: string }) => c.situation?.slice(0, 80) ?? ''),
    });
  }

  // Print table
  console.log('=== Skill Summaries for Annotation ===\n');
  console.log(
    '#  | Repo           | Title                                  | Caps | Keywords',
  );
  console.log(
    '---|----------------|----------------------------------------|------|----------',
  );

  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    const num = String(i + 1).padStart(2);
    const repo = s.repo.padEnd(14);
    const title = s.title.slice(0, 38).padEnd(38);
    const caps = String(s.capsuleCount).padStart(4);
    const keywords = s.keywords.slice(0, 3).join(', ');
    console.log(`${num} | ${repo} | ${title} | ${caps} | ${keywords}`);
  }

  console.log(`\nTotal: ${summaries.length} skills`);
  console.log('\nTo annotate pairs:');
  console.log('  1. Pick skills with overlapping topics for semantic duplicates');
  console.log('  2. Pick skills with same topic, different approaches for alternatives');
  console.log('  3. Pick unrelated skills for none pairs');
  console.log('  4. Use the summary field as {title, body} in eval fixtures');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
