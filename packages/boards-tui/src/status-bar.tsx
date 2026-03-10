import { Box, Text } from 'ink';
import type { ViewMode } from './types.js';

export interface StatusBarProps {
  viewMode: ViewMode;
  error?: string;
  refreshing?: boolean;
}

const hints: Record<Exclude<ViewMode, 'loading'>, string> = {
  board: '[q] quit  [h/l] column  [j/k] issue  [enter] detail  [ctrl+e] edit',
  detail: '[esc] back  [t] tree  [j/k] scroll  [ctrl+e] edit  [q] quit',
  tree: '[esc] back  [d] toggle direction  [j/k] navigate  [q] quit',
  editing: '[tab] field  [j/k] select  [space] toggle  [enter] save  [esc] cancel',
};

export function StatusBar({ viewMode, error, refreshing }: StatusBarProps) {
  const left =
    viewMode === 'loading' ? 'Loading…' : hints[viewMode];

  return (
    <Box width="100%">
      <Box flexGrow={1}>
        <Text bold inverse>
          {` ${left} `}
        </Text>
      </Box>
      {error && (
        <Box marginLeft={1}>
          <Text color="red" bold inverse>
            {` ${error} `}
          </Text>
        </Box>
      )}
      {refreshing && !error && (
        <Box marginLeft={1}>
          <Text bold inverse>
            {' ↻ '}
          </Text>
        </Box>
      )}
    </Box>
  );
}
