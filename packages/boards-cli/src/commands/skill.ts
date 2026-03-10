// bd skill — print embedded SKILL.md to stdout

import { Command } from '@commander-js/extra-typings';
import skillContent from '../assets/skills/boards/SKILL.md' with { type: 'text' };

export const skillCommand = new Command('skill')
  .description('Print the agent skill file (SKILL.md) to stdout')
  .action(() => {
    process.stdout.write(skillContent);
  });
