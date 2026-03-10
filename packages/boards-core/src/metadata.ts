import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from './schema.js';
import type { Metadata } from './types.js';
import pkg from '../package.json';

const APP_VERSION: string = pkg.version;

export async function getMetadata(db: Kysely<Database>): Promise<Metadata> {
  try {
    const result = await db
      .selectFrom('schema_migrations')
      .select(sql<number>`COALESCE(MAX(version), 0)`.as('max_version'))
      .executeTakeFirst();

    return {
      version: APP_VERSION,
      schema_version: result?.max_version ?? 0,
    };
  } catch {
    return {
      version: APP_VERSION,
      schema_version: 0,
    };
  }
}
