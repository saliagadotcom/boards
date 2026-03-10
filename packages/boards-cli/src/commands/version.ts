// bd version

import { Command } from '@commander-js/extra-typings';
import pkg from '../../package.json';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput } from '../json.js';

export const versionCommand = new Command('version')
  .description('Show version and schema information')
  .option('--json', 'Output as JSON')
  .action(async (opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const isJson = !!opts.json;
    const config = resolveConfig({ json: isJson, server: globalOpts.server });

    let metadata;
    try {
      const { store, destroy } = await resolveStore(config);
      metadata = await store.getMetadata();
      await destroy();
    } catch {
      metadata = { version: pkg.version, schema_version: 0 };
    }

    if (isJson) {
      console.log(jsonOutput(metadata));
    } else {
      console.log(`Boards v${metadata.version} (schema v${metadata.schema_version})`);
    }
  });
