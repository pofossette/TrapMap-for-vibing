import type { GeneSearchResponse } from '@trapmap/contracts';

export function formatStrategyGene(response: GeneSearchResponse): string {
  const primary = response.primaryGene;
  if (!primary) return 'No matching Experience Gene.';

  const lines = [
    '<strategy-gene>',
    `Domain keywords: ${primary.gene.signalsMatch.join(', ')}`,
    `Summary: ${primary.gene.summary}`,
    'Strategy:',
  ];
  let step = 1;
  for (const strategy of primary.gene.strategy) {
    lines.push(`  ${step}. ${strategy}`);
    step += 1;
  }
  for (const avoid of primary.gene.avoid) {
    lines.push(`  ${step}. AVOID: ${avoid}`);
    step += 1;
  }
  lines.push('</strategy-gene>');
  return lines.join('\n');
}
