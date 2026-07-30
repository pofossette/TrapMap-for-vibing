import { createHash, randomBytes } from 'node:crypto';

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function createOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(18).toString('base64url')}`;
}

export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
