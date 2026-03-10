---
name: boards
description: Manages issues with the boards CLI for agent-driven workflows. Use when tracking work, creating issues, managing dependencies, or finding ready tasks.
---

# Using Boards

Local-first issue tracker with dependency-aware ready-work queue. Stores everything in SQLite.

## Setup

```bash
bd init                          # Creates ~/.boards/ with DB + config
bd board create <name>           # Create a board (lowercase, e.g. "api")
bd board use <name>              # Set default board
```

## Agent Workflow

```bash
bd ready                         # Find unblocked open issues
bd claim <id>                    # Atomically claim (sets assignee + in_progress)
# ... do work ...
bd close <id>                    # Complete issue
```

## Issue Management

```bash
bd create "Title" --type bug --priority 0 --label critical
bd list --status open
bd show <id>
bd update <id> --status in_progress --assignee alice
bd delete <id>
bd search "keyword"
```

## Dependencies

```bash
bd dep add <id> <blocker-id>              # blocker-id blocks id
bd dep add <id> <parent> --type parent-child
bd dep remove <id> <dep-id>
bd dep list <id>
```

Dependency types: `blocks`, `related`, `parent-child`, `discovered-from`
Only `blocks` prevents issues from appearing in `ready`.

## Boards

```bash
bd board create <name>
bd board list
bd board delete <name>
bd board use [name]              # Set/show default board
```

## Labels

```bash
bd label add <id> "label"
bd label remove <id> "label"
```

## Epics

```bash
bd epic status                   # Show epic completion progress
bd epic status --eligible-only   # Show only epics ready to close
bd epic close-eligible           # Close epics where all children are done
bd epic close-eligible --dry-run # Preview without closing
```

Epics are containers, not actionable work. They are excluded from `bd ready` by default.
Close epics by closing all their children, then running `bd epic close-eligible`.

## Key Concepts

- **Board**: Named container for issues. IDs are prefixed: `api-a3f2dd`
- **Ready**: Open non-epic issues with no unresolved `blocks` dependencies (epics are containers, excluded by default)
- **Claim**: Atomic operation — sets assignee + status in one step, prevents races
- **Priority**: 0 (highest) to 4 (lowest)
- **Status flow**: open, in_progress, closed, deferred, blocked (all transitions allowed)
- **Issue types**: task, bug, feature, epic (container — excluded from `ready`), chore

## JSON Output

Append `--json` to any command for machine-readable output.
Errors: `{ "error": { "code": "...", "message": "..." } }`

## Database Backup

The database is automatically backed up (`store.db.bak`) on every CLI command. If the database is accidentally deleted, restore it:

```bash
bd db restore
```

## DB Discovery

1. `BOARDS_HOME` env var (overrides home directory, default: `~/.boards`)
2. Repo config: `.boards/config.toml` (walks up from CWD)
3. Global config: `$BOARDS_HOME/config.toml`
4. Default: `$BOARDS_HOME/store.db`
