import { describe, expect, test } from 'bun:test';
import { generateId } from '../src/id.js';

describe('generateId', () => {
  test('matches pattern ^[a-z0-9]+-[a-z0-9]{6}$', () => {
    const id = generateId('test');
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]{6}$/);
  });

  test('uses the provided prefix', () => {
    const id = generateId('board');
    expect(id.startsWith('board-')).toBe(true);
  });

  test('generates different IDs on multiple calls', () => {
    const ids = new Set([generateId('x'), generateId('x'), generateId('x'), generateId('x'), generateId('x')]);
    expect(ids.size).toBeGreaterThan(1);
  });

  test('suffix is exactly 6 characters', () => {
    const id = generateId('prefix');
    const suffix = id.split('-')[1];
    expect(suffix).toHaveLength(6);
  });

  test('works with different prefix values', () => {
    for (const prefix of ['a', 'issue', 'bd', 'abc123']) {
      const id = generateId(prefix);
      expect(id).toMatch(new RegExp(`^${prefix}-[a-z0-9]{6}$`));
    }
  });
});
