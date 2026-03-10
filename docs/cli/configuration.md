---
layout: default
title: Configuration
---

# Configuration

The CLI resolves its configuration through a layered system of flags, environment variables, and config files.

## Database path resolution

The SQLite database path is resolved in this order:

1. **Repo config** — `.boards/config.toml` (walked up from current directory)
2. **Global config** — `~/.boards/config.toml`
3. **Default** — `~/.boards/store.db` (or `$BOARDS_HOME/store.db`)

```toml
# ~/.boards/config.toml
db_path = "/path/to/custom/store.db"
```

```toml
# .boards/config.toml (repo-level override)
db_path = "/path/to/project/store.db"
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `BOARDS_HOME` | Override the default `~/.boards/` directory |
| `BOARDS_SERVER` | Set a remote server URL (enables remote mode) |

## Remote mode

When a server URL is configured, the CLI sends all commands over HTTP to a `@boards/server` instance instead of accessing SQLite directly.

**Precedence** (highest to lowest):

```
--server <url> flag  →  BOARDS_SERVER env var  →  config file server key  →  local SQLite
```

**Example:**

```bash
# Via flag
bd --server http://localhost:3000 list --board api

# Via environment variable
export BOARDS_SERVER=http://localhost:3000
bd list --board api
```

### Local-only commands

- `bd init` — errors with "init is not available in remote mode"
- `bd config` — works in both modes (manages local CLI configuration)
- `bd version` — calls `GET /api/v1/metadata` in remote mode

## Config file format

Config files use TOML format at `~/.boards/config.toml` (global) or `.boards/config.toml` (repo-level):

```toml
# Database path (local mode)
db_path = "~/.boards/store.db"

# Remote server (enables remote mode)
server = "http://localhost:3000"
```

Repo-level config takes precedence over global config. Flags and environment variables take precedence over both.
