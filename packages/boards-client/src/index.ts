export { RemoteBoardsStore } from './remote-store.js';

import type { IBoardsStore } from '@saliagadotcom/boards-core';
import { RemoteBoardsStore } from './remote-store.js';

export function createRemoteStore(baseUrl: string): IBoardsStore {
  return new RemoteBoardsStore(baseUrl);
}
