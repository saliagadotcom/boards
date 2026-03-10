import type { IBoardsStore } from '@saliagadotcom/boards-core';
import { createStore, migrate } from '@saliagadotcom/boards-core';
import { createRemoteStore } from '@saliagadotcom/boards-client';
import { existsSync, statSync, copyFileSync } from 'node:fs';
import { openDatabase } from './db.js';
import type { ResolvedConfig } from './config.js';

export type StoreMode = 'local' | 'remote';

export interface ResolvedStore {
  store: IBoardsStore;
  mode: StoreMode;
  destroy: () => Promise<void>;
}

export function backupPath(dbPath: string): string {
  return dbPath + '.bak';
}

export function restoreBackup(dbPath: string): boolean {
  const bak = backupPath(dbPath);
  if (!existsSync(bak) || statSync(bak).size === 0) return false;
  copyFileSync(bak, dbPath);
  return true;
}

function createBackup(dbPath: string): void {
  if (existsSync(dbPath) && statSync(dbPath).size > 0) {
    copyFileSync(dbPath, backupPath(dbPath));
  }
}

export async function resolveStore(config: ResolvedConfig): Promise<ResolvedStore> {
  if (config.server) {
    return {
      store: createRemoteStore(config.server),
      mode: 'remote',
      destroy: async () => {},
    };
  }

  const db = openDatabase(config.db_path);
  const store = createStore(db);
  await migrate(db);

  // Shadow-copy after successful open + migrate
  createBackup(config.db_path);

  return {
    store,
    mode: 'local',
    destroy: () => db.destroy(),
  };
}
