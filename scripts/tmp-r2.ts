import { readFileSync } from 'node:fs';
import { collectLocalConstants, createHoleResolver } from './lib/sql-constants.js';

for (const file of [
  'packages/service-knowledge-write/src/experience-gene-repository.ts',
  'packages/service-job-runtime/src/async-runtime.ts',
]) {
  const source = readFileSync(file, 'utf8');
  const consts = collectLocalConstants(source);
  console.log(file, '=> consts:', [...consts.keys()].slice(0, 12).join(', '));
  const resolve = await createHoleResolver(process.cwd(), source);
  for (const hole of ['GENE_COLUMNS', 'TASK_STATUS_PENDING', 'OUTBOX_STATUS_PENDING', 'columns']) {
    console.log('   ', hole, '=>', JSON.stringify(resolve(hole))?.slice(0, 60));
  }
}
