// bd comment

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

const addCommand = new Command('add')
  .description('Add a comment to an issue')
  .argument('<issue-id>', 'Issue ID')
  .argument('<text>', 'Comment text')
  .option('--author <name>', 'Author name', 'anonymous')
  .option('--json', 'Output as JSON')
  .action(async (issueId, text, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const comment = await store.addComment(issueId, opts.author, text);

      if (isJson) {
        console.log(jsonOutput(comment));
      } else {
        console.log(`Comment #${comment.id} added to ${issueId}`);
      }
    } catch (err) {
      if (err instanceof BoardsError) {
        if (isJson) {
          console.log(jsonError(err.code, err.message));
        } else {
          console.error(err.message);
        }
        process.exitCode = 1;
      } else {
        throw err;
      }
    } finally {
      await destroy();
    }
  });

const listCommand = new Command('list')
  .description('List comments on an issue')
  .argument('<issue-id>', 'Issue ID')
  .option('--json', 'Output as JSON')
  .action(async (issueId, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const comments = await store.listComments(issueId);

      if (isJson) {
        console.log(jsonOutput(comments));
      } else {
        if (comments.length === 0) {
          console.log('No comments.');
        } else {
          for (const c of comments) {
            console.log(`#${c.id} @${c.author} (${c.created_at}):`);
            console.log(`  ${c.text}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof BoardsError) {
        if (isJson) {
          console.log(jsonError(err.code, err.message));
        } else {
          console.error(err.message);
        }
        process.exitCode = 1;
      } else {
        throw err;
      }
    } finally {
      await destroy();
    }
  });

const deleteCommentCommand = new Command('delete')
  .description('Delete a comment')
  .argument('<comment-id>', 'Comment ID', parseInt)
  .option('--json', 'Output as JSON')
  .action(async (commentId, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      await store.deleteComment(commentId);

      if (isJson) {
        console.log(jsonOutput({ status: 'deleted', id: commentId }));
      } else {
        console.log(`Comment #${commentId} deleted.`);
      }
    } catch (err) {
      if (err instanceof BoardsError) {
        if (isJson) {
          console.log(jsonError(err.code, err.message));
        } else {
          console.error(err.message);
        }
        process.exitCode = 1;
      } else {
        throw err;
      }
    } finally {
      await destroy();
    }
  });

export const commentCommand = new Command('comment')
  .description('Manage comments on issues')
  .addCommand(addCommand)
  .addCommand(listCommand)
  .addCommand(deleteCommentCommand);
