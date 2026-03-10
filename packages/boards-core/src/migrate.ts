import type { Kysely } from 'kysely';
import { sql } from 'kysely';

type MigrationFn = (trx: Kysely<any>) => Promise<void>;

const migrations: { version: number; up: MigrationFn }[] = [
  { version: 1, up: applyV1Migration },
  { version: 2, up: applyV2Migration },
];

const CURRENT_SCHEMA_VERSION = migrations[migrations.length - 1]!.version;

async function applyV1Migration(trx: Kysely<any>): Promise<void> {
  // boards
  await trx.schema
    .createTable('boards')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('prefix', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  // issues
  await trx.schema
    .createTable('issues')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('board', 'text', (col) =>
      col.notNull().references('boards.id').onDelete('cascade'),
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('design', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('acceptance_criteria', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('notes', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('status', 'text', (col) =>
      col
        .notNull()
        .defaultTo('open')
        .check(sql`status IN ('open', 'in_progress', 'closed', 'deferred', 'blocked')`),
    )
    .addColumn('priority', 'integer', (col) =>
      col
        .notNull()
        .defaultTo(1)
        .check(sql`priority BETWEEN 0 AND 4`),
    )
    .addColumn('issue_type', 'text', (col) =>
      col
        .notNull()
        .defaultTo('task')
        .check(sql`issue_type IN ('task', 'bug', 'feature', 'epic', 'chore')`),
    )
    .addColumn('assignee', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('owner', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addColumn('closed_at', 'text')
    .addColumn('close_reason', 'text', (col) => col.notNull().defaultTo(''))
    .execute();

  // dependencies
  await trx.schema
    .createTable('dependencies')
    .addColumn('issue_id', 'text', (col) =>
      col.notNull().references('issues.id').onDelete('cascade'),
    )
    .addColumn('depends_on_id', 'text', (col) =>
      col.notNull().references('issues.id').onDelete('cascade'),
    )
    .addColumn('type', 'text', (col) =>
      col
        .notNull()
        .check(sql`type IN ('blocks', 'parent-child', 'related', 'discovered-from')`),
    )
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('pk_dependencies', ['issue_id', 'depends_on_id'])
    .execute();

  // labels
  await trx.schema
    .createTable('labels')
    .addColumn('issue_id', 'text', (col) =>
      col.notNull().references('issues.id').onDelete('cascade'),
    )
    .addColumn('label', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('pk_labels', ['issue_id', 'label'])
    .execute();

  // comments
  await trx.schema
    .createTable('comments')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('issue_id', 'text', (col) =>
      col.notNull().references('issues.id').onDelete('cascade'),
    )
    .addColumn('author', 'text', (col) => col.notNull())
    .addColumn('text', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  // indexes
  await trx.schema
    .createIndex('idx_issues_board')
    .on('issues')
    .column('board')
    .execute();

  await trx.schema
    .createIndex('idx_issues_board_status')
    .on('issues')
    .columns(['board', 'status'])
    .execute();

  await trx.schema
    .createIndex('idx_issues_board_priority')
    .on('issues')
    .columns(['board', 'priority'])
    .execute();

  await trx.schema
    .createIndex('idx_issues_assignee')
    .on('issues')
    .columns(['board', 'assignee'])
    .execute();

  await trx.schema
    .createIndex('idx_deps_depends_on')
    .on('dependencies')
    .column('depends_on_id')
    .execute();

  await trx.schema
    .createIndex('idx_labels_label')
    .on('labels')
    .column('label')
    .execute();

  await trx.schema
    .createIndex('idx_comments_issue_id')
    .on('comments')
    .column('issue_id')
    .execute();
}

async function applyV2Migration(trx: Kysely<any>): Promise<void> {
  // Add created_by and metadata to dependencies
  await trx.schema
    .alterTable('dependencies')
    .addColumn('created_by', 'text', (col) => col.notNull().defaultTo(''))
    .execute();

  await trx.schema
    .alterTable('dependencies')
    .addColumn('metadata', 'text')
    .execute();

  // Add resolution to issues
  await trx.schema
    .alterTable('issues')
    .addColumn('resolution', 'text', (col) => col.notNull().defaultTo(''))
    .execute();

  // SQLite doesn't support ALTER CHECK constraints, so we recreate the dependencies table
  // Actually, SQLite CHECK constraints on columns are only enforced at insert/update time
  // and can't be altered. But since we validate in the application layer (parseDependencyType),
  // we can drop the old table check. For safety, just update the app-layer validation.
  // The V1 CHECK constraint `type IN ('blocks', 'parent-child', 'related', 'discovered-from')` 
  // would reject 'conditional-blocks'. We need to work around this.
  
  // SQLite workaround: recreate the dependencies table with the updated CHECK
  await sql`CREATE TABLE dependencies_new (
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    depends_on_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('blocks', 'conditional-blocks', 'parent-child', 'related', 'discovered-from')),
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    metadata TEXT,
    PRIMARY KEY (issue_id, depends_on_id)
  )`.execute(trx);

  await sql`INSERT INTO dependencies_new (issue_id, depends_on_id, type, created_at, created_by, metadata)
    SELECT issue_id, depends_on_id, type, created_at, '', NULL FROM dependencies`.execute(trx);

  await sql`DROP TABLE dependencies`.execute(trx);

  await sql`ALTER TABLE dependencies_new RENAME TO dependencies`.execute(trx);

  // Recreate the index on depends_on_id
  await trx.schema
    .createIndex('idx_deps_depends_on')
    .on('dependencies')
    .column('depends_on_id')
    .execute();
}

export async function migrate(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('schema_migrations')
    .ifNotExists()
    .addColumn('version', 'integer', (col) => col.primaryKey())
    .addColumn('applied_at', 'text', (col) => col.notNull())
    .execute();

  const result = await db
    .selectFrom('schema_migrations')
    .select(sql<number>`COALESCE(MAX(version), 0)`.as('max_version'))
    .executeTakeFirst();

  const currentVersion = result?.max_version ?? 0;
  if (currentVersion >= CURRENT_SCHEMA_VERSION) return;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    await db.transaction().execute(async (trx: Kysely<any>) => {
      await migration.up(trx);

      await trx
        .insertInto('schema_migrations')
        .values({ version: migration.version, applied_at: new Date().toISOString() })
        .execute();
    });
  }
}
