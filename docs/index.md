---
layout: default
title: Boards
---

# Boards

Boards is a local-first, agent-oriented issue tracker. It stores everything in SQLite.

- **CLI** (`bd`) — manage issues, boards, dependencies, and labels from the terminal

## Quick start

```bash
# Install the CLI
bun install -g @saliagadotcom/boards-cli

# Initialize the database
bd init

# Create a board and start tracking work
bd board create myproject
bd create "First issue" --board myproject
bd list --board myproject
```

## Key concepts

- **Board** — a named container for issues. Issue IDs are prefixed with the board name (e.g., `myproject-a3f2dd`).
- **Ready queue** — `bd ready` returns open, non-epic issues with no unresolved blockers. This is the primary interface for agents.
- **Claim** — `bd claim` atomically sets the assignee and status to `in_progress`, preventing races between multiple agents.
- **Dependencies** — issues can block each other, be related, or have parent-child relationships. `blocks` and `conditional-blocks` dependencies affect the ready queue.
- **Resolutions** — when closing an issue, a resolution (`completed`, `fixed`, `duplicate`, `failed`, `rejected`, `canceled`) determines what happens to `conditional-blocks` dependents.

## Architecture

```
┌─────────────┐
│ @boards/cli │
│ Commander.js│
└──────┬──────┘
       │
       ▼
┌───────────────────────────────┐
│          @boards/core         │
│  Boards · Issues · Deps · …  │
└───────────────┬───────────────┘
                │
                ▼
         ┌────────────┐
         │   SQLite    │
         └────────────┘
```

## Next steps

- [CLI reference](cli/commands) — full command reference for `bd`
