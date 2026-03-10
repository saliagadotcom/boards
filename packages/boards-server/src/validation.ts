import { BoardsError } from '@saliagadotcom/boards-core';
import type { BoardsStore } from '@saliagadotcom/boards-core';

export {
  parseStatus,
  parseIssueType,
  parseDependencyType,
  parseDirection,
  parsePriority,
} from '@saliagadotcom/boards-core';

export async function requireBoardIssue(
  store: BoardsStore,
  board: string,
  id: string,
): Promise<void> {
  if (board === '_' && id === '_') return;
  const detail = await store.showIssue(id);
  if (board !== '_' && detail.issue.board !== board) {
    throw new BoardsError('not_found', `Issue "${id}" not found`);
  }
}
