import { describe, expect, it } from 'bun:test';
import { calculateScroll } from '../src/column.js';

describe('calculateScroll', () => {
  it('shows all issues when they fit in viewport', () => {
    expect(calculateScroll(5, 2, 10)).toEqual({ start: 0, end: 5 });
  });

  it('shows all issues when count equals viewport height', () => {
    expect(calculateScroll(10, 5, 10)).toEqual({ start: 0, end: 10 });
  });

  it('centres selected item when possible', () => {
    // 20 issues, viewport 6, selected index 10 → start at 10 - 3 = 7
    const result = calculateScroll(20, 10, 6);
    expect(result.start).toBe(7);
    expect(result.end).toBe(13);
    expect(result.end - result.start).toBe(6);
  });

  it('clamps to start when selected is near beginning', () => {
    const result = calculateScroll(20, 1, 6);
    expect(result.start).toBe(0);
    expect(result.end).toBe(6);
  });

  it('clamps to end when selected is near bottom', () => {
    const result = calculateScroll(20, 19, 6);
    expect(result.start).toBe(14);
    expect(result.end).toBe(20);
  });

  it('handles selected at first item', () => {
    const result = calculateScroll(20, 0, 6);
    expect(result.start).toBe(0);
    expect(result.end).toBe(6);
  });

  it('handles selected at last item', () => {
    const result = calculateScroll(20, 19, 6);
    expect(result.start).toBe(14);
    expect(result.end).toBe(20);
  });

  it('handles viewport of 1', () => {
    const result = calculateScroll(10, 5, 1);
    expect(result.start).toBe(5);
    expect(result.end).toBe(6);
  });

  it('handles empty list', () => {
    expect(calculateScroll(0, 0, 10)).toEqual({ start: 0, end: 0 });
  });
});
