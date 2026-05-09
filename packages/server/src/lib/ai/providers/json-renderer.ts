/**
 * JSON template renderer.
 *
 * Template syntax (inside JSON):
 *   {{var}}              — scalar substitution
 *   {{#list var}}...{{/list}} — array iteration within JSON arrays
 *
 * Template metadata (stripped from output):
 *   _template, _doc, _format  — documentation keys
 *   _if_varName               — conditionally removes sibling key when slot is falsy
 *
 * Steps: expand lists → substitute scalars → remove conditionals → strip metadata → parse.
 */

import type { PromptSlots } from './types.js';

const SCALAR_RE = /\{\{(\w+)\}\}/g;
const LIST_OPEN_RE = /\{\{#list\s+(\w+)\}\}/;
const LIST_CLOSE_RE = /\{\{\/list\}\}/;
const CONDITION_RE = /^_if_(\w+)$/;
const META_KEY_RE = /^_/;

function replaceScalars(template: string, slots: PromptSlots): string {
  return template.replace(SCALAR_RE, (_match, key: string) => {
    const value = slots[key as keyof PromptSlots];
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    return '';
  });
}

function expandListArrays(template: string, slots: PromptSlots): string {
  const lines = template.split('\n');
  const result: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const openMatch = LIST_OPEN_RE.exec(line);

    if (openMatch) {
      const key = openMatch[1]!;
      const value = slots[key as keyof PromptSlots];

      // Find the closing {{/list}} line
      let closeIdx = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (LIST_CLOSE_RE.test(lines[j]!)) {
          closeIdx = j;
          break;
        }
      }

      if (closeIdx === -1) {
        // No closing tag found, pass through
        result.push(line);
        i++;
        continue;
      }

      if (Array.isArray(value) && value.length > 0) {
        const lastIdx = closeIdx - 1;
        for (let k = 0; k < value.length; k++) {
          // Use the template item line (between open and close), replace {{item}}
          const itemLine = lines[i + 1]!.replace(/\{\{item\}\}/g, String(value[k]));
          result.push(itemLine);
          if (k < value.length - 1 && lastIdx > i + 1) {
            // Add separator lines between items (lines between item and close)
            for (let s = i + 2; s <= lastIdx; s++) {
              result.push(lines[s]!);
            }
          }
        }
      }
      // Skip to line after {{/list}}
      i = closeIdx + 1;
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}

function removeConditionalSections(template: string, slots: PromptSlots): string {
  const lines = template.split('\n');
  const result: string[] = [];
  let skipNextDataLine = false;

  for (const line of lines) {
    const condMatch = CONDITION_RE.exec(line.trim());
    if (condMatch) {
      const key = condMatch[1]!;
      const value = slots[key as keyof PromptSlots];
      if (!isTruthy(value)) {
        skipNextDataLine = true;
      }
      continue; // Always remove the _if_ line itself
    }

    if (skipNextDataLine) {
      skipNextDataLine = false;
      continue; // Skip the data line that follows a falsy _if_
    }

    result.push(line);
  }

  return result.join('\n');
}

function removeMetaKeys(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!META_KEY_RE.test(key)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function renderJsonTemplate(template: string, slots: PromptSlots): Record<string, unknown> {
  // 1. Expand {{#list ...}}...{{/list}} within JSON arrays (must run before scalar replacement
  //    so that {{item}} inside list blocks is consumed before scalars replace it with empty string)
  let processed = expandListArrays(template, slots);

  // 2. Replace scalar {{var}} placeholders
  processed = replaceScalars(processed, slots);

  // 3. Remove conditional sections where _if_* is falsy
  processed = removeConditionalSections(processed, slots);

  // 4. Parse the JSON (with remaining list artifacts)
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(processed) as Record<string, unknown>;
  } catch {
    // Fallback: attempt aggressive cleanup for malformed JSON
    processed = processed.replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
    parsed = JSON.parse(processed) as Record<string, unknown>;
  }

  // 5. Remove template metadata keys
  parsed = removeMetaKeys(parsed);

  // 6. Remove empty arrays
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value) && value.length === 0) {
      Reflect.deleteProperty(parsed, key);
    }
  }

  return parsed;
}
