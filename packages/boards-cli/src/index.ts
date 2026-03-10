import { Command } from '@commander-js/extra-typings';
import pkg from '../package.json';
import { boardCommand } from './commands/board.js';
import { claimCommand } from './commands/claim.js';
import { closeCommand } from './commands/close.js';
import { completeCommand } from './commands/complete.js';
import { commentCommand } from './commands/comment.js';
import { configCommand } from './commands/config.js';
import { createCommand } from './commands/create.js';
import { dbCommand } from './commands/db.js';
import { deleteCommand } from './commands/delete.js';
import { depCommand } from './commands/dep.js';
import { epicCommand } from './commands/epic.js';
import { failCommand } from './commands/fail.js';
import { initCommand } from './commands/init.js';
import { labelCommand } from './commands/label.js';
import { listCommand } from './commands/list.js';
import { readyCommand } from './commands/ready.js';
import { reopenCommand } from './commands/reopen.js';
import { searchCommand } from './commands/search.js';
import { showCommand } from './commands/show.js';
import { skillCommand } from './commands/skill.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { versionCommand } from './commands/version.js';
import { tuiCommand } from './commands/tui.js';

export const program = new Command('bd')
  .version(pkg.version)
  .description('Agent-oriented issue tracking')
  .option('--server <url>', 'Remote server URL')
  .addCommand(initCommand)
  .addCommand(boardCommand)
  .addCommand(createCommand)
  .addCommand(dbCommand)
  .addCommand(listCommand)
  .addCommand(showCommand)
  .addCommand(updateCommand)
  .addCommand(closeCommand)
  .addCommand(completeCommand)
  .addCommand(failCommand)
  .addCommand(deleteCommand)
  .addCommand(claimCommand)
  .addCommand(readyCommand)
  .addCommand(reopenCommand)
  .addCommand(searchCommand)
  .addCommand(depCommand)
  .addCommand(epicCommand)
  .addCommand(labelCommand)
  .addCommand(commentCommand)
  .addCommand(skillCommand)
  .addCommand(statusCommand)
  .addCommand(configCommand)
  .addCommand(versionCommand)
  .addCommand(tuiCommand)
  .addHelpText(
    'after',
    `
Examples:
  $ bd init
  $ bd board create myproject
  $ bd board use myproject
  $ bd create "Fix login bug" --type bug
  $ bd list --status open
  $ bd ready
  $ bd --server http://localhost:3000 list

Environment:
  BOARDS_HOME      Boards home directory (default: ~/.boards)
  BOARDS_SERVER    Remote server URL (same as --server)`,
  );
