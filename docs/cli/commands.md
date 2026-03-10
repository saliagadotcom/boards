---
layout: default
title: Command Reference
---

# Command Reference

## Global flags

| Flag | Description |
|------|-------------|
| `--server <url>` | Connect to a remote `@boards/server` instance |
| `--json` | Output machine-readable JSON |
| `--help` | Show help for any command |
| `--version` | Print version |

## bd init

Initialize the Boards database and configuration directory.

```bash
bd init
```

Creates `~/.boards/` with the SQLite database and default configuration. Not available in remote mode.

## bd create

Create a new issue.

```bash
bd create <title> [options]
```

| Option | Description |
|--------|-------------|
| `--board <name>` | Target board (required if no default set) |
| `--type <type>` | Issue type: `task`, `bug`, `feature`, `epic`, `chore` |
| `--priority <n>` | Priority: `0` (highest) to `4` (lowest) |
| `--label <label>` | Add a label (repeatable) |
| `--assignee <name>` | Assign to a user |
| `--parent <id>` | Create with a parent-child dependency (atomic) |
| `--json` | JSON output |

**Examples:**

```bash
bd create "Fix login bug" --board api --type bug --priority 0
bd create "Add tests" --board api --parent api-a3f2dd
```

When `--parent` is specified, the issue and parent-child dependency are created in a single transaction. The parent must be on the same board.

## bd list

List issues on a board.

```bash
bd list [options]
```

| Option | Description |
|--------|-------------|
| `--board <name>` | Target board |
| `--status <status>` | Filter by status |
| `--json` | JSON output |

## bd show

Show full details for an issue, including comments.

```bash
bd show <id> [--json]
```

## bd update

Update an existing issue.

```bash
bd update <id> [options]
```

| Option | Description |
|--------|-------------|
| `--status <status>` | New status: `open`, `in_progress`, `closed`, `deferred`, `blocked` |
| `--priority <n>` | New priority |
| `--assignee <name>` | New assignee |
| `-l, --label <label>` | Add a label (repeatable) |
| `--set-labels <label>` | Replace all labels (repeatable) |
| `--clear-labels` | Remove all labels |
| `--json` | JSON output |

`--label` and `--set-labels` are mutually exclusive. `--set-labels` atomically replaces all labels. `--clear-labels` removes all labels.

## bd delete

Delete one or more issues.

```bash
bd delete <id...> [--force] [--json]
```

Multiple IDs are deleted in a single transaction. Without `--force`, a confirmation prompt lists all IDs. JSON output:

```json
{ "deleted": ["api-a3f2dd"], "not_found": [] }
```

## bd close

Close an issue.

```bash
bd close <id> [options]
```

| Option | Description |
|--------|-------------|
| `--resolution <resolution>` | Close resolution: `completed` (default), `fixed`, `duplicate`, `failed`, `rejected`, `canceled` |
| `--reason <text>` | Reason for closing |
| `--json` | JSON output |

Closing an already-closed issue is a no-op (idempotent).

## bd fail

Close an issue as failed (shorthand for `bd close --resolution failed`).

```bash
bd fail <id> [--reason <text>] [--json]
```

## bd complete

Close an issue as completed (shorthand for `bd close --resolution completed`).

```bash
bd complete <id> [--reason <text>] [--json]
```

## bd reopen

Reopen a closed issue.

```bash
bd reopen <id> [--status <status>] [--json]
```

| Option | Description |
|--------|-------------|
| `--status <status>` | Target status: `open` (default), `in_progress`, `deferred`, `blocked` |

Idempotent on already-open issues. Clears `closed_at`.

## bd ready

List issues ready to work on — open, non-epic issues with no unresolved `blocks` or `conditional-blocks` dependencies.

```bash
bd ready [--board <name>] [--json]
```

## bd claim

Atomically claim an issue — sets assignee and status to `in_progress` in one step.

```bash
bd claim <id> --assignee <name> [--json]
```

## bd search

Search issues by text.

```bash
bd search <query> [--board <name>] [--json]
```

## bd board

Manage boards.

```bash
bd board create <name>
bd board list [--json]
bd board delete <name>
bd board use [<name>]
```

`bd board use` with no argument shows the current default board. With a name, sets it.

## bd dep

Manage dependencies between issues.

```bash
bd dep add <id> <blocker-id> [--type <type>] [--created-by <author>] [--metadata <json>]
bd dep remove <id> <dep-id>
bd dep list <id> [--json]
```

| Dependency type | Description |
|----------------|-------------|
| `blocks` | Blocker prevents the issue from appearing in `ready` |
| `conditional-blocks` | Blocks while upstream is open; on success close auto-closes dependent, on failure close unblocks dependent |
| `related` | Informational link, no effect on ready queue |
| `parent-child` | Hierarchical relationship |
| `discovered-from` | Traceability link |

Default type is `blocks`.

| Option | Description |
|--------|-------------|
| `--created-by <author>` | Who created this dependency |
| `--metadata <json>` | JSON metadata for the dependency |

## bd label

Add or remove labels from an issue.

```bash
bd label add <id> <label>
bd label remove <id> <label>
```

## bd comment

Manage comments on issues.

```bash
bd comment add <issue-id> <text> [--author <name>] [--json]
bd comment list <issue-id> [--json]
bd comment delete <comment-id> [--json]
```

- `add` creates a comment. Author defaults to `"anonymous"`.
- `list` returns comments ordered by creation time. Empty issues return `[]`.
- `delete` is idempotent — no error if the comment doesn't exist.

## bd epic

Manage epics (container issues).

```bash
bd epic status [--board <name>] [--eligible-only] [--json]
bd epic close-eligible [--board <name>] [--dry-run] [--json]
```

Epics are containers, not actionable work. They're excluded from `bd ready`. Close epics by closing all their children, then running `bd epic close-eligible`.

## bd db

Database management.

```bash
bd db restore
```

Restores the database from its shadow backup (`store.db.bak`). Use when the database file has been accidentally deleted or corrupted.

A shadow backup is automatically created every time the CLI opens the database. No manual backup step is needed.

## bd config

Show the resolved configuration.

```bash
bd config [--json]
```

Works in both local and remote modes.

## bd version

Print version information.

```bash
bd version [--json]
```

JSON output:

```json
{ "version": "1.0.0", "schema_version": 3 }
```

Returns `schema_version: 0` if no database exists or it hasn't been migrated.

## bd skill

Output the Boards skill document for AI agents.

```bash
bd skill
```
