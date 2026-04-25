import { extname } from 'node:path';

import matter from 'gray-matter';
import mime from 'mime-types';

export interface ParsedMarkdownFrontmatter {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
}

export interface ParsedSkillMarkdown {
  name: string | null;
  title: string | null;
  description: string | null;
  labels: string[];
  body: string;
  hasFrontmatter: boolean;
}

const MIME_OVERRIDES: Record<string, string> = {
  '.bash': 'text/x-shellscript',
  '.dockerfile': 'text/x-dockerfile',
  '.example': 'text/plain',
  '.go': 'text/x-go',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.java': 'text/x-java',
  '.js': 'text/javascript',
  '.md': 'text/markdown',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.rs': 'text/x-rust',
  '.sh': 'text/x-shellscript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.yaml': 'text/x-yaml',
  '.yml': 'text/x-yaml',
  '.zsh': 'text/x-shellscript',
};

const BASENAME_MEDIA_TYPES: Record<string, string> = {
  '.dockerignore': 'text/plain',
  '.env': 'text/plain',
  '.gitignore': 'text/plain',
  dockerfile: 'text/x-dockerfile',
};

export function parseMarkdownFrontmatter(content: string): ParsedMarkdownFrontmatter {
  const hasFrontmatter = /^---(?:\r?\n)/.test(content);

  if (!hasFrontmatter) {
    return {
      data: {},
      body: content,
      hasFrontmatter: false,
    };
  }

  try {
    const parsed = matter(content);
    return {
      data: isRecord(parsed.data) ? parsed.data : {},
      body: parsed.content,
      hasFrontmatter: true,
    };
  } catch {
    return {
      data: {},
      body: content,
      hasFrontmatter: false,
    };
  }
}

export function parseSkillMarkdown(content: string): ParsedSkillMarkdown {
  const parsed = parseMarkdownFrontmatter(content);
  const data = parsed.data;
  const name = readString(data.name);
  const explicitTitle = readString(data.title);

  return {
    name,
    title: explicitTitle ?? name,
    description: readString(data.description),
    labels: readLabels(data.labels),
    body: parsed.body,
    hasFrontmatter: parsed.hasFrontmatter,
  };
}

export function detectMediaType(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const basename = normalizedPath.split('/').pop()?.toLowerCase() ?? normalizedPath.toLowerCase();
  const explicitBasenameType = BASENAME_MEDIA_TYPES[basename];
  if (explicitBasenameType) {
    return explicitBasenameType;
  }

  const extension = extname(basename);
  const explicitExtensionType = MIME_OVERRIDES[extension];
  if (explicitExtensionType) {
    return explicitExtensionType;
  }

  const detected = mime.lookup(normalizedPath);
  return typeof detected === 'string' ? detected : 'application/octet-stream';
}

export function isTextLikeMediaType(mediaType: string): boolean {
  return (
    mediaType.startsWith('text/') ||
    mediaType === 'application/json' ||
    mediaType === 'application/javascript' ||
    mediaType === 'application/xml' ||
    mediaType === 'application/yaml' ||
    mediaType === 'application/x-yaml' ||
    mediaType.endsWith('+json') ||
    mediaType.endsWith('+xml') ||
    mediaType.endsWith('+yaml')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}
