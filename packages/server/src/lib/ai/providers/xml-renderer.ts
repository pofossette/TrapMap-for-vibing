/**
 * XML template renderer.
 *
 * Template syntax:
 *   {{var}}              — scalar substitution (XML-escaped)
 *   {{#if var}}...{{/if}} — conditional block (removed when falsy)
 *   {{#list var}}...{{/list}} — array iteration ({{item}} replaced per element)
 *
 * HTML comments (<!-- ... -->) are stripped before rendering.
 */

import type { PromptSlots } from './types.js';

const XML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const XML_ESCAPE_RE = /[&<>"']/g;

function escapeXml(value: string): string {
  return value.replace(XML_ESCAPE_RE, (ch) => XML_ESCAPE_MAP[ch]!);
}

function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function renderXmlTemplate(template: string, slots: PromptSlots): string {
  // Strip HTML comments
  let result = template.replace(/<!--[\s\S]*?-->/g, '');

  // Process {{#if ...}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, block: string) => {
      const value = slots[key as keyof PromptSlots];
      return isTruthy(value) ? block : '';
    },
  );

  // Process {{#list ...}}...{{/list}} blocks
  result = result.replace(
    /\{\{#list\s+(\w+)\}\}([\s\S]*?)\{\{\/list\}\}/g,
    (_match, key: string, block: string) => {
      const value = slots[key as keyof PromptSlots];
      if (!Array.isArray(value) || value.length === 0) return '';

      return value
        .map((item) => block.replace(/\{\{item\}\}/g, escapeXml(String(item))))
        .join('\n');
    },
  );

  // Replace scalar {{var}} placeholders
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = slots[key as keyof PromptSlots];
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return escapeXml(value);
    // Arrays and objects are handled by {{#list}} / not supported as scalars
    return '';
  });

  // Clean up blank lines from removed blocks
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}
