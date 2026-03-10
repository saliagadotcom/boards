---
layout: default
title: CLI Overview
---

# CLI Overview

The `bd` CLI is the primary interface for Boards. It's built with Commander.js, runs on Bun, and can be compiled to a standalone binary.

## Installation

```bash
# Install from npm
bun install -g @saliagadotcom/boards-cli

# Or build from source
git clone https://github.com/saliagadotcom/boards.git
cd boards
just install
```

## First steps

```bash
# Initialize the database
bd init

# Create a board
bd board create api

# Create an issue
bd create "Implement login endpoint" --board api --type feature --priority 0

# See what's ready to work on
bd ready --board api
```

## Modes of operation

The CLI supports two modes — **local** and **remote**:

| Mode | How it works | When to use |
|------|-------------|-------------|
| **Local** | Reads/writes a SQLite database directly | Default. Single-user or agent workflows. |
| **Remote** | Sends HTTP requests to a `@boards/server` instance | Multi-user or when the server is the source of truth. |

Mode is selected automatically based on configuration precedence:

```
--server flag  >  BOARDS_SERVER env  >  config server  >  local SQLite
```

See [Configuration](configuration) for details.

## JSON output

Every command supports `--json` for machine-readable output:

```bash
bd list --board api --json
bd create "Fix bug" --board api --json
```

Errors in JSON mode are returned as:

```json
{ "error": { "code": "not_found", "message": "Issue not found" } }
```

## Next steps

- [Command reference](commands) — every `bd` subcommand with arguments, flags, and examples
- [Configuration](configuration) — database paths, config files, and environment variables
