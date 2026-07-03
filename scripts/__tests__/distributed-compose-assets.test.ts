import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..', '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('distributed compose assets', () => {
  it('declares the full checked-in distributed service set with discovery env', () => {
    const compose = readRepoFile('docker-compose.yml');

    expect(compose).toContain('gateway:');
    expect(compose).toContain('identity-access:');
    expect(compose).toContain('knowledge-read:');
    expect(compose).toContain('knowledge-write:');
    expect(compose).toContain('candidate-worker:');
    expect(compose).toContain('governance-worker:');
    expect(compose).toContain('outbox-worker:');

    expect(compose).toContain('CONSUL_ENABLED=${CONSUL_ENABLED:-true}');
    expect(compose).toContain('CONSUL_HOST=${CONSUL_HOST:-consul}');
    expect(compose).toContain('CONSUL_PORT=${CONSUL_PORT:-8500}');
    expect(compose).toContain(
      'OTEL_EXPORTER_OTLP_ENDPOINT=${OTEL_EXPORTER_OTLP_ENDPOINT:-http://tempo:4318}',
    );
  });

  it('connects Prometheus to the distributed network and targets actual service names and ports', () => {
    const observabilityCompose = readRepoFile('docker-compose.observability.yml');
    const prometheusConfig = readRepoFile('config/prometheus.yml');
    const promtailConfig = readRepoFile('config/promtail.yml');

    expect(observabilityCompose).toMatch(
      /prometheus:\n[\s\S]*networks:\n[\s\S]*- trapmap-observability\n[\s\S]*- trapmap-distributed/,
    );
    expect(observabilityCompose).toMatch(
      /tempo:\n[\s\S]*networks:\n[\s\S]*- trapmap-observability\n[\s\S]*- trapmap-distributed/,
    );
    expect(observabilityCompose).toContain('promtail:');
    expect(observabilityCompose).toContain('./config/promtail.yml:/etc/promtail/config.yml:ro');

    expect(prometheusConfig).toContain('targets: ["gateway:4000"]');
    expect(prometheusConfig).toContain('targets: ["identity-access:4001"]');
    expect(prometheusConfig).toContain('targets: ["knowledge-read:4002"]');
    expect(prometheusConfig).toContain('targets: ["knowledge-write:4003"]');
    expect(prometheusConfig).toContain('targets: ["candidate-worker:4004"]');
    expect(prometheusConfig).toContain('targets: ["governance-worker:4005"]');
    expect(prometheusConfig).toContain('targets: ["outbox-worker:4006"]');
    expect(promtailConfig).toContain('service: trapmap');
    expect(promtailConfig).toContain('__path__: /var/lib/docker/containers/*/*-json.log');
  });

  it('keeps consul on a single private network to avoid dual-address startup failure', () => {
    const observabilityCompose = readRepoFile('docker-compose.observability.yml');
    const consulBlock = observabilityCompose.match(/consul:\n[\s\S]*?\n\n  tempo:/)?.[0] ?? '';

    expect(consulBlock).toContain('networks:');
    expect(consulBlock).toContain('- trapmap-distributed');
    expect(consulBlock).not.toContain('- trapmap-observability');
  });
});
