/**
 * Markdown content parsing helpers for derivation.
 */

import { parseMarkdownFrontmatter, parseSkillMarkdown } from '@trapmap/lib';

/**
 * Extract frontmatter metadata from SKILL.md content.
 *
 * @param content - SKILL.md content with optional frontmatter
 * @returns Extracted title, labels, and optional semver version
 */
export function parseFrontmatter(content: string): {
  title: string | null;
  labels: string[];
  version: string | null;
} {
  const metadata = parseSkillMarkdown(content);
  const raw = parseMarkdownFrontmatter(content);
  const version = typeof raw.data.version === 'string' ? raw.data.version.trim() : null;
  return {
    title: metadata.title,
    labels: metadata.labels,
    version: version && version.length > 0 ? version : null,
  };
}

/**
 * Extract situation/problem/goal sections from SKILL.md content.
 *
 * @param content - SKILL.md content with sections
 * @returns Extracted sections
 */
export function extractSections(content: string): {
  situation: string | null;
  problem: string | null;
  goal: string | null;
} {
  // Remove frontmatter
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // Extract sections using markdown headers
  const sectionPatterns = {
    situation: /^##\s*Situation\s*\n([\s\S]*?)(?=\n##|\n#|$)/im,
    problem: /^##\s*Problem\s*\n([\s\S]*?)(?=\n##|\n#|$)/im,
    goal: /^##\s*Goal\s*\n([\s\S]*?)(?=\n##|\n#|$)/im,
  };

  const extractSection = (pattern: RegExp): string | null => {
    const match = body.match(pattern);
    if (!match) return null;
    const text = match[1]?.trim();
    if (!text) return null;
    // Truncate to max length for capsule fields
    return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
  };

  return {
    situation: extractSection(sectionPatterns.situation),
    problem: extractSection(sectionPatterns.problem),
    goal: extractSection(sectionPatterns.goal),
  };
}

/**
 * Build a summary from combined text content.
 * Uses the first meaningful paragraph or extracts key sentences.
 *
 * @param text - Combined text content
 * @returns Summary string
 */
export function buildSummaryFromText(text: string): string {
  // Remove frontmatter
  let body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // Remove code blocks
  body = body.replace(/```[\s\S]*?```/g, '');

  // Find first paragraph with meaningful content
  const paragraphs = body.split(/\n\n+/);
  for (const para of paragraphs) {
    const cleaned = para.replace(/^#+\s*/gm, '').trim();
    if (cleaned.length > 20) {
      // Truncate to max 1000 chars
      return cleaned.length > 1000 ? `${cleaned.slice(0, 997)}...` : cleaned;
    }
  }

  // Fallback: use first 500 chars
  const fallback = body.replace(/[#*`[\]]/g, '').trim();
  return fallback.length > 500 ? `${fallback.slice(0, 497)}...` : fallback;
}

/**
 * Extract keywords from text content.
 *
 * @param text - Combined text content
 * @param existingLabels - Labels from artifact/frontmatter
 * @returns Array of keywords
 */
export function extractKeywords(text: string, existingLabels: string[]): string[] {
  const keywords = new Set<string>(existingLabels);

  // Common technical terms to look for
  const technicalPatterns = [
    /\b(docker|kubernetes|node\.?js|typescript|javascript|python|rust|go|java)\b/gi,
    /\b(react|vue|angular|express|fastify|next\.?js)\b/gi,
    /\b(postgres|mysql|mongodb|redis|sqlite)\b/gi,
    /\b(aws|gcp|azure|terraform|ansible)\b/gi,
  ];

  for (const pattern of technicalPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Normalize: lowercase, remove dots
        const normalized = match.toLowerCase().replace(/\./g, '');
        keywords.add(normalized);
      }
    }
  }

  return Array.from(keywords).sort().slice(0, 10);
}

/**
 * Check whether extracted sections contain structured capsule semantics.
 */
export function hasStructuredCapsuleSemantics(sections: {
  situation: string | null;
  problem: string | null;
  goal: string | null;
}): boolean {
  return Boolean(sections.situation || sections.problem || sections.goal);
}
