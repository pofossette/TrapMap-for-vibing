import type { FastifyInstance } from 'fastify';

function renderProcessMetrics(): string {
  const memoryUsage = process.memoryUsage();
  return [
    '# TYPE trapmap_process_resident_memory_bytes gauge',
    `trapmap_process_resident_memory_bytes ${memoryUsage.rss}`,
    '# TYPE trapmap_nodejs_heap_size_used_bytes gauge',
    `trapmap_nodejs_heap_size_used_bytes ${memoryUsage.heapUsed}`,
    '# TYPE trapmap_nodejs_heap_size_total_bytes gauge',
    `trapmap_nodejs_heap_size_total_bytes ${memoryUsage.heapTotal}`,
    '',
  ].join('\n');
}

export function attachRuntimeMetricsRoute(app: FastifyInstance) {
  app.get('/metrics', async (_request, reply) => {
    return reply
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(renderProcessMetrics());
  });
}
