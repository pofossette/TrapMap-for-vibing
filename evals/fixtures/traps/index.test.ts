/**
 * Trap Fixture Completeness Tests
 *
 * Validates that all trap fixtures are well-formed:
 * 1. allTraps is non-empty
 * 2. Every trap has all required fields populated
 * 3. No duplicate IDs exist
 * 4. trapsById map is consistent with allTraps array
 */

import { describe, expect, it } from 'vitest';

import { allTraps, trapCategories, trapsByCategory, trapsById } from './index.js';

describe('Trap fixtures completeness', () => {
  it('allTraps is non-empty', () => {
    expect(allTraps.length).toBeGreaterThan(0);
  });

  it('every trap has all required fields', () => {
    for (const trap of allTraps) {
      expect(trap.id, 'trap missing id').toBeTruthy();
      expect(trap.scope, `trap ${trap.id} missing scope`).toMatch(/^(global|project)$/);
      expect(Array.isArray(trap.labels), `trap ${trap.id} labels must be array`).toBe(true);
      expect(trap.shortcut, `trap ${trap.id} missing shortcut`).toBeTruthy();
      expect(trap.detail, `trap ${trap.id} missing detail`).toBeTruthy();
      expect(typeof trap.requiredLevel, `trap ${trap.id} missing requiredLevel`).toBe('number');
      expect(trap.lifecycleState, `trap ${trap.id} missing lifecycleState`).toMatch(
        /^(approved|pending|rejected|deprecated)$/,
      );
    }
  });

  it('no duplicate IDs in allTraps', () => {
    const ids = allTraps.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('trapsById contains every trap from allTraps', () => {
    expect(trapsById.size).toBe(allTraps.length);
    for (const trap of allTraps) {
      expect(trapsById.has(trap.id)).toBe(true);
      expect(trapsById.get(trap.id)).toBe(trap);
    }
  });

  it('each category array is a subset of allTraps', () => {
    for (const category of trapCategories) {
      const traps = trapsByCategory[category];
      expect(traps.length, `category ${category} is empty`).toBeGreaterThan(0);
      for (const trap of traps) {
        expect(allTraps).toContainEqual(trap);
      }
    }
  });

  it('category totals equal allTraps length', () => {
    const categoryTotal = trapCategories.reduce((sum, cat) => sum + trapsByCategory[cat].length, 0);
    expect(categoryTotal).toBe(allTraps.length);
  });
});
