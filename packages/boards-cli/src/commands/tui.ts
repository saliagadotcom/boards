// bd tui — interactive TUI board viewer

import { Command } from '@commander-js/extra-typings';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';

export const tuiCommand = new Command('tui')
  .description('Open interactive board browser')
  .option('--board <name>', 'Board name')
  .action(async (opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({
      board: opts.board,
      server: globalOpts.server,
    });

    // TTY check
    if (!process.stdout.isTTY) {
      console.error('bd tui requires an interactive terminal (TTY).');
      process.exitCode = 1;
      return;
    }

    // Board name required
    const board = config.default_board;
    if (!board) {
      console.error('No board specified. Use --board or set a default with `bd board use <name>`.');
      process.exitCode = 1;
      return;
    }

    const { store, destroy } = await resolveStore(config);

    try {
      // Verify board exists
      const boards = await store.listBoards();
      const exists = boards.some((b) => b.id === board);
      if (!exists) {
        console.error(`Board "${board}" not found.`);
        process.exitCode = 1;
        return;
      }

      // Dynamic import to avoid loading React/Ink in non-TUI commands
      const { renderApp } = await import('@saliagadotcom/boards-tui');

      const { waitUntilExit } = renderApp({ store, board });

      await waitUntilExit();
    } finally {
      await destroy();
    }
  });
