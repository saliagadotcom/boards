# Changelog

## 0.2.0

### Added

- **Database backup & restore** — A shadow backup (`store.db.bak`) is automatically created every time the CLI opens the database. Restore with `bd db restore` if the database is accidentally deleted or corrupted.
- **`bd db restore` command** — Manually restore the database from its shadow backup.
- **`conditional-blocks` dependency type** — Dependencies that auto-close the dependent issue when the upstream is completed, or unblock it when the upstream fails.
- **`created_by` and `metadata` fields on dependencies** — Track who created a dependency and attach arbitrary JSON metadata.
- **`resolution` field on issues** — Close issues with a resolution: `completed`, `fixed`, `duplicate`, `failed`, `rejected`, `canceled`.
- **`bd fail` command** — Shorthand for `bd close --resolution failed`.
- **`bd complete` command** — Shorthand for `bd close --resolution completed`.
- **V2 schema migration** — Automatically applied on first use.

## 0.1.0

Initial release.
