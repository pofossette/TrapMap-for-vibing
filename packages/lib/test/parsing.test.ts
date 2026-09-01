import { describe, expect, it } from 'vitest';

import {
  detectMediaType,
  isTextLikeMediaType,
  parseMarkdownFrontmatter,
  parseSkillMarkdown,
} from '../src/parsing.js';

describe('shared parsing helpers', () => {
  describe('parseMarkdownFrontmatter', () => {
    it('parses YAML frontmatter and preserves the body', () => {
      const parsed = parseMarkdownFrontmatter(`---
name: Example Skill
description: Example description
---
# Heading

Body content.`);

      expect(parsed.hasFrontmatter).toBe(true);
      expect(parsed.data.name).toBe('Example Skill');
      expect(parsed.body.trim()).toBe('# Heading\n\nBody content.');
    });

    it('treats plain markdown as body-only content', () => {
      const parsed = parseMarkdownFrontmatter('# Plain markdown');

      expect(parsed.hasFrontmatter).toBe(false);
      expect(parsed.data).toEqual({});
      expect(parsed.body).toBe('# Plain markdown');
    });
  });

  describe('parseSkillMarkdown', () => {
    it('supports quoted values and YAML list labels', () => {
      const parsed = parseSkillMarkdown(`---
name: "Quoted Skill"
description: 'Handles quoted values'
labels:
  - parsing
  - traps
---
Use the parser.`);

      expect(parsed.hasFrontmatter).toBe(true);
      expect(parsed.name).toBe('Quoted Skill');
      expect(parsed.title).toBe('Quoted Skill');
      expect(parsed.description).toBe('Handles quoted values');
      expect(parsed.labels).toEqual(['parsing', 'traps']);
      expect(parsed.body.trim()).toBe('Use the parser.');
    });

    it('normalizes comma-delimited labels and title-only documents', () => {
      const parsed = parseSkillMarkdown(`---
title: Shared Parser
labels: parsing, mime, contracts
---
Shared parser body.`);

      expect(parsed.name).toBeNull();
      expect(parsed.title).toBe('Shared Parser');
      expect(parsed.labels).toEqual(['parsing', 'mime', 'contracts']);
    });

    it('returns undefined feedbackPrompts when not present in frontmatter', () => {
      const content = `---
name: test-skill
---
# Test Skill`;
      const result = parseSkillMarkdown(content);
      expect(result.feedbackPrompts).toBeUndefined();
    });

    it('parses feedbackPrompts array from frontmatter', () => {
      const content = `---
name: test-skill
feedbackPrompts:
  - prompt: "Which version?"
    required: false
  - prompt: "What error?"
    required: true
---
# Test Skill`;
      const result = parseSkillMarkdown(content);
      expect(result.feedbackPrompts).toEqual([
        { prompt: 'Which version?', required: false },
        { prompt: 'What error?', required: true },
      ]);
    });

    it('defaults required to false when not specified', () => {
      const content = `---
name: test-skill
feedbackPrompts:
  - prompt: "Optional question"
---
# Test Skill`;
      const result = parseSkillMarkdown(content);
      expect(result.feedbackPrompts).toEqual([{ prompt: 'Optional question', required: false }]);
    });

    it('ignores malformed feedbackPrompts entries without prompt field', () => {
      const content = `---
name: test-skill
feedbackPrompts:
  - prompt: "Valid question"
    required: true
  - notPrompt: "Invalid entry"
  - prompt: ""
  - prompt: "Another valid"
---
# Test Skill`;
      const result = parseSkillMarkdown(content);
      expect(result.feedbackPrompts).toEqual([
        { prompt: 'Valid question', required: true },
        { prompt: 'Another valid', required: false },
      ]);
    });

    it('returns undefined when feedbackPrompts is empty after filtering invalid entries', () => {
      const content = `---
name: test-skill
feedbackPrompts:
  - notPrompt: "No prompt field"
---
# Test Skill`;
      const result = parseSkillMarkdown(content);
      expect(result.feedbackPrompts).toBeUndefined();
    });

    it('returns undefined when feedbackPrompts is not an array', () => {
      const content = `---
name: test-skill
feedbackPrompts: "not an array"
---
# Test Skill`;
      const result = parseSkillMarkdown(content);
      expect(result.feedbackPrompts).toBeUndefined();
    });
  });

  describe('detectMediaType', () => {
    it('prefers stable text-oriented overrides for code and YAML files', () => {
      expect(detectMediaType('scripts/build.ts')).toBe('text/typescript');
      expect(detectMediaType('references/spec.yaml')).toBe('text/x-yaml');
      expect(detectMediaType('.gitignore')).toBe('text/plain');
    });

    it('falls back to octet-stream for unknown file extensions', () => {
      expect(detectMediaType('assets/blob.unknown-ext')).toBe('application/octet-stream');
    });
  });

  describe('isTextLikeMediaType', () => {
    it('treats structured text formats as UTF-8 content', () => {
      expect(isTextLikeMediaType('text/plain')).toBe(true);
      expect(isTextLikeMediaType('application/json')).toBe(true);
      expect(isTextLikeMediaType('application/problem+json')).toBe(true);
      expect(isTextLikeMediaType('image/png')).toBe(false);
    });
  });
});
