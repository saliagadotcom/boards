import { describe, expect, it } from 'bun:test';
import { calculateLayoutMode } from '../src/layout.js';
import { MIN_COLUMN_WIDTH, COLUMN_GAP, MIN_SINGLE_COLUMN_WIDTH, MIN_ROWS } from '../src/types.js';

describe('calculateLayoutMode', () => {
  it('returns multi for 5 columns at 120 wide', () => {
    expect(calculateLayoutMode(120, 24, 5)).toBe('multi');
  });

  it('returns focused for 5 columns at 60 wide', () => {
    expect(calculateLayoutMode(60, 24, 5)).toBe('focused');
  });

  it('returns too-small for 1 column at 15 wide', () => {
    expect(calculateLayoutMode(15, 24, 1)).toBe('too-small');
  });

  it('returns too-small when height < MIN_ROWS regardless of width', () => {
    expect(calculateLayoutMode(200, MIN_ROWS - 1, 5)).toBe('too-small');
  });

  it('returns multi at exact boundary width', () => {
    const columnCount = 3;
    const exactWidth = MIN_COLUMN_WIDTH * columnCount + (columnCount - 1) * COLUMN_GAP;
    expect(calculateLayoutMode(exactWidth, 24, columnCount)).toBe('multi');
  });

  it('returns focused one pixel below boundary', () => {
    const columnCount = 3;
    const exactWidth = MIN_COLUMN_WIDTH * columnCount + (columnCount - 1) * COLUMN_GAP;
    expect(calculateLayoutMode(exactWidth - 1, 24, columnCount)).toBe('focused');
  });

  it('returns too-small at exact MIN_ROWS boundary for height', () => {
    expect(calculateLayoutMode(120, MIN_ROWS, 5)).toBe('multi');
    expect(calculateLayoutMode(120, MIN_ROWS - 1, 5)).toBe('too-small');
  });

  it('handles 0 columns edge case', () => {
    // 0 columns: requiredWidth = 0 * 20 + (0 - 1) * 1 = -1, any width >= -1 → multi
    expect(calculateLayoutMode(80, 24, 0)).toBe('multi');
  });
});
