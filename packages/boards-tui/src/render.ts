import React from 'react';
import { render } from 'ink';
import { App } from './app.js';
import type { AppProps } from './types.js';

// Alternate screen buffer escape sequences
const ENTER_ALT_SCREEN = '\x1b[?1049h';
const EXIT_ALT_SCREEN = '\x1b[?1049l';

/**
 * Renders the TUI app using the same React/Ink instances as the components.
 * This avoids dual-instance issues when the CLI dynamically imports React/Ink separately.
 * Uses the alternate screen buffer so the terminal is restored on exit.
 */
export function renderApp(props: AppProps): { waitUntilExit: () => Promise<void> } {
  const stdout = process.stdout;
  stdout.write(ENTER_ALT_SCREEN);

  const element = React.createElement(App, props);
  const instance = render(element);

  const originalWaitUntilExit = instance.waitUntilExit.bind(instance);
  return {
    waitUntilExit: async () => {
      try {
        await originalWaitUntilExit();
      } finally {
        stdout.write(EXIT_ALT_SCREEN);
      }
    },
  };
}
