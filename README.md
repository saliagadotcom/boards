# Boards

A local-first issue tracker built with TypeScript and Bun. Stores everything in SQLite.

## Packages

| Package | Description |
|---------|-------------|
| `@boards/core` | Core library — storage, migrations, domain logic (Kysely + SQLite) |
| `@boards/cli` | CLI interface (Commander.js) |
| `@boards/server` | REST API (Hono) |
| `@boards/client` | Remote client for connecting to `@boards/server` |
| `@boards/tui` | Terminal UI (Ink) |

## Install

### Homebrew (macOS/Linux)

```bash
brew tap saliagadotcom/boards
brew install --cask saliagadotcom/boards/bd
```

### Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/saliagadotcom/boards/main/scripts/install.sh | bash
```

### Build from Source

```bash
bun install
just install    # builds ./dist/bd and installs to ~/.local/bin
```

## Quickstart

```bash
bd init
bd board create myproject
bd create "Fix login bug" --type bug
bd list
bd ready
```

### CLI Commands

**Issues** (top-level verbs):
```
create <title>       Create an issue
list                 List issues (--status, --type, --assignee)
show <id>            View issue details
update <id>          Update an issue
close <id>           Close an issue
fail <id>            Close as failed (unblocks conditional dependents)
complete <id>        Close as completed (auto-closes conditional dependents)
reopen <id>          Reopen a closed issue
delete <id>          Delete an issue
claim <id>           Assign an issue and set in_progress
ready                Show unblocked work
search <query>       Search issues
status               Show board status summary
```

**Boards** (`bd board <verb>`):
```
board create <name>  Create a board
board list           List all boards
board delete <name>  Delete a board
board use [name]     Set/show default board
```

**Dependencies & Labels**:
```
dep add/remove/list  Manage dependencies
label add/remove     Manage labels
comment add/list/delete  Manage comments
```

**Epics**:
```
epic status          Show epic status
epic close-eligible  Close completed epics
```

**Other**:
```
config               Show configuration
init                 Initialize workspace
tui                  Launch terminal UI
version              Print version info
skill                Output agent skill document
```

### API Server

> **Work in progress** — the REST API server is not yet ready for production use.

## Development

```bash
# Type-check
bunx tsc --build

# Run tests
bun test
```
