/** Shared artifact-bundle extraction helpers for the B3 read tools. */

export interface BundleFile {
  path?: unknown;
  kind?: unknown;
  content?: unknown;
  activationOnly?: unknown;
  [key: string]: unknown;
}

export function firstBundle(response: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(response)) return response[0] as Record<string, unknown> | undefined;
  if (
    response &&
    typeof response === 'object' &&
    Array.isArray((response as { artifacts?: unknown }).artifacts)
  ) {
    return (response as { artifacts: unknown[] }).artifacts[0] as
      | Record<string, unknown>
      | undefined;
  }
  if (response && typeof response === 'object') return response as Record<string, unknown>;
  return undefined;
}

export function bundleFiles(bundle: Record<string, unknown>): BundleFile[] {
  for (const key of ['files', 'bundle', 'fileManifest'] as const) {
    const value = bundle[key];
    if (Array.isArray(value)) return value as BundleFile[];
  }
  const revision = bundle.revision;
  if (
    revision &&
    typeof revision === 'object' &&
    Array.isArray((revision as { files?: unknown }).files)
  ) {
    return (revision as { files: BundleFile[] }).files;
  }
  return [];
}
