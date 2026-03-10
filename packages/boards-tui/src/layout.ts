import type { LayoutMode } from './types.js';
import { MIN_COLUMN_WIDTH, COLUMN_GAP, MIN_SINGLE_COLUMN_WIDTH, MIN_ROWS } from './types.js';

export function calculateLayoutMode(
  terminalWidth: number,
  terminalHeight: number,
  columnCount: number,
): LayoutMode {
  if (terminalHeight < MIN_ROWS) return 'too-small';
  if (terminalWidth < MIN_SINGLE_COLUMN_WIDTH) return 'too-small';

  const requiredWidth = columnCount * MIN_COLUMN_WIDTH + (columnCount - 1) * COLUMN_GAP;

  if (terminalWidth >= requiredWidth) return 'multi';
  return 'focused';
}
